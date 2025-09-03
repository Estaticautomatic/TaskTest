/**
 * Authentication Middleware
 * Handles JWT token verification and user authorization
 */

const jwt = require('jsonwebtoken');
const { getOne } = require('../models/database');

// JWT secret from environment or fallback
const JWT_SECRET = process.env.JWT_SECRET || 'taskforge-secret-key-change-in-production';

/**
 * Verify JWT token and attach user to request
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user from database
    const user = await getOne(
      'SELECT id, username, email, full_name, role, is_active FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

/**
 * Check if user has required role
 * @param {string[]} roles - Array of allowed roles
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: roles,
        current: req.user.role
      });
    }

    next();
  };
};

/**
 * Check if user is admin
 */
const requireAdmin = requireRole(['admin']);

/**
 * Check if user is admin or manager
 */
const requireManager = requireRole(['admin', 'manager']);

/**
 * Generate JWT token for user
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    { 
      userId: user.id,
      username: user.username,
      role: user.role
    },
    JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRY || '7d'
    }
  );
};

/**
 * Refresh token if it's about to expire
 */
const refreshTokenMiddleware = (req, res, next) => {
  if (req.user && req.headers['authorization']) {
    const authHeader = req.headers['authorization'];
    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.decode(token);
      const now = Date.now() / 1000;
      const timeUntilExpiry = decoded.exp - now;
      
      // If token expires in less than 1 day, issue new token
      if (timeUntilExpiry < 86400) {
        const newToken = generateToken(req.user);
        res.setHeader('X-New-Token', newToken);
      }
    } catch (error) {
      console.error('Error refreshing token:', error);
    }
  }
  next();
};

module.exports = {
  authenticateToken,
  requireRole,
  requireAdmin,
  requireManager,
  generateToken,
  refreshTokenMiddleware,
  JWT_SECRET
};