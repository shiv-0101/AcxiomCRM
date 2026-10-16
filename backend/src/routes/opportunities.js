const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { getDb } = require('../config/database');
const { authenticate, authorize, getScopeFilter } = require('../middleware/auth');
const { validateRequest } = require('../middleware/errorHandler');
const { createAuditLog } = require('../utils/auditLog');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

// GET /api/opportunities
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const { search, stage, status, assigned, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const scope = getScopeFilter(req.user, 'o.assigned_to');
    let conditions = ['1=1'];
    let params = [...scope.params];
    if (scope.condition) conditions.push(scope.condition.replace('AND ', ''));

    if (search) {
      conditions.push(`(o.opportunity_name LIKE ? OR c.customer_name LIKE ?)`);
      const s = `%${search}%`;
      params.push(s, s);
    }
    if (stage) { conditions.push(`o.stage = ?`); params.push(stage); }
    if (status) { conditions.push(`o.status = ?`); params.push(status); }
    if (assigned) { conditions.push(`o.assigned_to = ?`); params.push(assigned); }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const totalRow = db.prepare(`
      SELECT COUNT(*) as total FROM opportunities o
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      ${whereClause}
    `).get(...params);

    const opps = db.prepare(`
      SELECT o.*, c.customer_name, u.first_name || ' ' || u.last_name as assigned_name,
             ROUND(o.amount * o.probability / 100.0, 2) as weighted_value
      FROM opportunities o
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      LEFT JOIN users u ON o.assigned_to = u.user_id
      ${whereClause}
      ORDER BY o.created_date DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

    res.json({ success: true, data: opps, pagination: { total: totalRow.total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(totalRow.total / parseInt(limit)) } });
  } catch (err) { next(err); }
});

// GET /api/opportunities/:id
router.get('/:id', [param('id').notEmpty()], validateRequest, (req, res, next) => {
  try {
    const db = getDb();
    const opp = db.prepare(`
      SELECT o.*, c.customer_name, u.first_name || ' ' || u.last_name as assigned_name,
             ROUND(o.amount * o.probability / 100.0, 2) as weighted_value
      FROM opportunities o
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      LEFT JOIN users u ON o.assigned_to = u.user_id
      WHERE o.opportunity_id = ?
    `).get(req.params.id);

    if (!opp) return res.status(404).json({ success: false, message: 'Opportunity not found.' });
    if (req.user.role === 'SalesExecutive' && opp.assigned_to !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    res.json({ success: true, data: opp });
  } catch (err) { next(err); }
});

// POST /api/opportunities
router.post(
  '/',
  [
    body('opportunityName').trim().notEmpty().withMessage('Opportunity Name is required.').isLength({ max: 150 }),
    body('amount').isFloat({ gt: 0 }).withMessage('Opportunity Amount must be greater than 0.'),
    body('stage').isIn(['Qualification', 'Proposal', 'Negotiation', 'Won', 'Lost']).withMessage('Invalid stage.'),
    body('probability').isInt({ min: 0, max: 100 }).withMessage('Probability must be between 0 and 100.'),
    body('expectedCloseDate').isDate().withMessage('Enter a valid Expected Close Date.').custom((value) => {
      if (new Date(value) < new Date(new Date().toDateString())) {
        throw new Error('Expected Close Date cannot be in the past.');
      }
      return true;
    }),
    body('status').optional().isIn(['Open', 'Won', 'Lost', 'Cancelled']).withMessage('Invalid status.'),
  ],
  validateRequest,
  (req, res, next) => {
    try {
      const db = getDb();
      const { opportunityName, customerId, leadId, amount, stage, probability, expectedCloseDate, status = 'Open', source, notes, assignedTo } = req.body;
      const oppId = uuidv4();
      const effectiveOwner = assignedTo || req.user.userId;

      // Validate customer exists if provided
      if (customerId) {
        const cust = db.prepare('SELECT customer_id FROM customers WHERE customer_id = ?').get(customerId);
        if (!cust) return res.status(400).json({ success: false, message: 'Customer not found.' });
      }

      db.prepare(`
        INSERT INTO opportunities (opportunity_id, opportunity_name, customer_id, lead_id, amount, stage, probability, expected_close_date, status, source, notes, assigned_to, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(oppId, opportunityName, customerId || null, leadId || null, amount, stage, probability, expectedCloseDate, status, source || null, notes || null, effectiveOwner, req.user.userId);

      createAuditLog({ userId: req.user.userId, action: 'Create', entityName: 'Opportunity', recordId: oppId, ipAddress: req.ip, details: `Created opportunity: ${opportunityName}, Amount: ${amount}` });

      const newOpp = db.prepare('SELECT * FROM opportunities WHERE opportunity_id = ?').get(oppId);
      res.status(201).json({ success: true, message: 'Opportunity created successfully.', data: newOpp });
    } catch (err) { next(err); }
  }
);

// PUT /api/opportunities/:id
router.put(
  '/:id',
  [
    param('id').notEmpty(),
    body('opportunityName').optional().trim().notEmpty().withMessage('Opportunity Name cannot be empty.'),
    body('amount').optional().isFloat({ gt: 0 }).withMessage('Opportunity Amount must be greater than 0.'),
    body('stage').optional().isIn(['Qualification', 'Proposal', 'Negotiation', 'Won', 'Lost']).withMessage('Invalid stage.'),
    body('probability').optional().isInt({ min: 0, max: 100 }).withMessage('Probability must be between 0 and 100.'),
    body('expectedCloseDate').optional().isDate().withMessage('Enter a valid Expected Close Date.').custom((value) => {
      if (new Date(value) < new Date(new Date().toDateString())) {
        throw new Error('Expected Close Date cannot be in the past.');
      }
      return true;
    }),
  ],
  validateRequest,
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM opportunities WHERE opportunity_id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Opportunity not found.' });

      if (req.user.role === 'SalesExecutive' && existing.assigned_to !== req.user.userId) {
        return res.status(403).json({ success: false, message: 'You can only edit opportunities assigned to you.' });
      }

      const { opportunityName, customerId, amount, stage, probability, expectedCloseDate, status, source, notes, assignedTo } = req.body;

      // Determine new status from stage
      let newStatus = status || existing.status;
      if (stage === 'Won') newStatus = 'Won';
      if (stage === 'Lost') newStatus = 'Lost';

      db.prepare(`
        UPDATE opportunities SET
          opportunity_name = COALESCE(?, opportunity_name),
          customer_id = COALESCE(?, customer_id),
          amount = COALESCE(?, amount),
          stage = COALESCE(?, stage),
          probability = COALESCE(?, probability),
          expected_close_date = COALESCE(?, expected_close_date),
          status = ?,
          source = COALESCE(?, source),
          notes = COALESCE(?, notes),
          assigned_to = COALESCE(?, assigned_to),
          modified_date = datetime('now')
        WHERE opportunity_id = ?
      `).run(opportunityName || null, customerId || null, amount || null, stage || null, probability !== undefined ? probability : null, expectedCloseDate || null, newStatus, source || null, notes || null, assignedTo || null, req.params.id);

      createAuditLog({ userId: req.user.userId, action: 'Update', entityName: 'Opportunity', recordId: req.params.id, oldValue: existing, ipAddress: req.ip });

      const updated = db.prepare(`
        SELECT o.*, c.customer_name, ROUND(o.amount * o.probability / 100.0, 2) as weighted_value
        FROM opportunities o LEFT JOIN customers c ON o.customer_id = c.customer_id
        WHERE o.opportunity_id = ?
      `).get(req.params.id);
      res.json({ success: true, message: 'Opportunity updated successfully.', data: updated });
    } catch (err) { next(err); }
  }
);

// DELETE /api/opportunities/:id
router.delete('/:id', authorize('Admin', 'Manager'), [param('id').notEmpty()], validateRequest, (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM opportunities WHERE opportunity_id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Opportunity not found.' });

    db.prepare(`UPDATE opportunities SET status = 'Cancelled', modified_date = datetime('now') WHERE opportunity_id = ?`).run(req.params.id);
    createAuditLog({ userId: req.user.userId, action: 'Delete', entityName: 'Opportunity', recordId: req.params.id, ipAddress: req.ip });
    res.json({ success: true, message: 'Opportunity cancelled.' });
  } catch (err) { next(err); }
});

module.exports = router;
