const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const { getDb } = require('../config/database');
const { generateToken } = require('../middleware/auth');
const { validateRequest } = require('../middleware/errorHandler');
const { createAuditLog } = require('../utils/auditLog');
const logger = require('../utils/logger');

const MAX_FAILED = parseInt(process.env.PASSWORD_MAX_FAILED_ATTEMPTS) || 5;
const LOCKOUT_MINUTES = parseInt(process.env.PASSWORD_LOCKOUT_MINUTES) || 15;

// POST /api/auth/login
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username or email is required.'),
    body('password').notEmpty().withMessage('Password is required.'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { username, password } = req.body;
      const db = getDb();
      const ip = req.ip;

      // Find user by username or email
      const user = db.prepare(`
        SELECT u.*, r.role_name FROM users u
        JOIN roles r ON u.role_id = r.role_id
        WHERE (u.username = ? OR u.email = ?) AND u.is_active = 1
      `).get(username, username);

      if (!user) {
        createAuditLog({ action: 'FailedLogin', entityName: 'Auth', ipAddress: ip, details: `Login attempt with unknown username: ${username}`, result: 'Failure' });
        return res.status(401).json({ success: false, message: 'Invalid credentials. Please try again.' });
      }

      // Check lockout
      if (user.lockout_end) {
        const lockoutEnd = new Date(user.lockout_end);
        if (lockoutEnd > new Date()) {
          const minutesLeft = Math.ceil((lockoutEnd - new Date()) / 60000);
          createAuditLog({ userId: user.user_id, action: 'FailedLogin', entityName: 'Auth', ipAddress: ip, details: 'Login attempt while locked out.', result: 'Failure' });
          return res.status(423).json({ success: false, message: `Account is locked. Try again in ${minutesLeft} minute(s).` });
        } else {
          // Lockout expired — reset
          db.prepare(`UPDATE users SET failed_login_count = 0, lockout_end = NULL WHERE user_id = ?`).run(user.user_id);
        }
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(password, user.password_hash);
      if (!passwordMatch) {
        const newFailCount = user.failed_login_count + 1;
        let lockoutEnd = null;
        if (newFailCount >= MAX_FAILED) {
          lockoutEnd = new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString();
        }
        db.prepare(`UPDATE users SET failed_login_count = ?, lockout_end = ? WHERE user_id = ?`).run(newFailCount, lockoutEnd, user.user_id);

        const remainingAttempts = MAX_FAILED - newFailCount;
        createAuditLog({ userId: user.user_id, action: 'FailedLogin', entityName: 'Auth', ipAddress: ip, details: `Invalid password. Attempt ${newFailCount}/${MAX_FAILED}.`, result: 'Failure' });

        if (lockoutEnd) {
          return res.status(423).json({ success: false, message: `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.` });
        }
        return res.status(401).json({ success: false, message: `Invalid credentials. ${remainingAttempts > 0 ? `${remainingAttempts} attempt(s) remaining.` : ''}` });
      }

      // Reset failed count on success
      db.prepare(`UPDATE users SET failed_login_count = 0, lockout_end = NULL WHERE user_id = ?`).run(user.user_id);

      // Generate token
      const token = generateToken({
        userId: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role_name,
        firstName: user.first_name,
        lastName: user.last_name,
      });

      createAuditLog({ userId: user.user_id, action: 'Login', entityName: 'Auth', ipAddress: ip, details: 'Successful login.', result: 'Success' });
      logger.info(`[Auth] User ${user.username} logged in from ${ip}`);

      return res.json({
        success: true,
        message: 'Login successful.',
        token,
        user: {
          userId: user.user_id,
          username: user.username,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role_name,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  // JWT is stateless; client should discard the token
  // Log the logout if user info available
  logger.info('[Auth] Logout request received.');
  return res.json({ success: true, message: 'Logged out successfully.' });
});

// POST /api/auth/register
router.post(
  '/register',
  [
    body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters.'),
    body('email').isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
    body('password')
      .isLength({ min: parseInt(process.env.PASSWORD_MIN_LENGTH) || 8 })
      .withMessage(`Password must be at least ${process.env.PASSWORD_MIN_LENGTH || 8} characters.`)
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain uppercase, lowercase, and a number.'),
    body('firstName').trim().notEmpty().withMessage('First name is required.'),
    body('lastName').trim().notEmpty().withMessage('Last name is required.'),
    body('roleId').notEmpty().withMessage('Role is required.'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { username, email, password, firstName, lastName, roleId } = req.body;
      const db = getDb();

      // Check duplicates
      const existingUser = db.prepare('SELECT user_id FROM users WHERE username = ? OR email = ?').get(username, email);
      if (existingUser) {
        return res.status(409).json({ success: false, message: 'Username or email already exists.' });
      }

      // Validate role exists
      const role = db.prepare('SELECT role_id FROM roles WHERE role_id = ?').get(roleId);
      if (!role) {
        return res.status(400).json({ success: false, message: 'Invalid role selected.' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const { v4: uuidv4 } = require('uuid');
      const userId = uuidv4();

      db.prepare(`
        INSERT INTO users (user_id, username, email, password_hash, first_name, last_name, role_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(userId, username, email, passwordHash, firstName, lastName, roleId);

      createAuditLog({ action: 'Register', entityName: 'User', recordId: userId, ipAddress: req.ip, details: `New user registered: ${username}`, result: 'Success' });

      return res.status(201).json({ success: true, message: 'Registration successful. You can now log in.' });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/auth/me — get current user profile
router.get('/me', require('../middleware/auth').authenticate, (req, res) => {
  const db = getDb();
  const user = db.prepare(`
    SELECT u.user_id, u.username, u.email, u.first_name, u.last_name, u.is_active,
           u.failed_login_count, u.lockout_end, u.created_date, r.role_name
    FROM users u JOIN roles r ON u.role_id = r.role_id
    WHERE u.user_id = ?
  `).get(req.user.userId);

  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

  return res.json({ success: true, data: user });
});

module.exports = router;
