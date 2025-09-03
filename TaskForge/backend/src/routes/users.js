/**
 * User Routes
 * Handles user management and user-related operations
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, param, validationResult } = require('express-validator');
const { runQuery, getOne, getAll } = require('../models/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * Get all users (admin only)
 * GET /api/users
 */
router.get('/', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const users = await getAll(`
      SELECT 
        u.id, u.username, u.email, u.full_name, u.role, u.is_active, 
        u.created_at, u.updated_at,
        (SELECT COUNT(*) FROM projects WHERE owner_id = u.id) as owned_projects,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = u.id) as assigned_tasks,
        (SELECT COUNT(*) FROM project_members WHERE user_id = u.id) as member_projects
      FROM users u
      ORDER BY u.created_at DESC
    `);

    res.json({
      users,
      count: users.length
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

/**
 * Get users for project assignment (returns active users only)
 * GET /api/users/available
 */
router.get('/available', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.query;
    
    let query = `
      SELECT id, username, email, full_name, role 
      FROM users 
      WHERE is_active = 1
    `;
    
    const params = [];
    
    // If projectId provided, exclude existing members
    if (projectId) {
      query += ` AND id NOT IN (
        SELECT user_id FROM project_members WHERE project_id = ?
        UNION
        SELECT owner_id FROM projects WHERE id = ?
      )`;
      params.push(projectId, projectId);
    }
    
    query += ' ORDER BY full_name';
    
    const users = await getAll(query, params);

    res.json({
      users,
      count: users.length
    });
  } catch (error) {
    console.error('Get available users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

/**
 * Get single user profile
 * GET /api/users/:id
 */
router.get('/:id', [
  authenticateToken,
  param('id').isInt().withMessage('Valid user ID required')
], async (req, res) => {
  try {
    const userId = req.params.id;
    const requestingUserId = req.user.id;

    // Users can view their own profile, admins can view any profile
    if (userId != requestingUserId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const user = await getOne(`
      SELECT 
        u.id, u.username, u.email, u.full_name, u.role, u.is_active,
        u.created_at, u.updated_at
      FROM users u
      WHERE u.id = ?
    `, [userId]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user statistics
    const stats = await getOne(`
      SELECT 
        (SELECT COUNT(*) FROM projects WHERE owner_id = ?) as owned_projects,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = ?) as assigned_tasks,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = ? AND status = 'done') as completed_tasks,
        (SELECT COUNT(*) FROM project_members WHERE user_id = ?) as member_projects,
        (SELECT COUNT(*) FROM comments WHERE user_id = ?) as total_comments
    `, [userId, userId, userId, userId, userId]);

    // Get recent activity
    const recentActivity = await getAll(`
      SELECT action, entity_type, entity_id, details, created_at
      FROM activity_log
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `, [userId]);

    res.json({
      user,
      stats,
      recentActivity
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

/**
 * Update user profile
 * PUT /api/users/:id
 */
router.put('/:id', [
  authenticateToken,
  param('id').isInt().withMessage('Valid user ID required'),
  body('fullName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
  body('email')
    .optional()
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.params.id;
    const requestingUserId = req.user.id;
    const updates = req.body;

    // Users can update their own profile, admins can update any profile
    if (userId != requestingUserId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Check if user exists
    const user = await getOne('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Build update query
    const updateFields = [];
    const updateValues = [];

    if (updates.fullName !== undefined) {
      updateFields.push('full_name = ?');
      updateValues.push(updates.fullName);
    }
    if (updates.email !== undefined) {
      // Check if email is already taken
      const existingEmail = await getOne(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [updates.email, userId]
      );
      if (existingEmail) {
        return res.status(409).json({ error: 'Email already in use' });
      }
      updateFields.push('email = ?');
      updateValues.push(updates.email);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(userId);
    await runQuery(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // Get updated user
    const updatedUser = await getOne(
      'SELECT id, username, email, full_name, role, is_active FROM users WHERE id = ?',
      [userId]
    );

    // Log activity
    await runQuery(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [requestingUserId, 'user_updated', 'user', userId, JSON.stringify(updates)]
    );

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * Update user role (admin only)
 * PUT /api/users/:id/role
 */
router.put('/:id/role', [
  authenticateToken,
  requireAdmin,
  param('id').isInt().withMessage('Valid user ID required'),
  body('role')
    .isIn(['admin', 'manager', 'member'])
    .withMessage('Invalid role')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.params.id;
    const { role } = req.body;

    // Check if user exists
    const user = await getOne('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent removing the last admin
    if (user.role === 'admin' && role !== 'admin') {
      const adminCount = await getOne(
        'SELECT COUNT(*) as count FROM users WHERE role = ? AND is_active = 1',
        ['admin']
      );
      if (adminCount.count <= 1) {
        return res.status(400).json({ error: 'Cannot remove the last admin' });
      }
    }

    // Update role
    await runQuery(
      'UPDATE users SET role = ? WHERE id = ?',
      [role, userId]
    );

    // Log activity
    await runQuery(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, 'role_changed', 'user', userId, `Changed role to ${role}`]
    );

    res.json({
      message: 'Role updated successfully',
      user: { ...user, role }
    });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

/**
 * Toggle user active status (admin only)
 * PUT /api/users/:id/toggle-active
 */
router.put('/:id/toggle-active', [
  authenticateToken,
  requireAdmin,
  param('id').isInt().withMessage('Valid user ID required')
], async (req, res) => {
  try {
    const userId = req.params.id;

    // Prevent admin from deactivating themselves
    if (userId == req.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    // Get current status
    const user = await getOne(
      'SELECT id, is_active, role FROM users WHERE id = ?',
      [userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If deactivating an admin, check if it's the last one
    if (user.is_active && user.role === 'admin') {
      const adminCount = await getOne(
        'SELECT COUNT(*) as count FROM users WHERE role = ? AND is_active = 1',
        ['admin']
      );
      if (adminCount.count <= 1) {
        return res.status(400).json({ error: 'Cannot deactivate the last admin' });
      }
    }

    // Toggle status
    const newStatus = !user.is_active;
    await runQuery(
      'UPDATE users SET is_active = ? WHERE id = ?',
      [newStatus ? 1 : 0, userId]
    );

    // Log activity
    await runQuery(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, newStatus ? 'user_activated' : 'user_deactivated', 'user', userId, '']
    );

    res.json({
      message: `User ${newStatus ? 'activated' : 'deactivated'} successfully`,
      isActive: newStatus
    });
  } catch (error) {
    console.error('Toggle active error:', error);
    res.status(500).json({ error: 'Failed to toggle user status' });
  }
});

/**
 * Reset user password (admin only)
 * POST /api/users/:id/reset-password
 */
router.post('/:id/reset-password', [
  authenticateToken,
  requireAdmin,
  param('id').isInt().withMessage('Valid user ID required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.params.id;
    const { newPassword } = req.body;

    // Check if user exists
    const user = await getOne('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Update password
    await runQuery(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [passwordHash, userId]
    );

    // Log activity
    await runQuery(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, 'password_reset', 'user', userId, 'Admin password reset']
    );

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;