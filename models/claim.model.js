'use strict';
const { query, one, tx } = require('../db');
const { id, dt, eventsOf, inList } = require('../db/shape');

const CLAIM_FROM = `
  SELECT cl.*, decider.name AS decided_by_name,
    COALESCE((
      SELECT json_agg(json_build_object(
        'at', ev.at, 'key', ev.key, 'params', ev.params, 'staffOnly', ev.staff_only
      ) ORDER BY ev.id)
      FROM claim_events ev WHERE ev.claim_id = cl.id
    ), '[]'::json) AS events
  FROM claims cl
  LEFT JOIN users decider ON decider.id = cl.decided_by
`;

function toClaim(row) {
  if (!row) return null;
  const proof = (row.proof_file || row.proof_at) ? {
    file: row.proof_file, mime: row.proof_mime, at: dt(row.proof_at)
  } : null;
  let verification = null;
  if (row.decided_at) {
    verification = {
      by: id(row.decided_by), byName: row.decided_by_name || '', at: dt(row.decided_at),
      note: row.decision_note || ''
    };
    if (row.decision_tier != null) verification.tier = Number(row.decision_tier);
  }
  return {
    id: id(row.id), foundCaseId: id(row.found_case_id), lostCaseId: id(row.lost_case_id),
    userId: id(row.user_id), statement: row.statement, lostAt: null, locationId: null,
    status: row.status, proof, proofNote: row.proof_note || '', proofRequestedNote: row.proof_requested_note || '',
    verification, events: eventsOf(row.events), createdAt: dt(row.created_at), updatedAt: dt(row.updated_at)
  };
}

async function replaceEvents(claimId, events) {
  await query('DELETE FROM claim_events WHERE claim_id = $1', [claimId]);
  for (const e of events || []) {
    await query(
      'INSERT INTO claim_events (claim_id, at, key, params, staff_only) VALUES ($1, $2, $3, $4::jsonb, $5)',
      [claimId, e.at || new Date(), e.key, JSON.stringify(e.params || {}), !!e.staffOnly]
    );
  }
}

async function create(d) {
  return tx(async () => {
    const now = d.createdAt || new Date();
    const row = await one(
      `INSERT INTO claims (found_case_id, lost_case_id, user_id, statement, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'submitted', $5, $5) RETURNING id`,
      [Number(d.foundCaseId), d.lostCaseId ? Number(d.lostCaseId) : null, Number(d.userId), d.statement, now]
    );
    if (d.events && d.events.length) await replaceEvents(id(row.id), d.events);
    return get(row.id);
  });
}

const get = async (n) => toClaim(await one(`${CLAIM_FROM} WHERE cl.id = $1`, [Number(n)]));

async function update(n, patch) {
  const claimId = Number(n);
  return tx(async () => {
    const sets = ['updated_at = now()'];
    const params = [];
    const push = (column, value) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if (Object.prototype.hasOwnProperty.call(patch, 'status')) push('status', patch.status);
    if (Object.prototype.hasOwnProperty.call(patch, 'statement')) push('statement', patch.statement);
    if (Object.prototype.hasOwnProperty.call(patch, 'lostCaseId')) push('lost_case_id', patch.lostCaseId || null);
    if (Object.prototype.hasOwnProperty.call(patch, 'proofNote')) push('proof_note', patch.proofNote || '');
    if (Object.prototype.hasOwnProperty.call(patch, 'proofRequestedNote')) push('proof_requested_note', patch.proofRequestedNote || '');
    if (Object.prototype.hasOwnProperty.call(patch, 'proof')) {
      const p = patch.proof;
      push('proof_file', p && p.file);
      push('proof_mime', p && p.mime);
      push('proof_at', p && p.at);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'verification')) {
      const v = patch.verification;
      push('decided_by', v && v.by);
      push('decided_at', v && v.at);
      push('decision_tier', v && v.tier != null ? v.tier : null);
      push('decision_note', v ? (v.note || '') : '');
    }
    params.push(claimId);
    await query(`UPDATE claims SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    if (Object.prototype.hasOwnProperty.call(patch, 'events')) await replaceEvents(claimId, patch.events);
    return get(claimId);
  });
}

const forCase = async (caseId) => (await query(
  `${CLAIM_FROM} WHERE cl.found_case_id = $1 ORDER BY cl.created_at DESC`,
  [Number(caseId)]
)).map(toClaim);

const forUser = async (userId) => (await query(
  `${CLAIM_FROM} WHERE cl.user_id = $1 ORDER BY cl.created_at DESC`,
  [Number(userId)]
)).map(toClaim);

async function listByStatuses(statuses) {
  const params = [];
  const where = inList('cl.status', statuses, params);
  return (await query(`${CLAIM_FROM} WHERE ${where} ORDER BY cl.created_at ASC`, params)).map(toClaim);
}

const all = async () => (await query(`${CLAIM_FROM} ORDER BY cl.id`)).map(toClaim);

const findByProof = async (file) => toClaim(await one(`${CLAIM_FROM} WHERE cl.proof_file = $1`, [file]));

module.exports = { create, get, update, forCase, forUser, listByStatuses, all, findByProof };
