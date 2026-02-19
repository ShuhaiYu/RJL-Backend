/**
 * Task Service
 *
 * Business logic for Task entity.
 */

const taskRepository = require('../repositories/taskRepository');
const propertyRepository = require('../repositories/propertyRepository');
const userRepository = require('../repositories/userRepository');
const { NotFoundError, ForbiddenError } = require('../lib/errors');
const { USER_ROLES } = require('../config/constants');
const { createPagination } = require('../lib/response');

const taskService = {
  /**
   * Get task by ID
   */
  async getTaskById(id, requestingUser) {
    const task = await taskRepository.findByIdWithRelations(id);
    if (!task) {
      throw new NotFoundError('Task');
    }

    // Check access
    if (!this.canAccessTask(requestingUser, task)) {
      throw new ForbiddenError('Cannot access this task');
    }

    return this.formatTask(task);
  },

  /**
   * List tasks with filters
   */
  async listTasks(requestingUser, { search, page = 1, limit = 50, property_id, status, type }) {
    const skip = (page - 1) * limit;
    const scope = await this.buildTaskScope(requestingUser);

    // Status is stored as uppercase with underscores (e.g., DUE_SOON, COMPLETED)
    // Type is stored as-is (SMOKE_ALARM, GAS_&_ELECTRICITY)

    const filters = {
      ...scope,
      skip,
      take: limit,
      search,
      propertyId: property_id,
      status,
      type,
    };

    const { tasks, total } = await taskRepository.findAll(filters);

    return {
      tasks: tasks.map(this.formatTask),
      pagination: createPagination(page, limit, total),
    };
  },

  /**
   * Get tasks due today
   */
  async getTasksDueToday(requestingUser) {
    const scope = await this.buildTaskScope(requestingUser);
    const tasks = await taskRepository.findDueToday(scope.agencyId, scope.userIds);
    return tasks.map(this.formatTask);
  },

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(requestingUser) {
    const scope = await this.buildTaskScope(requestingUser);
    return taskRepository.getDashboardStats(scope.agencyId, scope.userIds);
  },

  /**
   * Create a new task
   */
  async createTask(data, requestingUser) {
    // Verify property access
    const property = await propertyRepository.findByIdWithRelations(data.property_id);
    if (!property) {
      throw new NotFoundError('Property');
    }

    if (!this.canAccessProperty(requestingUser, property)) {
      throw new ForbiddenError('Cannot create task for this property');
    }

    // Determine agency_id:
    // 1. If current user has agency, use user's agency_id (cannot be overridden)
    // 2. If current user has no agency, accept agency_id from frontend
    let agencyId;
    if (requestingUser.agency_id) {
      agencyId = requestingUser.agency_id;
    } else {
      agencyId = data.agency_id;
    }
    
    // Validate that agency_id is available
    if (!agencyId) {
      throw new Error('Agency ID is required to create a task');
    }

    const task = await taskRepository.create({
      ...data,
      agency_id: agencyId,
    });

    return taskRepository.findByIdWithRelations(task.id);
  },

  /**
   * Create multiple tasks (batch)
   */
  async createTasks(data, requestingUser) {
    const { property_ids, ...taskData } = data;

    // Verify access to all properties
    const properties = await Promise.all(
      property_ids.map((id) => propertyRepository.findByIdWithRelations(id))
    );

    for (const property of properties) {
      if (!property) {
        throw new NotFoundError('Property');
      }
      if (!this.canAccessProperty(requestingUser, property)) {
        throw new ForbiddenError('Cannot create task for one or more properties');
      }
    }

    // Create tasks for each property
    const tasksData = properties.map((property) => ({
      ...taskData,
      property_id: property.id,
      agency_id: property.user?.agencyId,
    }));

    const result = await taskRepository.createMany(tasksData);
    return { count: result.count };
  },

  /**
   * Update a task
   */
  async updateTask(id, data, requestingUser) {
    const task = await taskRepository.findByIdWithRelations(id);
    if (!task) {
      throw new NotFoundError('Task');
    }

    // Check access
    if (!this.canModifyTask(requestingUser, task)) {
      throw new ForbiddenError('Cannot modify this task');
    }

    // If changing property, verify access
    if (data.property_id && data.property_id !== task.propertyId) {
      const newProperty = await propertyRepository.findByIdWithRelations(data.property_id);
      if (!newProperty) {
        throw new NotFoundError('Property');
      }
      if (!this.canAccessProperty(requestingUser, newProperty)) {
        throw new ForbiddenError('Cannot move task to this property');
      }
    }

    // Handle UNKNOWN status transition with multi-select types
    // When selected_types is provided, split into multiple tasks
    if (task.status?.toUpperCase() === 'UNKNOWN' && Array.isArray(data.selected_types) && data.selected_types.length > 0) {
      const newTasks = [];

      for (const selectedType of data.selected_types) {
        // Generate task name based on type
        let taskName = task.taskName;
        // If original task is SAFETY_CHECK, append type to name
        if (task.type === 'SAFETY_CHECK') {
          const typeSuffix = selectedType === 'SMOKE_ALARM' ? 'Smoke Alarm' : 'Gas & Electricity';
          taskName = `${task.taskName} - ${typeSuffix}`;
        }

        const newTask = await taskRepository.create({
          property_id: task.propertyId,
          agency_id: task.agencyId,
          task_name: taskName,
          task_description: task.taskDescription,
          due_date: task.dueDate,
          email_id: task.emailId,
          repeat_frequency: task.repeatFrequency,
          type: selectedType,
          status: data.status || 'INCOMPLETE',
          free_check_available: task.freeCheckAvailable,
        });
        newTasks.push(newTask);
      }

      // Soft delete the original UNKNOWN task
      await taskRepository.softDelete(id);

      // Handle archive_conflicts if provided
      if (data.archive_conflicts && newTasks.length > 0) {
        await this.archiveConflictingTasks(newTasks[0], task.propertyId);
      }

      // Return the first new task with full relations
      return taskRepository.findByIdWithRelations(newTasks[0].id);
    }

    await taskRepository.update(id, data);
    return taskRepository.findByIdWithRelations(id);
  },

  /**
   * Archive conflicting tasks for the same property with similar type
   */
  async archiveConflictingTasks(newTask, propertyId) {
    const prisma = require('../config/prisma');

    // Find other UNKNOWN tasks for the same property (excluding the new task)
    const conflictingTasks = await prisma.task.findMany({
      where: {
        propertyId: propertyId,
        isActive: true,
        status: { equals: 'UNKNOWN', mode: 'insensitive' },
        id: { not: newTask.id },
      },
    });

    // Soft delete conflicting tasks
    for (const conflictTask of conflictingTasks) {
      await taskRepository.softDelete(conflictTask.id);
    }

    return conflictingTasks.length;
  },

  /**
   * Delete a task (soft delete)
   */
  async deleteTask(id, requestingUser) {
    const task = await taskRepository.findByIdWithRelations(id);
    if (!task) {
      throw new NotFoundError('Task');
    }

    // Check access
    if (!this.canModifyTask(requestingUser, task)) {
      throw new ForbiddenError('Cannot delete this task');
    }

    return taskRepository.softDelete(id);
  },

  /**
   * Build task scope based on user role
   */
  async buildTaskScope(requestingUser) {
    if (['superuser', 'admin'].includes(requestingUser.role)) {
      return { isActive: true };
    }
    if (requestingUser.role === USER_ROLES.AGENCY_ADMIN) {
      return { isActive: true, agencyId: requestingUser.agency_id };
    }
    // Agency user: get user IDs in scope
    return { isActive: true, userIds: [requestingUser.user_id] };
  },

  /**
   * Check if user can access task
   */
  canAccessTask(requestingUser, task) {
    if (['superuser', 'admin'].includes(requestingUser.role)) return true;
    if (requestingUser.role === USER_ROLES.AGENCY_ADMIN) {
      return task.agencyId === requestingUser.agency_id;
    }
    return task.property?.userId === requestingUser.user_id;
  },

  /**
   * Check if user can modify task
   */
  canModifyTask(requestingUser, task) {
    return this.canAccessTask(requestingUser, task);
  },

  /**
   * Check if user can access property
   */
  canAccessProperty(requestingUser, property) {
    if (['superuser', 'admin'].includes(requestingUser.role)) return true;
    if (requestingUser.role === USER_ROLES.AGENCY_ADMIN) {
      return property.user?.agencyId === requestingUser.agency_id;
    }
    return property.userId === requestingUser.user_id;
  },

  /**
   * Format task for API response
   */
  formatTask(task) {
    const formatted = {
      id: task.id,
      property_id: task.propertyId,
      task_name: task.taskName,
      task_description: task.taskDescription,
      due_date: task.dueDate,
      inspection_date: task.inspectionDate,
      repeat_frequency: task.repeatFrequency,
      type: task.type,
      status: task.status,
      is_active: task.isActive,
      agency_id: task.agencyId,
      email_id: task.emailId,
      free_check_available: task.freeCheckAvailable,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    };

    if (task.property) {
      formatted.property = {
        id: task.property.id,
        address: task.property.address,
      };
      // Flat field for frontend compatibility
      formatted.property_address = task.property.address;

      if (task.property.user) {
        formatted.user = {
          id: task.property.user.id,
          name: task.property.user.name,
          email: task.property.user.email,
        };

        // Include agency_name if available
        if (task.property.user.agency) {
          formatted.agency_name = task.property.user.agency.agencyName;
        }
      }

      if (task.property.contacts) {
        formatted.contacts = task.property.contacts.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email,
        }));
      }
    }

    if (task.files) {
      formatted.files = task.files.map((f) => ({
        id: f.id,
        file_name: f.fileName,
        file_s3_key: f.fileS3Key,
        file_desc: f.fileDesc,
      }));
    }

    // 每个 task 关联一个 email，但前端期望 emails 数组格式
    if (task.email) {
      formatted.emails = [{
        id: task.email.id,
        subject: task.email.subject,
        sender: task.email.sender,
        email_body: task.email.emailBody,
        process_note: task.email.processNote,
      }];
    }

    return formatted;
  },
};

module.exports = taskService;
