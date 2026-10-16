const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { getDb } = require('../config/database');
const { authenticate, getScopeFilter } = require('../middleware/auth');
const { validateRequest } = require('../middleware/errorHandler');
const { createAuditLog } = require('../utils/auditLog');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

// GET /api/followups
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const { status, assigned, dateFrom, dateTo, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const scope = getScopeFilter(req.user, 'f.assigned_to');
    let conditions = ['1=1'];
    let params = [...scope.params];
    if (scope.condition) conditions.push(scope.condition.replace('AND ', ''));

    if (status) { conditions.push(`f.status = ?`); params.push(status); }
    if (assigned) { conditions.push(`f.assigned_to = ?`); params.push(assigned); }
    if (dateFrom) { conditions.push(`f.follow_up_date >= ?`); params.push(dateFrom); }
    if (dateTo) { conditions.push(`f.follow_up_date <= ?`); params.push(dateTo); }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const totalRow = db.prepare(`SELECT COUNT(*) as total FROM follow_ups f ${whereClause}`).get(...params);

    const followUps = db.prepare(`
      SELECT f.*,
        c.customer_name, l.lead_name,
        u.first_name || ' ' || u.last_name as assigned_name,
        CASE WHEN f.status = 'Planned' AND f.follow_up_date < date('now') THEN 1 ELSE 0 END as is_overdue
      FROM follow_ups f
      LEFT JOIN customers c ON f.customer_id = c.customer_id
      LEFT JOIN leads l ON f.lead_id = l.lead_id
      LEFT JOIN users u ON f.assigned_to = u.user_id
      ${whereClause}
      ORDER BY f.follow_up_date ASC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

    res.json({ success: true, data: followUps, pagination: { total: totalRow.total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(totalRow.total / parseInt(limit)) } });
  } catch (err) { next(err); }
});

// GET /api/followups/:id
router.get('/:id', [param('id').notEmpty()], validateRequest, (req, res, next) => {
  try {
    const db = getDb();
    const fu = db.prepare(`
      SELECT f.*, c.customer_name, l.lead_name, u.first_name || ' ' || u.last_name as assigned_name
      FROM follow_ups f
      LEFT JOIN customers c ON f.customer_id = c.customer_id
      LEFT JOIN leads l ON f.lead_id = l.lead_id
      LEFT JOIN users u ON f.assigned_to = u.user_id
      WHERE f.follow_up_id = ?
    `).get(req.params.id);
    if (!fu) return res.status(404).json({ success: false, message: 'Follow-up not found.' });
    res.json({ success: true, data: fu });
  } catch (err) { next(err); }
});

// POST /api/followups
router.post(
  '/',
  [
    body('subject').trim().notEmpty().withMessage('Subject is required.').isLength({ max: 200 }),
    body('followUpDate').isDate().withMessage('Enter a valid Follow-Up Date.').custom((value) => {
      if (new Date(value) < new Date(new Date().toDateString())) {
        throw new Error('Follow-up date cannot be earlier than today.');
      }
      return true;
    }),
    body('followUpType').isIn(['Call', 'Meeting', 'Email', 'Task']).withMessage('Invalid follow-up type.'),
    body('status').optional().isIn(['Planned', 'Completed', 'Missed', 'Cancelled']).withMessage('Invalid status.'),
  ],
  validateRequest,
  (req, res, next) => {
    try {
      const db = getDb();
      const { customerId, leadId, opportunityId, followUpDate, followUpType, subject, remarks, status = 'Planned', assignedTo } = req.body;
      const fuId = uuidv4();

      db.prepare(`
        INSERT INTO follow_ups (follow_up_id, customer_id, lead_id, opportunity_id, follow_up_date, follow_up_type, subject, remarks, status, assigned_to, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(fuId, customerId || null, leadId || null, opportunityId || null, followUpDate, followUpType, subject, remarks || null, status, assignedTo || req.user.userId, req.user.userId);

      createAuditLog({ userId: req.user.userId, action: 'Create', entityName: 'FollowUp', recordId: fuId, ipAddress: req.ip, details: `Scheduled follow-up: ${subject} on ${followUpDate}` });

      const newFU = db.prepare('SELECT * FROM follow_ups WHERE follow_up_id = ?').get(fuId);
      res.status(201).json({ success: true, message: 'Follow-up scheduled successfully.', data: newFU });
    } catch (err) { next(err); }
  }
);

// PUT /api/followups/:id
router.put(
  '/:id',
  [
    param('id').notEmpty(),
    body('subject').optional().trim().notEmpty().withMessage('Subject cannot be empty.'),
    body('followUpDate').optional().isDate().withMessage('Enter a valid Follow-Up Date.').custom((value, { req: r }) => {
      // Only enforce future date for Planned status
      const targetStatus = r.body.status;
      if ((!targetStatus || targetStatus === 'Planned') && new Date(value) < new Date(new Date().toDateString())) {
        throw new Error('Follow-up date cannot be earlier than today for a Planned follow-up.');
      }
      return true;
    }),
    body('status').optional().isIn(['Planned', 'Completed', 'Missed', 'Cancelled']).withMessage('Invalid status.'),
  ],
  validateRequest,
  (req, res, next) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM follow_ups WHERE follow_up_id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Follow-up not found.' });

      const { subject, followUpDate, followUpType, remarks, status, assignedTo } = req.body;

      db.prepare(`
        UPDATE follow_ups SET
          subject = COALESCE(?, subject),
          follow_up_date = COALESCE(?, follow_up_date),
          follow_up_type = COALESCE(?, follow_up_type),
          remarks = COALESCE(?, remarks),
          status = COALESCE(?, status),
          assigned_to = COALESCE(?, assigned_to),
          modified_date = datetime('now')
        WHERE follow_up_id = ?
      `).run(subject || null, followUpDate || null, followUpType || null, remarks || null, status || null, assignedTo || null, req.params.id);

      createAuditLog({ userId: req.user.userId, action: 'Update', entityName: 'FollowUp', recordId: req.params.id, oldValue: existing, ipAddress: req.ip, details: `Follow-up status: ${status || existing.status}` });

      const updated = db.prepare('SELECT * FROM follow_ups WHERE follow_up_id = ?').get(req.params.id);
      res.json({ success: true, message: 'Follow-up updated successfully.', data: updated });
    } catch (err) { next(err); }
  }
);

// DELETE /api/followups/:id
router.delete('/:id', [param('id').notEmpty()], validateRequest, (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM follow_ups WHERE follow_up_id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Follow-up not found.' });
    db.prepare(`UPDATE follow_ups SET status = 'Cancelled', modified_date = datetime('now') WHERE follow_up_id = ?`).run(req.params.id);
    createAuditLog({ userId: req.user.userId, action: 'Delete', entityName: 'FollowUp', recordId: req.params.id, ipAddress: req.ip });
    res.json({ success: true, message: 'Follow-up cancelled.' });
  } catch (err) { next(err); }
});

module.exports = router;
