const { getDb } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Creates an audit log entry (append-only, never updated or deleted)
 */
function createAuditLog({ userId, action, entityName, recordId, oldValue, newValue, ipAddress, details, result = 'Success' }) {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO audit_logs (audit_log_id, user_id, action, entity_name, record_id, old_value, new_value, ip_address, details, result)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      uuidv4(),
      userId || null,
      action,
      entityName,
      recordId || null,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      ipAddress || null,
      details || null,
      result
    );
  } catch (err) {
    // Audit log failures should not break the main request
    console.error('[AuditLog] Failed to write audit log:', err.message);
  }
}

/**
 * Middleware factory to audit CRM operations
 */
function auditMiddleware(action, entityName) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode < 400) {
        createAuditLog({
          userId: req.user?.userId,
          action,
          entityName,
          recordId: req.params?.id || res.locals?.recordId,
          ipAddress: req.ip,
          details: `${action} ${entityName} via API`,
          result: 'Success',
        });
      }
    });
    next();
  };
}

module.exports = { createAuditLog, auditMiddleware };
