'use strict';

const { AuditLog } = require('../models');
const logger = require('../config/logger');

const REDACT = new Set(['passwordHash', 'password', 'secret', 'codeHash', 'tokenHash', 'mfa']);

function diff(before = {}, after = {}) {
  const changes = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) {
    if (REDACT.has(k)) continue;
    const a = JSON.stringify(before?.[k]);
    const b = JSON.stringify(after?.[k]);
    if (a !== b) changes[k] = { from: before?.[k], to: after?.[k] };
  }
  return changes;
}

/** Record a sensitive admin action. Never throws (audit failures are logged). */
async function audit(req, { action, entity, entityId, summary, before, after, changes }) {
  try {
    await AuditLog.create({
      actor: req?.admin?._id || req?.user?._id,
      actorEmail: req?.admin?.email || req?.user?.email,
      actorRole: req?.admin?.role || req?.user?.role || 'system',
      action,
      entity,
      entityId: entityId ? String(entityId) : undefined,
      summary,
      changes: changes || (before || after ? diff(before, after) : undefined),
      ip: req?.ip,
      userAgent: req?.headers?.['user-agent']?.slice(0, 300),
    });
  } catch (err) {
    logger.error({ err, action }, 'Failed to write audit log');
  }
}

module.exports = { audit, diff };
