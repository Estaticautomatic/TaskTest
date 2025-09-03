/**
 * Authentication Routes
 * Handles user registration, login, and session management
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { runQuery, getOne } = require('../models/database');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * Register new user
 * POST /api/auth/register
 */
router.post('/register', [
  // Validation rules
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters')
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, fullName } = req.body;

    // Check if user already exists
    const existingUser = await getOne(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existingUser) {
      return res.status(409).json({ 
        error: 'User already exists with this username or email' 
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Determine role (first user becomes admin)
    const userCount = await getOne('SELECT COUNT(*) as count FROM users');
    const role = userCount.count === 0 ? 'admin' : 'member';

    // Create user
    const result = await runQuery(
      `INSERT INTO users (username, email, password_hash, full_name, role) 
       VALUES (?, ?, ?, ?, ?)`,
      [username, email, passwordHash, fullName, role]
    );

    // Get created user
    const user = await getOne(
      'SELECT id, username, email, full_name, role FROM users WHERE id = ?',
      [result.id]
    );

    // Generate token
    const token = generateToken(user);

    // Log activity
    await runQuery(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?)',
      [user.id, 'user_registered', 'user', user.id]
    );

    res.status(201).json({
      message: 'Registration successful',
      user,
      token,
      isFirstUser: userCount.count === 0
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * Login user
 * POST /api/auth/login
 */
router.post('/login', [
  body('username').trim().notEmpty().withMessage('Username required'),
  body('password').notEmpty().withMessage('Password required')
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    // Find user by username or email
    const user = await getOne(
      `SELECT id, username, email, password_hash, full_name, role, is_active 
       FROM users 
       WHERE username = ? OR email = ?`,
      [username, username]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if account is active
    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(user);

    // Remove password hash from response
    delete user.password_hash;

    // Log activity
    await runQuery(
      'INSERT INTO activity_log (user_id, action, entity_type) VALUES (?, ?, ?)',
      [user.id, 'user_login', 'session']
    );

    res.json({
      message: 'Login successful',
      user,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * Get current user profile
 * GET /api/auth/me
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // User is already attached by authenticateToken middleware
    const user = req.user;
    
    // Get additional stats
    const stats = await getOne(`
      SELECT 
        (SELECT COUNT(*) FROM projects WHERE owner_id = ?) as owned_projects,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = ?) as assigned_tasks,
        (SELECT COUNT(*) FROM tasks WHERE created_by = ?) as created_tasks,
        (SELECT COUNT(*) FROM project_members WHERE user_id = ?) as member_projects
    `, [user.id, user.id, user.id, user.id]);

    res.json({
      user,
      stats
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * Change password
 * POST /api/auth/change-password
 */
router.post('/change-password', [
  authenticateToken,
  body('currentPassword').notEmpty().withMessage('Current password required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Get user with password hash
    const user = await getOne(
      'SELECT password_hash FROM users WHERE id = ?',
      [userId]
    );

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // Update password
    await runQuery(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newPasswordHash, userId]
    );

    // Log activity
    await runQuery(
      'INSERT INTO activity_log (user_id, action, entity_type) VALUES (?, ?, ?)',
      [userId, 'password_changed', 'user']
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

/**
 * Logout (client-side token removal)
 * POST /api/auth/logout
 */
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Log activity
    await runQuery(
      'INSERT INTO activity_log (user_id, action, entity_type) VALUES (?, ?, ?)',
      [req.user.id, 'user_logout', 'session']
    );

    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

module.exports = router;