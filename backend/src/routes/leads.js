const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { getDb } = require('../config/database');
const { authenticate, authorize, getScopeFilter } = require('../middleware/auth');
const { validateRequest } = require('../middleware/errorHandler');
const { createAuditLog } = require('../utils/auditLog');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

// GET /api/leads
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const { search, status, assigned, source, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const scope = getScopeFilter(req.user, 'l.assigned_to');
    let conditions = ['1=1'];
    let params = [...scope.params];
    if (scope.condition) conditions.push(scope.condition.replace('AND ', ''));

    if (search) {
      conditions.push(`(l.lead_name LIKE ? OR l.email LIKE ? OR l.company_name LIKE ?)`);
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (status) { conditions.push(`l.status = ?`); params.push(status); }
    if (assigned) { conditions.push(`l.assigned_to = ?`); params.push(assigned); }
    if (source) { conditions.push(`l.source = ?`); params.push(source); }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const totalRow = db.prepare(`SELECT COUNT(*) as total FROM leads l ${whereClause}`).get(...params);
    const leads = db.prepare(`
      SELECT l.*, u.first_name || ' ' || u.last_name as assigned_name
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.user_id
      ${whereClause}
      ORDER BY l.created_date DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

    res.json({ success: true, data: leads, pagination: { total: totalRow.total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(totalRow.total / parseInt(limit)) } });
  } catch (err) { next(err); }
});

// GET /api/leads/:id
router.get('/:id', [param('id').notEmpty()], validateRequest, (req, res, next) => {
  try {
    const db = getDb();
    const lead = db.prepare(`
      SELECT l.*, u.first_name || ' ' || u.last_name as assigned_name
      FROM leads l LEFT JOIN users u ON l.assigned_to = u.user_id
      WHERE l.lead_id = ?
    `).get(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });
    if (req.user.role === 'SalesExecutive' && lead.assigned_to !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    res.json({ success: true, data: lead });
  } catch (err) { next(err); }
});

// POST /api/leads
router.post(
  '/',
  [
    body('leadName').trim().notEmpty().withMessage('Lead Name is required.').isLength({ max: 100 }),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
    body('phone').optional({ checkFalsy: true }).matches(/^[0-9]{10}$/).withMessage('Enter a valid 10-digit phone number.'),
    body('status').optional().isIn(['New', 'Contacted', 'Qualified', 'Unqualified', 'Converted', 'Lost']).withMessage('Invalid status.'),
    body('priority').optional().isIn(['Low', 'Medium', 'High']).withMessage('Invalid priority.'),
    body('expectedValue').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Expected Value must be a non-negative number.'),
    body('source').optional().isIn(['Website', 'Referral', 'Cold Call', 'Email', 'LinkedIn', 'Trade Show', 'Other']).withMessage('Invalid source.'),
  ],
  validateRequest,
  (req, res, next) => {
    try {
      const db = getDb();
      const { leadName, email, phone, companyName, source, status = 'New', priority = 'Medium', expectedValue = 0, assignedTo, notes } = req.body;
      const countRow = db.prepare('SELECT COUNT(*) as cnt FROM leads').get();
      const code = `LEAD-${String(countRow.cnt + 1).padStart(3, '0')}`;
      const leadId = uuidv4();
      const effectiveOwner = assignedTo || req.user.userId;

      db.prepare(`
        INSERT INTO leads (lead_id, lead_code, lead_name, email, phone, company_name, source, status, priority, expected_value, assigned_to, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(leadId, code, leadName, email || null, phone || null, companyName || null, source || null, status, priority, expectedValue, effectiveOwner, notes || null, req.user.userId);

      createAuditLog({ userId: req.user.userId, action: 'Create', entityName: 'Lead', recordId: leadId, ipAddress: req.ip, details: `Created lead: ${leadName}` });

      const newLead = db.prepare('SELECT * FROM leads WHERE lead_id = ?').get(leadId);
      res.status(201).json({ success: true, message: 'Lead created successfully.', data: newLead });
    } catch (err) { next(err); }
  }
);

// PUT /api/leads/:id
router.put(
  '/:id',
  [
    param('id').notEmpty(),
    body('leadName').optional().trim().notEmpty().withMessage('Lead Name cannot be empty.'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
    body('phone').optional({ checkFalsy: true }).matches(/^[0-9]{10}$/).withMessage('Enter a valid 10-digit phone number.'),
    body('status').optional().isIn(['New', 'Contacted', 'Qualified', 'Unqualified', 'Converted', 'Lost']).withMessage('Invalid status.'),
    body('priority').optional().isIn(['Low', 'Medium', 'High']).withMessage('Invalid priority.'),
    body('expectedValue').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Expected Value must be non-negative.'),
  ],
  validateRequest,
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM leads WHERE lead_id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Lead not found.' });

      if (req.user.role === 'SalesExecutive' && existing.assigned_to !== req.user.userId) {
        return res.status(403).json({ success: false, message: 'You can only edit leads assigned to you.' });
      }

      const { leadName, email, phone, companyName, source, status, priority, expectedValue, assignedTo, notes } = req.body;

      // Prevent invalid status transitions
      const validTransitions = {
        'New': ['New', 'Contacted', 'Lost'],
        'Contacted': ['Contacted', 'Qualified', 'Unqualified', 'Lost'],
        'Qualified': ['Qualified', 'Converted', 'Lost'],
        'Unqualified': ['Unqualified', 'Lost'],
        'Converted': ['Converted'],
        'Lost': ['Lost'],
      };
      if (status && !validTransitions[existing.status]?.includes(status)) {
        return res.status(400).json({ success: false, message: `Cannot transition lead status from '${existing.status}' to '${status}'.` });
      }

      db.prepare(`
        UPDATE leads SET
          lead_name = COALESCE(?, lead_name),
          email = COALESCE(?, email),
          phone = COALESCE(?, phone),
          company_name = COALESCE(?, company_name),
          source = COALESCE(?, source),
          status = COALESCE(?, status),
          priority = COALESCE(?, priority),
          expected_value = COALESCE(?, expected_value),
          assigned_to = COALESCE(?, assigned_to),
          notes = COALESCE(?, notes),
          modified_date = datetime('now')
        WHERE lead_id = ?
      `).run(leadName || null, email || null, phone || null, companyName || null, source || null, status || null, priority || null, expectedValue !== undefined ? expectedValue : null, assignedTo || null, notes || null, req.params.id);

      createAuditLog({ userId: req.user.userId, action: 'Update', entityName: 'Lead', recordId: req.params.id, oldValue: existing, ipAddress: req.ip });

      const updated = db.prepare('SELECT * FROM leads WHERE lead_id = ?').get(req.params.id);
      res.json({ success: true, message: 'Lead updated successfully.', data: updated });
    } catch (err) { next(err); }
  }
);

// POST /api/leads/:id/convert — Convert lead to customer/opportunity
router.post('/:id/convert', authorize('Admin', 'Manager', 'SalesExecutive'), (req, res, next) => {
  try {
    const db = getDb();
    const lead = db.prepare('SELECT * FROM leads WHERE lead_id = ?').get(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });
    if (lead.status !== 'Qualified') return res.status(400).json({ success: false, message: 'Only Qualified leads can be converted.' });

    const customerId = uuidv4();
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM customers').get();
    const code = `CUST-${String(countRow.cnt + 1).padStart(3, '0')}`;

    // Create customer from lead
    db.prepare(`
      INSERT INTO customers (customer_id, customer_code, customer_name, email, phone, company_name, status, owner_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 'Active', ?, ?)
    `).run(customerId, code, lead.lead_name, lead.email, lead.phone, lead.company_name, lead.assigned_to || req.user.userId, req.user.userId);

    // Update lead status
    db.prepare(`UPDATE leads SET status = 'Converted', converted_customer_id = ?, converted_date = datetime('now'), modified_date = datetime('now') WHERE lead_id = ?`).run(customerId, req.params.id);

    createAuditLog({ userId: req.user.userId, action: 'ConvertLead', entityName: 'Lead', recordId: req.params.id, ipAddress: req.ip, details: `Converted lead to customer: ${customerId}` });

    res.json({ success: true, message: 'Lead converted to customer successfully.', data: { customerId, customerCode: code } });
  } catch (err) { next(err); }
});

// DELETE /api/leads/:id
router.delete('/:id', authorize('Admin', 'Manager'), [param('id').notEmpty()], validateRequest, (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM leads WHERE lead_id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Lead not found.' });

    db.prepare(`UPDATE leads SET status = 'Lost', modified_date = datetime('now') WHERE lead_id = ?`).run(req.params.id);
    createAuditLog({ userId: req.user.userId, action: 'Delete', entityName: 'Lead', recordId: req.params.id, ipAddress: req.ip });
    res.json({ success: true, message: 'Lead marked as lost.' });
  } catch (err) { next(err); }
});

module.exports = router;
