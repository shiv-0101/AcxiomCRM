const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { getDb } = require('../config/database');
const { authenticate, getScopeFilter } = require('../middleware/auth');
const { validateRequest } = require('../middleware/errorHandler');
const { createAuditLog } = require('../utils/auditLog');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

// GET /api/activities
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const { activityType, status, assigned, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const scope = getScopeFilter(req.user, 'a.assigned_to');
    let conditions = ['1=1']; let params = [...scope.params];
    if (scope.condition) conditions.push(scope.condition.replace('AND ', ''));
    if (activityType) { conditions.push('a.activity_type = ?'); params.push(activityType); }
    if (status) { conditions.push('a.status = ?'); params.push(status); }
    if (assigned) { conditions.push('a.assigned_to = ?'); params.push(assigned); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM activities a ${where}`).get(...params).cnt;
    const data = db.prepare(`
      SELECT a.*, c.customer_name, l.lead_name, u.first_name || ' ' || u.last_name as assigned_name
      FROM activities a
      LEFT JOIN customers c ON a.customer_id = c.customer_id
      LEFT JOIN leads l ON a.lead_id = l.lead_id
      LEFT JOIN users u ON a.assigned_to = u.user_id
      ${where} ORDER BY a.activity_date DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);
    res.json({ success: true, data, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) { next(err); }
});

// POST /api/activities
router.post(
  '/',
  [
    body('activityType').isIn(['Call', 'Meeting', 'Email', 'Task']).withMessage('Invalid activity type.'),
    body('subject').trim().notEmpty().withMessage('Subject is required.').isLength({ max: 200 }),
    body('activityDate').isDate().withMessage('Enter a valid activity date.'),
    body('status').optional().isIn(['Planned', 'Completed', 'Cancelled']).withMessage('Invalid status.'),
  ],
  validateRequest,
  (req, res, next) => {
    try {
      const db = getDb();
      const { activityType, subject, description, activityDate, customerId, leadId, opportunityId, assignedTo, status = 'Planned' } = req.body;
      const actId = uuidv4();
      db.prepare(`
        INSERT INTO activities (activity_id, activity_type, subject, description, activity_date, customer_id, lead_id, opportunity_id, assigned_to, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(actId, activityType, subject, description || null, activityDate, customerId || null, leadId || null, opportunityId || null, assignedTo || req.user.userId, status, req.user.userId);

      createAuditLog({ userId: req.user.userId, action: 'Create', entityName: 'Activity', recordId: actId, ipAddress: req.ip });
      const newAct = db.prepare('SELECT * FROM activities WHERE activity_id = ?').get(actId);
      res.status(201).json({ success: true, message: 'Activity created.', data: newAct });
    } catch (err) { next(err); }
  }
);

// PUT /api/activities/:id
router.put('/:id', [param('id').notEmpty()], validateRequest, (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM activities WHERE activity_id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Activity not found.' });

    const { subject, description, activityDate, status } = req.body;
    db.prepare(`UPDATE activities SET subject = COALESCE(?, subject), description = COALESCE(?, description), activity_date = COALESCE(?, activity_date), status = COALESCE(?, status), modified_date = datetime('now') WHERE activity_id = ?`).run(subject || null, description || null, activityDate || null, status || null, req.params.id);

    createAuditLog({ userId: req.user.userId, action: 'Update', entityName: 'Activity', recordId: req.params.id, ipAddress: req.ip });
    res.json({ success: true, message: 'Activity updated.' });
  } catch (err) { next(err); }
});

// DELETE /api/activities/:id
router.delete('/:id', [param('id').notEmpty()], validateRequest, (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM activities WHERE activity_id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Activity not found.' });
    db.prepare(`UPDATE activities SET status = 'Cancelled', modified_date = datetime('now') WHERE activity_id = ?`).run(req.params.id);
    createAuditLog({ userId: req.user.userId, action: 'Delete', entityName: 'Activity', recordId: req.params.id, ipAddress: req.ip });
    res.json({ success: true, message: 'Activity cancelled.' });
  } catch (err) { next(err); }
});

module.exports = router;
