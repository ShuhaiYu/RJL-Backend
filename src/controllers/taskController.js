/**
 * Task Controller
 *
 * HTTP layer for Task endpoints. Delegates business logic to taskService.
 */

const taskService = require('../services/taskService');
const { sendSuccess } = require('../lib/response');

module.exports = {
  /**
   * Create a new task
   * POST /api/tasks
   */
  createTask: async (req, res, next) => {
    try {
      const task = await taskService.createTask(req.body, req.user);

      sendSuccess(res, {
        statusCode: 201,
        message: 'Task created successfully',
        data: taskService.formatTask(task),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Create multiple tasks
   * POST /api/tasks/batch
   */
  createTasks: async (req, res, next) => {
    try {
      const result = await taskService.createTasks(req.body, req.user);

      sendSuccess(res, {
        statusCode: 201,
        message: `${result.count} tasks created successfully`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get task by ID
   * GET /api/tasks/:id
   */
  getTaskDetail: async (req, res, next) => {
    try {
      const task = await taskService.getTaskById(
        parseInt(req.params.id, 10),
        req.user
      );

      sendSuccess(res, {
        data: task,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update a task
   * PUT /api/tasks/:id
   */
  updateTask: async (req, res, next) => {
    try {
      const task = await taskService.updateTask(
        parseInt(req.params.id, 10),
        req.body,
        req.user
      );

      sendSuccess(res, {
        message: 'Task updated successfully',
        data: taskService.formatTask(task),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List tasks
   * GET /api/tasks
   */
  listTasks: async (req, res, next) => {
    try {
      const { search, page, limit, property_id, status, type } = req.query;
      const result = await taskService.listTasks(req.user, {
        search,
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 50,
        property_id: property_id ? parseInt(property_id, 10) : undefined,
        status,
        type,
      });

      sendSuccess(res, {
        data: result.tasks,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get tasks due today
   * GET /api/tasks/today
   */
  getTasksDueToday: async (req, res, next) => {
    try {
      const tasks = await taskService.getTasksDueToday(req.user);

      sendSuccess(res, {
        data: tasks,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get dashboard statistics
   * GET /api/tasks/dashboard or GET /api/dashboard
   */
  getDashboardStats: async (req, res, next) => {
    try {
      const stats = await taskService.getDashboardStats(req.user);

      // Return stats directly at root level for backward compatibility with frontend
      res.status(200).json(stats);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete a task (soft delete)
   * DELETE /api/tasks/:id
   */
  deleteTask: async (req, res, next) => {
    try {
      await taskService.deleteTask(parseInt(req.params.id, 10), req.user);

      sendSuccess(res, {
        message: 'Task deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  },
};
