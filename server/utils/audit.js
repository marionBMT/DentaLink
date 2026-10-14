const AuditEvent = require("../models/AuditEvent");

async function audit(req, action, details = {}) {
  try {
    await AuditEvent.create({
      action,
      outcome: details.outcome || "success",
      actor: details.actor || req.user?.id || null,
      targetType: details.targetType || "",
      targetId: details.targetId ? String(details.targetId) : "",
      ip: req.ip || req.socket?.remoteAddress || "",
      userAgent: req.get("user-agent") || "",
      requestId: req.id || "",
      metadata: details.metadata || {},
    });
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      event: "audit_write_failed",
      action,
      requestId: req.id,
      message: err.message,
    }));
  }
}

module.exports = audit;