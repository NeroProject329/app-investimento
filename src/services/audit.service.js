function writeAudit(db, { actorUserId, action, entityType, entityId, metadata, ip, userAgent }) {
  return db.auditLog.create({
    data: {
      actorUserId: actorUserId || null,
      action,
      entityType,
      entityId: entityId || null,
      metadata: metadata || null,
      ip: ip || null,
      userAgent: userAgent || null,
    },
  });
}

module.exports = { writeAudit };
