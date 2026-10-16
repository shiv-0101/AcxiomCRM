const express = require('express');
const router = express.Router();
const { body, query, param } = require('express-validator');
const { getDb } = require('../config/database');
const { authenticate, authorize, getScopeFilter } = require('../middleware/auth');
const { validateRequest, createError } = require('../middleware/errorHandler');
const { createAuditLog } = require('../utils/auditLog');
const { v4: uuidv4 } = require('uuid');

// All customer routes require authentication
router.use(authenticate);

/**
 * GET /api/customers — List/search customers
 */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const { search, status, owner, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const scope = getScopeFilter(req.user, 'c.owner_id');
    let conditions = ['1=1'];
    let params = [...scope.params];

    if (scope.condition) conditions.push(scope.condition.replace('AND ', ''));

    if (search) {
      conditions.push(`(c.customer_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR c.company_name LIKE ?)`);
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (status) { conditions.push(`c.status = ?`); params.push(status); }
    if (owner) { conditions.push(`c.owner_id = ?`); params.push(owner); }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const totalRow = db.prepare(`SELECT COUNT(*) as total FROM customers c ${whereClause}`).get(...params);
    const customers = db.prepare(`
      SELECT c.*, u.first_name || ' ' || u.last_name as owner_name
      FROM customers c
      LEFT JOIN users u ON c.owner_id = u.user_id
      ${whereClause}
      ORDER BY c.created_date DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

    res.json({
      success: true,
      data: customers,
      pagination: {
        total: totalRow.total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalRow.total / parseInt(limit)),
      },
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/customers/:id — Get single customer
 */
router.get('/:id', [param('id').notEmpty()], validateRequest, (req, res, next) => {
  try {
    const db = getDb();
    const customer = db.prepare(`
      SELECT c.*, u.first_name || ' ' || u.last_name as owner_name
      FROM customers c
      LEFT JOIN users u ON c.owner_id = u.user_id
      WHERE c.customer_id = ?
    `).get(req.params.id);

    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });

    // Check scope for sales executive
    if (req.user.role === 'SalesExecutive' && customer.owner_id !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Access denied to this customer.' });
    }

    res.json({ success: true, data: customer });
  } catch (err) { next(err); }
});

/**
 * POST /api/customers — Create customer
 */
router.post(
  '/',
  authorize('Admin', 'Manager', 'SalesExecutive'),
  [
    body('customerName').trim().notEmpty().withMessage('Customer Name is required.').isLength({ max: 100 }).withMessage('Customer Name is too long.'),
    body('email').isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
    body('phone').matches(/^[0-9]{10}$/).withMessage('Enter a valid 10-digit phone number.'),
    body('status').optional().isIn(['Active', 'Inactive', 'Prospect']).withMessage('Invalid status.'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const db = getDb();
      const { customerName, email, phone, companyName, address, city, state, status = 'Active', ownerId, notes } = req.body;

      // Duplicate checks
      const existingEmail = db.prepare('SELECT customer_id FROM customers WHERE email = ?').get(email);
      if (existingEmail) return res.status(409).json({ success: false, message: 'A customer with this email already exists.' });

      const existingPhone = db.prepare('SELECT customer_id FROM customers WHERE phone = ?').get(phone);
      if (existingPhone) return res.status(409).json({ success: false, message: 'A customer with this phone number already exists.' });

      // Generate customer code
      const countRow = db.prepare('SELECT COUNT(*) as cnt FROM customers').get();
      const code = `CUST-${String(countRow.cnt + 1).padStart(3, '0')}`;
      const customerId = uuidv4();
      const effectiveOwner = ownerId || req.user.userId;

      db.prepare(`
        INSERT INTO customers (customer_id, customer_code, customer_name, email, phone, company_name, address, city, state, status, owner_id, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(customerId, code, customerName, email, phone, companyName || null, address || null, city || null, state || null, status, effectiveOwner, notes || null, req.user.userId);

      createAuditLog({ userId: req.user.userId, action: 'Create', entityName: 'Customer', recordId: customerId, ipAddress: req.ip, details: `Created customer: ${customerName}` });

      const newCustomer = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(customerId);
      res.status(201).json({ success: true, message: 'Customer created successfully.', data: newCustomer });
    } catch (err) { next(err); }
  }
);

/**
 * PUT /api/customers/:id — Update customer
 */
router.put(
  '/:id',
  authorize('Admin', 'Manager', 'SalesExecutive'),
  [
    param('id').notEmpty(),
    body('customerName').optional().trim().notEmpty().withMessage('Customer Name cannot be empty.').isLength({ max: 100 }),
    body('email').optional().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
    body('phone').optional().matches(/^[0-9]{10}$/).withMessage('Enter a valid 10-digit phone number.'),
    body('status').optional().isIn(['Active', 'Inactive', 'Prospect']).withMessage('Invalid status.'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Customer not found.' });

      if (req.user.role === 'SalesExecutive' && existing.owner_id !== req.user.userId) {
        return res.status(403).json({ success: false, message: 'You can only edit customers assigned to you.' });
      }

      const { customerName, email, phone, companyName, address, city, state, status, ownerId, notes } = req.body;

      // Check duplicate email/phone for other records
      if (email && email !== existing.email) {
        const dup = db.prepare('SELECT customer_id FROM customers WHERE email = ? AND customer_id != ?').get(email, req.params.id);
        if (dup) return res.status(409).json({ success: false, message: 'Email already used by another customer.' });
      }
      if (phone && phone !== existing.phone) {
        const dup = db.prepare('SELECT customer_id FROM customers WHERE phone = ? AND customer_id != ?').get(phone, req.params.id);
        if (dup) return res.status(409).json({ success: false, message: 'Phone already used by another customer.' });
      }

      db.prepare(`
        UPDATE customers SET
          customer_name = COALESCE(?, customer_name),
          email = COALESCE(?, email),
          phone = COALESCE(?, phone),
          company_name = COALESCE(?, company_name),
          address = COALESCE(?, address),
          city = COALESCE(?, city),
          state = COALESCE(?, state),
          status = COALESCE(?, status),
          owner_id = COALESCE(?, owner_id),
          notes = COALESCE(?, notes),
          modified_date = datetime('now')
        WHERE customer_id = ?
      `).run(customerName || null, email || null, phone || null, companyName || null, address || null, city || null, state || null, status || null, ownerId || null, notes || null, req.params.id);

      createAuditLog({ userId: req.user.userId, action: 'Update', entityName: 'Customer', recordId: req.params.id, oldValue: existing, ipAddress: req.ip, details: `Updated customer: ${existing.customer_name}` });

      const updated = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(req.params.id);
      res.json({ success: true, message: 'Customer updated successfully.', data: updated });
    } catch (err) { next(err); }
  }
);

/**
 * DELETE /api/customers/:id — Deactivate customer (soft delete)
 */
router.delete(
  '/:id',
  authorize('Admin', 'Manager'),
  [param('id').notEmpty()],
  validateRequest,
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Customer not found.' });

      db.prepare(`UPDATE customers SET status = 'Inactive', modified_date = datetime('now') WHERE customer_id = ?`).run(req.params.id);

      createAuditLog({ userId: req.user.userId, action: 'Delete', entityName: 'Customer', recordId: req.params.id, oldValue: existing, ipAddress: req.ip, details: `Deactivated customer: ${existing.customer_name}` });
      res.json({ success: true, message: 'Customer deactivated successfully.' });
    } catch (err) { next(err); }
  }
);

module.exports = router;
