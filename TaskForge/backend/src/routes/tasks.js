/**
 * Task Routes
 * Handles CRUD operations for tasks and task assignments
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { runQuery, getOne, getAll } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * Get tasks with filters
 * GET /api/tasks
 */
router.get('/', [
  authenticateToken,
  query('projectId').optional().isInt().withMessage('Valid project ID required'),
  query('status').optional().isIn(['todo', 'in_progress', 'review', 'done', 'cancelled']),
  query('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  query('assignedTo').optional().isInt(),
  query('search').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const filters = req.query;

    // Base query - get tasks from projects user has access to
    let taskQuery = `
      SELECT t.*, 
        p.name as project_name,
        p.color as project_color,
        u1.full_name as assigned_to_name,
        u1.username as assigned_to_username,
        u2.full_name as created_by_name,
        (SELECT COUNT(*) FROM comments WHERE task_id = t.id) as comment_count
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.created_by = u2.id
      WHERE EXISTS (
        SELECT 1 FROM project_members 
        WHERE project_id = p.id AND user_id = ?
        UNION
        SELECT 1 FROM projects 
        WHERE id = p.id AND owner_id = ?
      )
    `;

    const params = [userId, userId];

    // Add filters
    if (filters.projectId) {
      taskQuery += ' AND t.project_id = ?';
      params.push(filters.projectId);
    }

    if (filters.status) {
      taskQuery += ' AND t.status = ?';
      params.push(filters.status);
    }

    if (filters.priority) {
      taskQuery += ' AND t.priority = ?';
      params.push(filters.priority);
    }

    if (filters.assignedTo) {
      taskQuery += ' AND t.assigned_to = ?';
      params.push(filters.assignedTo);
    }

    if (filters.search) {
      taskQuery += ' AND (t.title LIKE ? OR t.description LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    // Order by priority and due date
    taskQuery += ` ORDER BY 
      CASE t.priority 
        WHEN 'urgent' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
      END,
      t.due_date ASC NULLS LAST,
      t.created_at DESC`;

    const tasks = await getAll(taskQuery, params);

    res.json({
      tasks,
      count: tasks.length
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

/**
 * Get single task with details
 * GET /api/tasks/:id
 */
router.get('/:id', [
  authenticateToken,
  param('id').isInt().withMessage('Valid task ID required')
], async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.user.id;

    // Get task with full details
    const task = await getOne(`
      SELECT t.*, 
        p.name as project_name,
        p.color as project_color,
        u1.full_name as assigned_to_name,
        u1.email as assigned_to_email,
        u2.full_name as created_by_name,
        u2.email as created_by_email
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.created_by = u2.id
      WHERE t.id = ?
    `, [taskId]);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check if user has access to the project
    const hasAccess = await getOne(`
      SELECT 1 FROM project_members 
      WHERE project_id = ? AND user_id = ?
      UNION
      SELECT 1 FROM projects 
      WHERE id = ? AND owner_id = ?
    `, [task.project_id, userId, task.project_id, userId]);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get comments
    const comments = await getAll(`
      SELECT c.*, u.full_name as user_name, u.username
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.task_id = ?
      ORDER BY c.created_at DESC
    `, [taskId]);

    res.json({
      task,
      comments
    });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Failed to get task' });
  }
});

/**
 * Create new task
 * POST /api/tasks
 */
router.post('/', [
  authenticateToken,
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('projectId').isInt().withMessage('Valid project ID required'),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('assignedTo').optional().isInt(),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent']),
  body('status')
    .optional()
    .isIn(['todo', 'in_progress', 'review', 'done', 'cancelled']),
  body('dueDate').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const {
      title,
      projectId,
      description,
      assignedTo,
      priority = 'medium',
      status = 'todo',
      dueDate
    } = req.body;

    // Check if user has access to project
    const hasAccess = await getOne(`
      SELECT 1 FROM project_members 
      WHERE project_id = ? AND user_id = ?
      UNION
      SELECT 1 FROM projects 
      WHERE id = ? AND owner_id = ?
    `, [projectId, userId, projectId, userId]);

    if (!hasAccess) {
      return res.status(403).json({ error: 'No access to this project' });
    }

    // If assignedTo is provided, check if that user is a project member
    if (assignedTo) {
      const isMember = await getOne(`
        SELECT 1 FROM project_members 
        WHERE project_id = ? AND user_id = ?
        UNION
        SELECT 1 FROM projects 
        WHERE id = ? AND owner_id = ?
      `, [projectId, assignedTo, projectId, assignedTo]);

      if (!isMember) {
        return res.status(400).json({ error: 'Assigned user is not a project member' });
      }
    }

    // Create task
    const result = await runQuery(`
      INSERT INTO tasks (
        title, description, project_id, assigned_to, 
        created_by, status, priority, due_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      title,
      description || null,
      projectId,
      assignedTo || null,
      userId,
      status,
      priority,
      dueDate || null
    ]);

    // Get created task
    const task = await getOne(`
      SELECT t.*, 
        p.name as project_name,
        u.full_name as assigned_to_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.id = ?
    `, [result.id]);

    // Log activity
    await runQuery(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'task_created', 'task', result.id, title]
    );

    res.status(201).json({
      message: 'Task created successfully',
      task
    });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/**
 * Update task
 * PUT /api/tasks/:id
 */
router.put('/:id', [
  authenticateToken,
  param('id').isInt().withMessage('Valid task ID required'),
  body('title').optional().trim().isLength({ min: 1, max: 200 }),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('assignedTo').optional().isInt(),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('status').optional().isIn(['todo', 'in_progress', 'review', 'done', 'cancelled']),
  body('dueDate').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const taskId = req.params.id;
    const userId = req.user.id;
    const updates = req.body;

    // Get task and check permissions
    const task = await getOne(
      'SELECT * FROM tasks WHERE id = ?',
      [taskId]
    );

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check if user has access to the project
    const hasAccess = await getOne(`
      SELECT role FROM project_members 
      WHERE project_id = ? AND user_id = ?
      UNION
      SELECT 'owner' as role FROM projects 
      WHERE id = ? AND owner_id = ?
    `, [task.project_id, userId, task.project_id, userId]);

    if (!hasAccess) {
      return res.status(403).json({ error: 'No access to this task' });
    }

    // Build update query
    const updateFields = [];
    const updateValues = [];

    if (updates.title !== undefined) {
      updateFields.push('title = ?');
      updateValues.push(updates.title);
    }
    if (updates.description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(updates.description);
    }
    if (updates.assignedTo !== undefined) {
      updateFields.push('assigned_to = ?');
      updateValues.push(updates.assignedTo);
    }
    if (updates.priority !== undefined) {
      updateFields.push('priority = ?');
      updateValues.push(updates.priority);
    }
    if (updates.status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(updates.status);
      
      // Set completed_at if status is done
      if (updates.status === 'done') {
        updateFields.push('completed_at = CURRENT_TIMESTAMP');
      } else {
        updateFields.push('completed_at = NULL');
      }
    }
    if (updates.dueDate !== undefined) {
      updateFields.push('due_date = ?');
      updateValues.push(updates.dueDate);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(taskId);
    await runQuery(
      `UPDATE tasks SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // Get updated task
    const updatedTask = await getOne(`
      SELECT t.*, 
        p.name as project_name,
        u.full_name as assigned_to_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.id = ?
    `, [taskId]);

    // Log activity
    await runQuery(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'task_updated', 'task', taskId, JSON.stringify(updates)]
    );

    res.json({
      message: 'Task updated successfully',
      task: updatedTask
    });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/**
 * Delete task
 * DELETE /api/tasks/:id
 */
router.delete('/:id', [
  authenticateToken,
  param('id').isInt().withMessage('Valid task ID required')
], async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.user.id;

    // Get task
    const task = await getOne(
      'SELECT * FROM tasks WHERE id = ?',
      [taskId]
    );

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check permissions - only creator, assigned user, or project admin can delete
    const hasPermission = await getOne(`
      SELECT 1 FROM tasks WHERE id = ? AND (created_by = ? OR assigned_to = ?)
      UNION
      SELECT 1 FROM project_members 
      WHERE project_id = ? AND user_id = ? AND role IN ('owner', 'admin')
      UNION
      SELECT 1 FROM projects 
      WHERE id = ? AND owner_id = ?
    `, [taskId, userId, userId, task.project_id, userId, task.project_id, userId]);

    if (!hasPermission) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Log activity before deletion
    await runQuery(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'task_deleted', 'task', taskId, task.title]
    );

    // Delete task (cascades to comments)
    await runQuery('DELETE FROM tasks WHERE id = ?', [taskId]);

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

/**
 * Add comment to task
 * POST /api/tasks/:id/comments
 */
router.post('/:id/comments', [
  authenticateToken,
  param('id').isInt().withMessage('Valid task ID required'),
  body('content')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Comment must be between 1 and 1000 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const taskId = req.params.id;
    const userId = req.user.id;
    const { content } = req.body;

    // Check if task exists
    const task = await getOne(
      'SELECT project_id FROM tasks WHERE id = ?',
      [taskId]
    );

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check if user has access to the project
    const hasAccess = await getOne(`
      SELECT 1 FROM project_members 
      WHERE project_id = ? AND user_id = ?
      UNION
      SELECT 1 FROM projects 
      WHERE id = ? AND owner_id = ?
    `, [task.project_id, userId, task.project_id, userId]);

    if (!hasAccess) {
      return res.status(403).json({ error: 'No access to this task' });
    }

    // Create comment
    const result = await runQuery(
      'INSERT INTO comments (task_id, user_id, content) VALUES (?, ?, ?)',
      [taskId, userId, content]
    );

    // Get created comment
    const comment = await getOne(`
      SELECT c.*, u.full_name as user_name, u.username
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `, [result.id]);

    // Log activity
    await runQuery(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'comment_added', 'task', taskId, 'Added comment']
    );

    res.status(201).json({
      message: 'Comment added successfully',
      comment
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

/**
 * Get my tasks (assigned to current user)
 * GET /api/tasks/my-tasks
 */
router.get('/my-tasks', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const tasks = await getAll(`
      SELECT t.*, 
        p.name as project_name,
        p.color as project_color,
        u.full_name as created_by_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.assigned_to = ? AND t.status != 'done' AND t.status != 'cancelled'
      ORDER BY 
        CASE t.priority 
          WHEN 'urgent' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          WHEN 'low' THEN 4 
        END,
        t.due_date ASC NULLS LAST
    `, [userId]);

    res.json({
      tasks,
      count: tasks.length
    });
  } catch (error) {
    console.error('Get my tasks error:', error);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

module.exports = router;