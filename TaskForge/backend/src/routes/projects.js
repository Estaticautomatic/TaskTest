/**
 * Project Routes
 * Handles CRUD operations for projects and project membership
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { runQuery, getOne, getAll } = require('../models/database');
const { authenticateToken, requireManager } = require('../middleware/auth');

const router = express.Router();

/**
 * Get all projects accessible to user
 * GET /api/projects
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, search } = req.query;

    let query = `
      SELECT DISTINCT p.*, 
        u.full_name as owner_name,
        pm.role as user_role,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as completed_tasks,
        (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count
      FROM projects p
      LEFT JOIN users u ON p.owner_id = u.id
      LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = ?
      WHERE (p.owner_id = ? OR pm.user_id = ?)
    `;
    
    const params = [userId, userId, userId];

    // Add status filter
    if (status && status !== 'all') {
      query += ' AND p.status = ?';
      params.push(status);
    }

    // Add search filter
    if (search) {
      query += ' AND (p.name LIKE ? OR p.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY p.updated_at DESC';

    const projects = await getAll(query, params);

    res.json({
      projects,
      count: projects.length
    });

/**
 * Create new project
 * POST /api/projects
 */
router.post('/', [
  authenticateToken,
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Project name must be between 1 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('color')
    .optional()
    .matches(/^#[0-9A-F]{6}$/i)
    .withMessage('Color must be a valid hex code')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, color = '#3B82F6' } = req.body;
    const userId = req.user.id;

    // Create project
    const result = await runQuery(
      `INSERT INTO projects (name, description, owner_id, color) 
       VALUES (?, ?, ?, ?)`,
      [name, description || null, userId, color]
    );

    // Add owner as admin member
    await runQuery(
      `INSERT INTO project_members (project_id, user_id, role) 
       VALUES (?, ?, 'owner')`,
      [result.id, userId]
    );

    // Get created project
    const project = await getOne(
      'SELECT * FROM projects WHERE id = ?',
      [result.id]
    );

    // Log activity
    await runQuery(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'project_created', 'project', result.id, name]
    );

    res.status(201).json({
      message: 'Project created successfully',
      project
    });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

/**
 * Update project
 * PUT /api/projects/:id
 */
router.put('/:id', [
  authenticateToken,
  param('id').isInt().withMessage('Valid project ID required'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Project name must be between 1 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('status')
    .optional()
    .isIn(['active', 'archived', 'completed'])
    .withMessage('Invalid status'),
  body('color')
    .optional()
    .matches(/^#[0-9A-F]{6}$/i)
    .withMessage('Color must be a valid hex code')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const projectId = req.params.id;
    const userId = req.user.id;
    const updates = req.body;

    // Check if project exists and user has permission
    const project = await getOne(
      'SELECT * FROM projects WHERE id = ?',
      [projectId]
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if user is owner or admin
    const memberRole = await getOne(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, userId]
    );

    if (project.owner_id !== userId && (!memberRole || !['owner', 'admin'].includes(memberRole.role))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Build update query
    const updateFields = [];
    const updateValues = [];

    if (updates.name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(updates.name);
    }
    if (updates.description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(updates.description);
    }
    if (updates.status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(updates.status);
    }
    if (updates.color !== undefined) {
      updateFields.push('color = ?');
      updateValues.push(updates.color);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(projectId);
    await runQuery(
      `UPDATE projects SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // Get updated project
    const updatedProject = await getOne(
      'SELECT * FROM projects WHERE id = ?',
      [projectId]
    );

    // Log activity
    await runQuery(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'project_updated', 'project', projectId, JSON.stringify(updates)]
    );

    res.json({
      message: 'Project updated successfully',
      project: updatedProject
    });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

/**
 * Delete project
 * DELETE /api/projects/:id
 */
router.delete('/:id', [
  authenticateToken,
  param('id').isInt().withMessage('Valid project ID required')
], async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;

    // Check if project exists and user is owner
    const project = await getOne(
      'SELECT * FROM projects WHERE id = ?',
      [projectId]
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.owner_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only project owner can delete project' });
    }

    // Log activity before deletion
    await runQuery(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'project_deleted', 'project', projectId, project.name]
    );

    // Delete project (cascades to tasks, comments, and members)
    await runQuery('DELETE FROM projects WHERE id = ?', [projectId]);

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

/**
 * Add member to project
 * POST /api/projects/:id/members
 */
router.post('/:id/members', [
  authenticateToken,
  param('id').isInt().withMessage('Valid project ID required'),
  body('userId').isInt().withMessage('Valid user ID required'),
  body('role')
    .optional()
    .isIn(['admin', 'member', 'viewer'])
    .withMessage('Invalid role')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const projectId = req.params.id;
    const { userId: newMemberId, role = 'member' } = req.body;
    const currentUserId = req.user.id;

    // Check if project exists
    const project = await getOne(
      'SELECT * FROM projects WHERE id = ?',
      [projectId]
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if current user has permission to add members
    const currentUserRole = await getOne(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, currentUserId]
    );

    if (project.owner_id !== currentUserId && 
        (!currentUserRole || !['owner', 'admin'].includes(currentUserRole.role))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Check if user to be added exists
    const newMember = await getOne(
      'SELECT id, username, full_name FROM users WHERE id = ?',
      [newMemberId]
    );

    if (!newMember) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is already a member
    const existingMember = await getOne(
      'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, newMemberId]
    );

    if (existingMember) {
      return res.status(409).json({ error: 'User is already a member of this project' });
    }

    // Add member
    await runQuery(
      'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)',
      [projectId, newMemberId, role]
    );

    // Log activity
    await runQuery(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [currentUserId, 'member_added', 'project', projectId, `Added ${newMember.username} as ${role}`]
    );

    res.status(201).json({
      message: 'Member added successfully',
      member: {
        ...newMember,
        role
      }
    });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

/**
 * Remove member from project
 * DELETE /api/projects/:id/members/:userId
 */
router.delete('/:id/members/:userId', [
  authenticateToken,
  param('id').isInt().withMessage('Valid project ID required'),
  param('userId').isInt().withMessage('Valid user ID required')
], async (req, res) => {
  try {
    const projectId = req.params.id;
    const memberToRemove = parseInt(req.params.userId);
    const currentUserId = req.user.id;

    // Check if project exists
    const project = await getOne(
      'SELECT * FROM projects WHERE id = ?',
      [projectId]
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Can't remove project owner
    if (memberToRemove === project.owner_id) {
      return res.status(400).json({ error: 'Cannot remove project owner' });
    }

    // Check permissions
    const currentUserRole = await getOne(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, currentUserId]
    );

    // Users can remove themselves, or admins/owners can remove others
    if (memberToRemove !== currentUserId && 
        project.owner_id !== currentUserId &&
        (!currentUserRole || !['owner', 'admin'].includes(currentUserRole.role))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Remove member
    const result = await runQuery(
      'DELETE FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, memberToRemove]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Member not found in project' });
    }

    // Log activity
    await runQuery(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [currentUserId, 'member_removed', 'project', projectId, `Removed user ${memberToRemove}`]
    );

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

module.exports = router;
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Failed to get projects' });
  }
});

/**
 * Get single project with details
 * GET /api/projects/:id
 */
router.get('/:id', [
  authenticateToken,
  param('id').isInt().withMessage('Valid project ID required')
], async (req, res) => {