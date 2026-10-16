const express = require('express');
const router = express.Router();
const { getDb } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// GET /api/reports/customers
router.get('/customers', authorize('Admin', 'Manager'), (req, res, next) => {
  try {
    const db = getDb();
    const { status, owner, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let conditions = ['1=1']; let params = [];
    if (status) { conditions.push('c.status = ?'); params.push(status); }
    if (owner) { conditions.push('c.owner_id = ?'); params.push(owner); }
    if (dateFrom) { conditions.push("c.created_date >= ?"); params.push(dateFrom); }
    if (dateTo) { conditions.push("c.created_date <= ?"); params.push(dateTo + ' 23:59:59'); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM customers c ${where}`).get(...params).cnt;
    const data = db.prepare(`
      SELECT c.*, u.first_name || ' ' || u.last_name as owner_name
      FROM customers c LEFT JOIN users u ON c.owner_id = u.user_id
      ${where} ORDER BY c.created_date DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);
    res.json({ success: true, data, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) { next(err); }
});

// GET /api/reports/leads
router.get('/leads', authorize('Admin', 'Manager'), (req, res, next) => {
  try {
    const db = getDb();
    const { status, source, owner, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let conditions = ['1=1']; let params = [];
    if (status) { conditions.push('l.status = ?'); params.push(status); }
    if (source) { conditions.push('l.source = ?'); params.push(source); }
    if (owner) { conditions.push('l.assigned_to = ?'); params.push(owner); }
    if (dateFrom) { conditions.push("l.created_date >= ?"); params.push(dateFrom); }
    if (dateTo) { conditions.push("l.created_date <= ?"); params.push(dateTo + ' 23:59:59'); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM leads l ${where}`).get(...params).cnt;
    const data = db.prepare(`
      SELECT l.*, u.first_name || ' ' || u.last_name as assigned_name
      FROM leads l LEFT JOIN users u ON l.assigned_to = u.user_id
      ${where} ORDER BY l.created_date DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);
    res.json({ success: true, data, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) { next(err); }
});

// GET /api/reports/opportunities
router.get('/opportunities', (req, res, next) => {
  try {
    const db = getDb();
    const { stage, status, owner, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let conditions = ['1=1']; let params = [];
    if (req.user.role === 'SalesExecutive') { conditions.push('o.assigned_to = ?'); params.push(req.user.userId); }
    if (stage) { conditions.push('o.stage = ?'); params.push(stage); }
    if (status) { conditions.push('o.status = ?'); params.push(status); }
    if (owner && req.user.role !== 'SalesExecutive') { conditions.push('o.assigned_to = ?'); params.push(owner); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM opportunities o ${where}`).get(...params).cnt;
    const data = db.prepare(`
      SELECT o.*, c.customer_name, u.first_name || ' ' || u.last_name as assigned_name,
             ROUND(o.amount * o.probability / 100.0, 2) as weighted_value
      FROM opportunities o
      LEFT JOIN customers c ON o.customer_id = c.customer_id
      LEFT JOIN users u ON o.assigned_to = u.user_id
      ${where} ORDER BY o.expected_close_date ASC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);
    res.json({ success: true, data, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) { next(err); }
});

// GET /api/reports/pipeline — Stage-wise pipeline
router.get('/pipeline', authorize('Admin', 'Manager'), (req, res, next) => {
  try {
    const db = getDb();
    const stageData = db.prepare(`
      SELECT o.stage,
             COUNT(*) as count,
             COALESCE(SUM(o.amount), 0) as total_amount,
             COALESCE(SUM(o.amount * o.probability / 100.0), 0) as weighted_amount
      FROM opportunities o WHERE o.status = 'Open'
      GROUP BY o.stage ORDER BY o.stage
    `).all();

    const ownerData = db.prepare(`
      SELECT u.first_name || ' ' || u.last_name as owner_name,
             COUNT(*) as count,
             COALESCE(SUM(o.amount), 0) as total_amount
      FROM opportunities o
      LEFT JOIN users u ON o.assigned_to = u.user_id
      WHERE o.status = 'Open'
      GROUP BY o.assigned_to ORDER BY total_amount DESC
    `).all();

    res.json({ success: true, data: { byStage: stageData, byOwner: ownerData } });
  } catch (err) { next(err); }
});

// GET /api/reports/followups
router.get('/followups', (req, res, next) => {
  try {
    const db = getDb();
    const { status, assigned, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let conditions = ['1=1']; let params = [];
    if (req.user.role === 'SalesExecutive') { conditions.push('f.assigned_to = ?'); params.push(req.user.userId); }
    if (status) { conditions.push('f.status = ?'); params.push(status); }
    if (assigned && req.user.role !== 'SalesExecutive') { conditions.push('f.assigned_to = ?'); params.push(assigned); }
    if (dateFrom) { conditions.push("f.follow_up_date >= ?"); params.push(dateFrom); }
    if (dateTo) { conditions.push("f.follow_up_date <= ?"); params.push(dateTo); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM follow_ups f ${where}`).get(...params).cnt;
    const data = db.prepare(`
      SELECT f.*, c.customer_name, l.lead_name, u.first_name || ' ' || u.last_name as assigned_name,
             CASE WHEN f.status = 'Planned' AND f.follow_up_date < date('now') THEN 1 ELSE 0 END as is_overdue
      FROM follow_ups f
      LEFT JOIN customers c ON f.customer_id = c.customer_id
      LEFT JOIN leads l ON f.lead_id = l.lead_id
      LEFT JOIN users u ON f.assigned_to = u.user_id
      ${where} ORDER BY f.follow_up_date DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);
    res.json({ success: true, data, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) { next(err); }
});

// GET /api/reports/conversion — Lead conversion metrics
router.get('/conversion', authorize('Admin', 'Manager'), (req, res, next) => {
  try {
    const db = getDb();
    const conversionData = db.prepare(`
      SELECT
        COUNT(*) as total_leads,
        SUM(CASE WHEN status = 'Converted' THEN 1 ELSE 0 END) as converted,
        SUM(CASE WHEN status = 'Lost' THEN 1 ELSE 0 END) as lost,
        SUM(CASE WHEN status NOT IN ('Converted','Lost') THEN 1 ELSE 0 END) as open,
        ROUND(100.0 * SUM(CASE WHEN status = 'Converted' THEN 1 ELSE 0 END) / COUNT(*), 2) as conversion_rate
      FROM leads
    `).get();

    const bySource = db.prepare(`
      SELECT source, COUNT(*) as total,
             SUM(CASE WHEN status = 'Converted' THEN 1 ELSE 0 END) as converted
      FROM leads GROUP BY source ORDER BY total DESC
    `).all();

    res.json({ success: true, data: { summary: conversionData, bySource } });
  } catch (err) { next(err); }
});

// GET /api/reports/audit
router.get('/audit', authorize('Admin'), (req, res, next) => {
  try {
    const db = getDb();
    const { userId, module, action, dateFrom, dateTo, result, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let conditions = ['1=1']; let params = [];
    if (userId) { conditions.push('al.user_id = ?'); params.push(userId); }
    if (module) { conditions.push('al.entity_name = ?'); params.push(module); }
    if (action) { conditions.push('al.action = ?'); params.push(action); }
    if (result) { conditions.push('al.result = ?'); params.push(result); }
    if (dateFrom) { conditions.push("al.created_date >= ?"); params.push(dateFrom); }
    if (dateTo) { conditions.push("al.created_date <= ?"); params.push(dateTo + ' 23:59:59'); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM audit_logs al ${where}`).get(...params).cnt;
    const data = db.prepare(`
      SELECT al.*, u.username, u.email FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.user_id
      ${where} ORDER BY al.created_date DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);
    res.json({ success: true, data, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) { next(err); }
});

// GET /api/reports/user-activity
router.get('/user-activity', authorize('Admin', 'Manager'), (req, res, next) => {
  try {
    const db = getDb();
    const data = db.prepare(`
      SELECT u.username, u.first_name || ' ' || u.last_name as full_name, r.role_name,
             COUNT(al.audit_log_id) as total_actions,
             SUM(CASE WHEN al.action = 'Create' THEN 1 ELSE 0 END) as creates,
             SUM(CASE WHEN al.action = 'Update' THEN 1 ELSE 0 END) as updates,
             SUM(CASE WHEN al.action = 'Delete' THEN 1 ELSE 0 END) as deletes,
             SUM(CASE WHEN al.action = 'Login' THEN 1 ELSE 0 END) as logins
      FROM users u
      LEFT JOIN audit_logs al ON al.user_id = u.user_id
      JOIN roles r ON u.role_id = r.role_id
      WHERE u.is_active = 1
      GROUP BY u.user_id ORDER BY total_actions DESC
    `).all();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
