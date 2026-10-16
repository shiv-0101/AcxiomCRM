const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const bcrypt = require('bcryptjs');
const { getDb } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { validateRequest } = require('../middleware/errorHandler');
const { createAuditLog } = require('../utils/auditLog');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

// GET /api/users — Admin/Manager only
router.get('/', authorize('Admin', 'Manager'), (req, res, next) => {
  try {
    const db = getDb();
    const { search, role, isActive, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let conditions = ['1=1'];
    let params = [];
    if (search) {
      conditions.push(`(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.username LIKE ?)`);
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (role) { conditions.push(`r.role_name = ?`); params.push(role); }
    if (isActive !== undefined) { conditions.push(`u.is_active = ?`); params.push(isActive === 'true' ? 1 : 0); }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const totalRow = db.prepare(`SELECT COUNT(*) as total FROM users u JOIN roles r ON u.role_id = r.role_id ${whereClause}`).get(...params);

    const users = db.prepare(`
      SELECT u.user_id, u.username, u.email, u.first_name, u.last_name, u.is_active,
             u.failed_login_count, u.lockout_end, u.created_date, r.role_name, r.role_id
      FROM users u JOIN roles r ON u.role_id = r.role_id
      ${whereClause}
      ORDER BY u.created_date DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

    res.json({ success: true, data: users, pagination: { total: totalRow.total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(totalRow.total / parseInt(limit)) } });
  } catch (err) { next(err); }
});

// GET /api/users/sales-executives — for assignment dropdowns
router.get('/sales-executives', (req, res, next) => {
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT u.user_id, u.first_name || ' ' || u.last_name as full_name, u.email
      FROM users u JOIN roles r ON u.role_id = r.role_id
      WHERE r.role_name = 'SalesExecutive' AND u.is_active = 1
    `).all();
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
});

// GET /api/users/:id
router.get('/:id', authorize('Admin'), [param('id').notEmpty()], validateRequest, (req, res, next) => {
  try {
    const db = getDb();
    const user = db.prepare(`
      SELECT u.user_id, u.username, u.email, u.first_name, u.last_name, u.is_active,
             u.failed_login_count, u.lockout_end, u.created_date, r.role_name, r.role_id
      FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?
    `).get(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// POST /api/users — Create user (Admin only)
router.post(
  '/',
  authorize('Admin'),
  [
    body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters.'),
    body('email').isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
    body('password')
      .isLength({ min: parseInt(process.env.PASSWORD_MIN_LENGTH) || 8 }).withMessage(`Password must be at least ${process.env.PASSWORD_MIN_LENGTH || 8} characters.`)
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and a number.'),
    body('firstName').trim().notEmpty().withMessage('First name is required.'),
    body('lastName').trim().notEmpty().withMessage('Last name is required.'),
    body('roleId').notEmpty().withMessage('Role is required.'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const db = getDb();
      const { username, email, password, firstName, lastName, roleId } = req.body;

      const dup = db.prepare('SELECT user_id FROM users WHERE username = ? OR email = ?').get(username, email);
      if (dup) return res.status(409).json({ success: false, message: 'Username or email already exists.' });

      const role = db.prepare('SELECT role_id FROM roles WHERE role_id = ?').get(roleId);
      if (!role) return res.status(400).json({ success: false, message: 'Invalid role.' });

      const passwordHash = await bcrypt.hash(password, 12);
      const userId = uuidv4();

      db.prepare(`INSERT INTO users (user_id, username, email, password_hash, first_name, last_name, role_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(userId, username, email, passwordHash, firstName, lastName, roleId, req.user.userId);
      createAuditLog({ userId: req.user.userId, action: 'Create', entityName: 'User', recordId: userId, ipAddress: req.ip, details: `Created user: ${username} with role ${roleId}` });

      res.status(201).json({ success: true, message: 'User created successfully.', data: { userId, username, email } });
    } catch (err) { next(err); }
  }
);

// PUT /api/users/:id — Update user
router.put(
  '/:id',
  authorize('Admin'),
  [
    param('id').notEmpty(),
    body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty.'),
    body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty.'),
    body('email').optional().isEmail().withMessage('Enter a valid email.').normalizeEmail(),
    body('roleId').optional().notEmpty().withMessage('Role cannot be empty.'),
    body('isActive').optional().isBoolean().withMessage('isActive must be boolean.'),
  ],
  validateRequest,
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM users WHERE user_id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'User not found.' });

      const { firstName, lastName, email, roleId, isActive } = req.body;

      if (roleId) {
        const role = db.prepare('SELECT role_id FROM roles WHERE role_id = ?').get(roleId);
        if (!role) return res.status(400).json({ success: false, message: 'Invalid role.' });
      }

      db.prepare(`
        UPDATE users SET
          first_name = COALESCE(?, first_name),
          last_name = COALESCE(?, last_name),
          email = COALESCE(?, email),
          role_id = COALESCE(?, role_id),
          is_active = COALESCE(?, is_active),
          modified_date = datetime('now')
        WHERE user_id = ?
      `).run(firstName || null, lastName || null, email || null, roleId || null, isActive !== undefined ? (isActive ? 1 : 0) : null, req.params.id);

      if (roleId && roleId !== existing.role_id) {
        createAuditLog({ userId: req.user.userId, action: 'RoleChange', entityName: 'User', recordId: req.params.id, oldValue: { roleId: existing.role_id }, newValue: { roleId }, ipAddress: req.ip });
      }
      createAuditLog({ userId: req.user.userId, action: 'Update', entityName: 'User', recordId: req.params.id, oldValue: existing, ipAddress: req.ip });

      res.json({ success: true, message: 'User updated successfully.' });
    } catch (err) { next(err); }
  }
);

// POST /api/users/:id/reset-password — Admin reset password
router.post('/:id/reset-password', authorize('Admin'), [param('id').notEmpty(), body('newPassword').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password does not meet policy requirements.')], validateRequest,
  async (req, res, next) => {
    try {
      const db = getDb();
      const user = db.prepare('SELECT user_id, username FROM users WHERE user_id = ?').get(req.params.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

      const hash = await bcrypt.hash(req.body.newPassword, 12);
      db.prepare('UPDATE users SET password_hash = ?, failed_login_count = 0, lockout_end = NULL, modified_date = datetime(\'now\') WHERE user_id = ?').run(hash, req.params.id);
      createAuditLog({ userId: req.user.userId, action: 'PasswordReset', entityName: 'User', recordId: req.params.id, ipAddress: req.ip, details: `Admin reset password for user: ${user.username}` });

      res.json({ success: true, message: 'Password reset successfully.' });
    } catch (err) { next(err); }
  }
);

// POST /api/users/:id/unlock — Unlock a locked account
router.post('/:id/unlock', authorize('Admin'), [param('id').notEmpty()], validateRequest, (req, res, next) => {
  try {
    const db = getDb();
    db.prepare('UPDATE users SET failed_login_count = 0, lockout_end = NULL, modified_date = datetime(\'now\') WHERE user_id = ?').run(req.params.id);
    createAuditLog({ userId: req.user.userId, action: 'UnlockAccount', entityName: 'User', recordId: req.params.id, ipAddress: req.ip });
    res.json({ success: true, message: 'Account unlocked.' });
  } catch (err) { next(err); }
});

// GET /api/users/roles/list — Get all roles
router.get('/roles/list', (req, res, next) => {
  try {
    const db = getDb();
    const roles = db.prepare('SELECT * FROM roles ORDER BY role_name').all();
    res.json({ success: true, data: roles });
  } catch (err) { next(err); }
});

module.exports = router;
