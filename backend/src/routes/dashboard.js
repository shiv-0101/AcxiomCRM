const express = require('express');
const router = express.Router();
const { getDb } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// GET /api/dashboard — Role-based KPIs
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const { role, userId } = req.user;
    const isAdmin = role === 'Admin';
    const isManager = role === 'Manager';
    const isSales = role === 'SalesExecutive';

    // Scope filter
    const scopeParam = (isSales) ? [userId] : [];
    const scopeCustomerCond = isSales ? 'WHERE owner_id = ?' : '';
    const scopeLeadCond = isSales ? 'WHERE assigned_to = ?' : '';
    const scopeOppCond = isSales ? 'WHERE assigned_to = ?' : '';
    const scopeFUCond = isSales ? 'WHERE assigned_to = ?' : '';

    const totalCustomers = db.prepare(`SELECT COUNT(*) as cnt FROM customers ${scopeCustomerCond}`).get(...scopeParam).cnt;
    const totalLeads = db.prepare(`SELECT COUNT(*) as cnt FROM leads ${scopeLeadCond}`).get(...scopeParam).cnt;
    const openLeads = db.prepare(`SELECT COUNT(*) as cnt FROM leads WHERE status NOT IN ('Converted','Lost') ${isSales ? 'AND assigned_to = ?' : ''}`).get(...scopeParam).cnt;

    const totalOpps = db.prepare(`SELECT COUNT(*) as cnt FROM opportunities ${scopeOppCond}`).get(...scopeParam).cnt;
    const openOpps = db.prepare(`SELECT COUNT(*) as cnt FROM opportunities WHERE status = 'Open' ${isSales ? 'AND assigned_to = ?' : ''}`).get(...scopeParam).cnt;
    const wonOpps = db.prepare(`SELECT COUNT(*) as cnt FROM opportunities WHERE status = 'Won' ${isSales ? 'AND assigned_to = ?' : ''}`).get(...scopeParam).cnt;
    const lostOpps = db.prepare(`SELECT COUNT(*) as cnt FROM opportunities WHERE status = 'Lost' ${isSales ? 'AND assigned_to = ?' : ''}`).get(...scopeParam).cnt;

    const pipelineValue = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM opportunities WHERE status = 'Open' ${isSales ? 'AND assigned_to = ?' : ''}`).get(...scopeParam).total;
    const weightedPipeline = db.prepare(`SELECT COALESCE(SUM(amount * probability / 100.0), 0) as total FROM opportunities WHERE status = 'Open' ${isSales ? 'AND assigned_to = ?' : ''}`).get(...scopeParam).total;

    const pendingFollowUps = db.prepare(`SELECT COUNT(*) as cnt FROM follow_ups WHERE status = 'Planned' ${isSales ? 'AND assigned_to = ?' : ''}`).get(...scopeParam).cnt;
    const overdueFollowUps = db.prepare(`SELECT COUNT(*) as cnt FROM follow_ups WHERE status = 'Planned' AND follow_up_date < date('now') ${isSales ? 'AND assigned_to = ?' : ''}`).get(...scopeParam).cnt;

    // Chart data
    const leadsByStatus = db.prepare(`
      SELECT status, COUNT(*) as count FROM leads ${scopeLeadCond}
      GROUP BY status
    `).all(...scopeParam);

    const oppsByStage = db.prepare(`
      SELECT stage, COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
      FROM opportunities ${scopeOppCond}
      GROUP BY stage
    `).all(...scopeParam);

    const monthlySales = db.prepare(`
      SELECT strftime('%Y-%m', expected_close_date) as month,
             COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
      FROM opportunities WHERE status = 'Won' ${isSales ? 'AND assigned_to = ?' : ''}
      GROUP BY month ORDER BY month DESC LIMIT 12
    `).all(...scopeParam);

    // Admin-only stats
    let adminStats = null;
    if (isAdmin) {
      adminStats = {
        totalUsers: db.prepare('SELECT COUNT(*) as cnt FROM users WHERE is_active = 1').get().cnt,
        lockedAccounts: db.prepare(`SELECT COUNT(*) as cnt FROM users WHERE lockout_end > datetime('now')`).get().cnt,
        recentAuditLogs: db.prepare(`
          SELECT al.*, u.username FROM audit_logs al
          LEFT JOIN users u ON al.user_id = u.user_id
          ORDER BY al.created_date DESC LIMIT 5
        `).all(),
      };
    }

    // Recent activities
    const recentFollowUps = db.prepare(`
      SELECT f.*, c.customer_name, l.lead_name FROM follow_ups f
      LEFT JOIN customers c ON f.customer_id = c.customer_id
      LEFT JOIN leads l ON f.lead_id = l.lead_id
      WHERE f.status = 'Planned' ${isSales ? 'AND f.assigned_to = ?' : ''}
      ORDER BY f.follow_up_date ASC LIMIT 5
    `).all(...scopeParam);

    res.json({
      success: true,
      data: {
        kpis: {
          totalCustomers, totalLeads, openLeads,
          totalOpportunities: totalOpps, openOpportunities: openOpps,
          wonOpportunities: wonOpps, lostOpportunities: lostOpps,
          pipelineValue: Math.round(pipelineValue),
          weightedPipelineValue: Math.round(weightedPipeline),
          pendingFollowUps, overdueFollowUps,
        },
        charts: {
          leadsByStatus,
          opportunitiesByStage: oppsByStage,
          monthlySales,
        },
        recentFollowUps,
        adminStats,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
