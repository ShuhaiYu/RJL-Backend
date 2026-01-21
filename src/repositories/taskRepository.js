/**
 * Task Repository
 *
 * Data access layer for Task entity using Prisma.
 */

const prisma = require('../config/prisma');

const taskRepository = {
  /**
   * Find task by ID
   */
  async findById(id) {
    return prisma.task.findUnique({
      where: { id },
    });
  },

  /**
   * Find task by ID with relations
   */
  async findByIdWithRelations(id) {
    return prisma.task.findUnique({
      where: { id },
      include: {
        property: {
          include: {
            user: {
              include: {
                agency: true,
              },
            },
            contacts: {
              where: { isActive: true },
            },
          },
        },
        email: true,
        files: true,
      },
    });
  },

  /**
   * Find all tasks with filters and pagination
   */
  async findAll({ isActive = true, propertyId, agencyId, userIds, status, type, search, skip = 0, take = 50 }) {
    let where = {
      ...(isActive !== undefined && { isActive }),
      ...(propertyId && { propertyId }),
      ...(agencyId && { agencyId }),
      ...(status && { status }),
      ...(type && { type }),
      ...(search && {
        OR: [
          { taskName: { contains: search, mode: 'insensitive' } },
          { taskDescription: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    // Filter by user IDs (for agency users)
    if (userIds && userIds.length > 0) {
      where = {
        ...where,
        property: {
          userId: { in: userIds },
        },
      };
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          property: {
            include: {
              user: true,
              contacts: {
                where: { isActive: true },
              },
            },
          },
          files: true,
        },
        skip,
        take,
        orderBy: { dueDate: 'asc' },
      }),
      prisma.task.count({ where }),
    ]);

    return { tasks, total };
  },

  /**
   * Find tasks due today
   */
  async findDueToday(agencyId, userIds) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let where = {
      isActive: true,
      dueDate: {
        gte: today,
        lt: tomorrow,
      },
    };

    if (agencyId) where.agencyId = agencyId;
    if (userIds && userIds.length > 0) {
      where.property = {
        userId: { in: userIds },
      };
    }

    return prisma.task.findMany({
      where,
      include: {
        property: {
          include: {
            user: true,
            contacts: { where: { isActive: true } },
          },
        },
        files: true,
      },
      orderBy: { dueDate: 'asc' },
    });
  },

  /**
   * Get dashboard statistics
   * Returns format: { unknown_count, incomplete_count, processing_count, completed_count, due_soon_count, expired_count, agency_count, property_count }
   */
  async getDashboardStats(agencyId, userIds) {
    // Admin/Superuser (no agency restriction)
    if (!agencyId && (!userIds || userIds.length === 0)) {
      const result = await prisma.$queryRaw`
        SELECT
          (SELECT COUNT(*) FROM "TASK" WHERE is_active = true AND status = 'unknown')::int AS unknown_count,
          (SELECT COUNT(*) FROM "TASK" WHERE is_active = true AND status = 'incomplete')::int AS incomplete_count,
          (SELECT COUNT(*) FROM "TASK" WHERE is_active = true AND status = 'processing')::int AS processing_count,
          (SELECT COUNT(*) FROM "TASK" WHERE is_active = true AND status = 'completed')::int AS completed_count,
          (SELECT COUNT(*) FROM "TASK" WHERE is_active = true AND status = 'due soon')::int AS due_soon_count,
          (SELECT COUNT(*) FROM "TASK" WHERE is_active = true AND status = 'expired')::int AS expired_count,
          (SELECT COUNT(*) FROM "AGENCY" WHERE is_active = true)::int AS agency_count,
          (SELECT COUNT(*) FROM "PROPERTY" WHERE is_active = true)::int AS property_count
      `;
      return result[0];
    }

    // Agency user - filter by agencyId
    if (agencyId) {
      const result = await prisma.$queryRaw`
        SELECT
          0::int AS unknown_count,
          (SELECT COUNT(*) FROM "TASK" WHERE is_active = true AND status = 'incomplete' AND agency_id = ${agencyId})::int AS incomplete_count,
          (SELECT COUNT(*) FROM "TASK" WHERE is_active = true AND status = 'processing' AND agency_id = ${agencyId})::int AS processing_count,
          (SELECT COUNT(*) FROM "TASK" WHERE is_active = true AND status = 'completed' AND agency_id = ${agencyId})::int AS completed_count,
          (SELECT COUNT(*) FROM "TASK" WHERE is_active = true AND status = 'due soon' AND agency_id = ${agencyId})::int AS due_soon_count,
          (SELECT COUNT(*) FROM "TASK" WHERE is_active = true AND status = 'expired' AND agency_id = ${agencyId})::int AS expired_count,
          (SELECT COUNT(*) FROM "PROPERTY" p JOIN "USER" u ON p.user_id = u.id WHERE p.is_active = true AND u.agency_id = ${agencyId})::int AS property_count
        `;
      return { ...result[0], agency_count: undefined };
    }

    // Fallback - shouldn't reach here
    return {
      unknown_count: 0,
      incomplete_count: 0,
      processing_count: 0,
      completed_count: 0,
      due_soon_count: 0,
      expired_count: 0,
      agency_count: 0,
      property_count: 0,
    };
  },

  /**
   * Create a new task
   */
  async create(data) {
    return prisma.task.create({
      data: {
        propertyId: data.property_id,
        agencyId: data.agency_id,
        taskName: data.task_name,
        taskDescription: data.task_description,
        dueDate: data.due_date ? new Date(data.due_date) : null,
        inspectionDate: data.inspection_date ? new Date(data.inspection_date) : null,
        repeatFrequency: data.repeat_frequency || 'none',
        type: data.type,
        status: data.status || 'unknown',
        emailId: data.email_id,
        freeCheckAvailable: data.free_check_available || false,
      },
      include: {
        property: true,
      },
    });
  },

  /**
   * Create multiple tasks (batch)
   */
  async createMany(tasksData) {
    const tasks = tasksData.map((data) => ({
      propertyId: data.property_id,
      agencyId: data.agency_id,
      taskName: data.task_name,
      taskDescription: data.task_description,
      dueDate: data.due_date ? new Date(data.due_date) : null,
      inspectionDate: data.inspection_date ? new Date(data.inspection_date) : null,
      repeatFrequency: data.repeat_frequency || 'none',
      type: data.type,
      status: data.status || 'unknown',
      emailId: data.email_id,
      freeCheckAvailable: data.free_check_available || false,
    }));

    return prisma.task.createMany({
      data: tasks,
    });
  },

  /**
   * Update a task
   */
  async update(id, data) {
    const updateData = {};
    if (data.property_id !== undefined) updateData.propertyId = data.property_id;
    if (data.task_name !== undefined) updateData.taskName = data.task_name;
    if (data.task_description !== undefined) updateData.taskDescription = data.task_description;
    if (data.due_date !== undefined) updateData.dueDate = data.due_date ? new Date(data.due_date) : null;
    if (data.inspection_date !== undefined) updateData.inspectionDate = data.inspection_date ? new Date(data.inspection_date) : null;
    if (data.repeat_frequency !== undefined) updateData.repeatFrequency = data.repeat_frequency;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.is_active !== undefined) updateData.isActive = data.is_active;
    if (data.free_check_available !== undefined) updateData.freeCheckAvailable = data.free_check_available;

    return prisma.task.update({
      where: { id },
      data: updateData,
    });
  },

  /**
   * Soft delete a task
   */
  async softDelete(id) {
    return prisma.task.update({
      where: { id },
      data: { isActive: false },
    });
  },

  /**
   * Update task statuses for expiring tasks
   * 1. completed + due_date within 60 days -> due soon
   * 2. due soon + past due_date -> expired
   */
  async updateExpiredStatuses() {
    const now = new Date();
    const sixtyDaysFromNow = new Date();
    sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);

    // Update completed -> due soon (due within 60 days, not yet expired)
    const dueSoonResult = await prisma.task.updateMany({
      where: {
        status: 'completed',
        isActive: true,
        dueDate: {
          lte: sixtyDaysFromNow,
          gte: now,
        },
      },
      data: { status: 'due soon' },
    });

    // Update due soon -> expired (past due date)
    const expiredResult = await prisma.task.updateMany({
      where: {
        status: 'due soon',
        isActive: true,
        dueDate: { lt: now },
      },
      data: { status: 'expired' },
    });

    return {
      dueSoon: dueSoonResult.count,
      expired: expiredResult.count,
    };
  },

  /**
   * Find tasks due today or 60 days ago for reminders
   * Logic: tasks with status incomplete and due_date is today or 60 days ago
   */
  async findTasksForReminder() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const sixtyDaysAgo = new Date(today);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const sixtyDaysAgoPlusOne = new Date(sixtyDaysAgo);
    sixtyDaysAgoPlusOne.setDate(sixtyDaysAgoPlusOne.getDate() + 1);

    return prisma.task.findMany({
      where: {
        isActive: true,
        status: 'incomplete',
        OR: [
          {
            dueDate: {
              gte: today,
              lt: tomorrow,
            },
          },
          {
            dueDate: {
              gte: sixtyDaysAgo,
              lt: sixtyDaysAgoPlusOne,
            },
          },
        ],
      },
      include: {
        property: {
          include: {
            user: {
              include: {
                agency: true,
              },
            },
            contacts: { where: { isActive: true } },
          },
        },
      },
    });
  },
};

module.exports = taskRepository;
