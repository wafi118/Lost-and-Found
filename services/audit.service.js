'use strict';
// Audit trail for important actions (FR-23, NFR-10): who did what, to what, and when.
const auditModel = require('../models/audit.model');

async function record(actor, action, entity = '', detail = '', ip = '') {
  try {
    await auditModel.append({
      userId: actor && actor.id ? actor.id : null,
      actor: actor && actor.name ? actor.name : 'system',
      role: actor && actor.role ? actor.role : null,
      action, entity, detail: String(detail || '').slice(0, 300), ip
    });
  } catch (err) {
    // Never let logging break the action being logged.
    console.error('[audit] failed:', err.message);
  }
}

module.exports = { record };
