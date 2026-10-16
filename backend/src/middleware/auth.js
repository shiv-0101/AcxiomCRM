const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

/**
 * Authentication middleware — verifies JWT token
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    logger.warn(`[Auth] Invalid token attempt: ${err.message}`);
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token. Please log in again.',
    });
  }
}

/**
 * Authorization middleware — checks if user has required role(s)
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`[Auth] Unauthorized access attempt by ${req.user.username} (${req.user.role}) to ${req.path}`);
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.',
      });
    }

    next();
  };
}

/**
 * Generate JWT token
 */
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Scope filter — returns query condition based on user role
 */
function getScopeFilter(user, ownerField = 'assigned_to') {
  if (user.role === 'Admin' || user.role === 'Manager') {
    return { condition: '', params: [] };
  }
  // SalesExecutive — only their own records
  return { condition: `AND ${ownerField} = ?`, params: [user.userId] };
}

module.exports = { authenticate, authorize, generateToken, getScopeFilter };
