'use strict';
// Runs docs/schema.sql on a real PostgreSQL engine (PGlite is PostgreSQL compiled to WebAssembly) and
// checks that each rule the schema is meant to enforce really is enforced, and for the intended reason.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

let PGlite = null;
try { ({ PGlite } = require('@electric-sql/pglite')); } catch { /* dev dependency: run npm install */ }

test('docs/schema.sql enforces the rules it claims to', { skip: PGlite ? false : 'run npm install to get the dev dependencies' }, async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync(path.join(__dirname, '..', 'docs', 'schema.sql'), 'utf8'));
  t.diagnostic((await db.query('select version() v')).rows[0].v.split(',')[0]);

  const ok = async (name, sql, params) => { let res = { rows: [] }; await t.test(name, async () => { res = await db.query(sql, params); }); return res; };
  const refused = (name, sql, why) => t.test(`refused: ${name}`, async () => { await assert.rejects(() => db.query(sql), why); });
  const user = (email, role = 'member', status = 'active', hash = "'h'", uid = 'NULL') =>
    `INSERT INTO users (name,email,password_hash,role,status,university_id) VALUES ('Test Person','${email}',${hash},'${role}','${status}',${uid}) RETURNING id`;

  // ---- people
  const u1 = (await ok('an active member', user('a@bup.edu.bd', 'member', 'active', "'h'", "'2024001'"))).rows[0].id;
  const u2 = (await ok('a security officer', user('s@bup.edu.bd', 'security'))).rows[0].id;
  const u3 = (await ok('an invited account has no password yet', user('i@bup.edu.bd', 'approver', 'pending', 'NULL'))).rows[0].id;
  const u4 = (await ok('a second member', user('b@bup.edu.bd'))).rows[0].id;
  await ok('many accounts may have no university ID', user('d@bup.edu.bd'));
  await refused('an ACTIVE account without a password', user('x@bup.edu.bd', 'member', 'active', 'NULL'), /users_active_has_password/);
  await refused('an upper-case e-mail', user('Upper@bup.edu.bd'), /users_email_check/);
  await refused('a duplicate e-mail', user('a@bup.edu.bd'), /users_email_key/);
  await refused('a duplicate university ID', user('c@bup.edu.bd', 'member', 'active', "'h'", "'2024001'"), /users_university_id_key/);
  await refused('an unknown role', user('r@bup.edu.bd', 'superuser'), /users_role_check/);

  // ---- reference data
  await ok('a category', "INSERT INTO categories (name) VALUES ('Spectacles')");
  await ok('a location', "INSERT INTO locations (building,name,lat,lng) VALUES ('Library','Reading hall',23.84,90.35)");
  await refused('a duplicate category name', "INSERT INTO categories (name) VALUES ('Spectacles')", /categories_name_key/);
  await refused('a latitude without a longitude', "INSERT INTO locations (building,name,lat) VALUES ('X','Y',23.84)", /check constraint "locations_/);

  // ---- cases
  const mk = (type, uid, extraCols = '', extraVals = '') =>
    `INSERT INTO cases (type,user_id,category_id,location_id,title,description,occurred_at,status${extraCols}) VALUES ('${type}',${uid},1,1,'Black glasses','Black glasses in a hard case',now(),'open'${extraVals}) RETURNING id, ref`;
  const lost = (await ok('a lost report', mk('lost', u1))).rows[0];
  const lost2 = (await ok('a second lost report', mk('lost', u4))).rows[0];
  const found = (await ok('a walk-in found item: no account, shelf slot, finder', mk('found', 'NULL', ',storage_slot,finder_name,recorded_by', `,'A-1','Guard',${u2}`))).rows[0];
  await t.test('case numbers count up within the year', () => {
    const year = new Date(Date.now() + 6 * 3600e3).getUTCFullYear(); // Bangladesh time
    assert.deepEqual([lost.ref, lost2.ref, found.ref], [1, 2, 3].map((n) => `SF-${year}-000${n}`));
  });
  await refused('a lost report without a reporter', mk('lost', 'NULL'), /cases_lost_has_reporter/);
  await refused('a shelf slot on a lost report', mk('lost', u1, ',storage_slot', ",'B-2'"), /cases_slot_only_found/);
  await refused('a finder on a lost report', mk('lost', u1, ',finder_name', ",'Someone'"), /cases_finder_only_found/);
  await refused('an unknown status', `UPDATE cases SET status='lost_forever' WHERE id=${lost.id}`, /cases_status_check/);
  await t.test('refused inserts did not use up case numbers', async () => {
    assert.equal((await db.query('SELECT last_number FROM case_counters')).rows[0].last_number, 3);
  });

  // ---- matches
  const pair = (l, f, score = 70) => `INSERT INTO matches (lost_case_id,found_case_id,score,breakdown) VALUES (${l},${f},${score},'{}')`;
  await ok('a lost report paired with a found item', pair(lost.id, found.id, 82));
  await refused('the same pair twice', pair(lost.id, found.id), /matches_lost_case_id_found_case_id_key/);
  await refused('a found item on the lost side', pair(found.id, found.id), /foreign key constraint/);
  await refused('a lost report on the found side', pair(lost.id, lost2.id), /foreign key constraint/);
  await refused('a score above 100', pair(lost2.id, found.id, 101), /matches_score_check/);

  // ---- claims
  const c1 = (await ok('a first claimant', `INSERT INTO claims (found_case_id,lost_case_id,user_id,statement) VALUES (${found.id},${lost.id},${u1},'my glasses') RETURNING id`)).rows[0].id;
  const c2 = (await ok('a rival claimant', `INSERT INTO claims (found_case_id,user_id,statement) VALUES (${found.id},${u4},'mine too') RETURNING id`)).rows[0].id;
  await refused('the same person claiming an item twice', `INSERT INTO claims (found_case_id,user_id,statement) VALUES (${found.id},${u1},'again')`, /claims_one_live_per_person_and_item/);
  await refused('a claim against a lost report', `INSERT INTO claims (found_case_id,user_id,statement) VALUES (${lost.id},${u4},'x')`, /foreign key constraint/);
  await refused('a found item linked as the claimant\'s lost report', `INSERT INTO claims (found_case_id,lost_case_id,user_id,statement) VALUES (${found.id},${found.id},${u2},'x')`, /foreign key constraint/);
  await ok('the first claim is verified', `UPDATE claims SET status='verified', decided_by=${u2}, decided_at=now(), decision_tier=1 WHERE id=${c1}`);
  await refused('a second verified claim for the same item', `UPDATE claims SET status='verified' WHERE id=${c2}`, /claims_one_winner_per_item/);
  await ok('a rejected rival is fine', `UPDATE claims SET status='rejected' WHERE id=${c2}`);

  // ---- handover
  const live = (nonce) => `INSERT INTO handovers (claim_id,case_id,nonce,expires_at) VALUES (${c1},${found.id},'${nonce}',now() + interval '7 days') RETURNING id`;
  const h = (await ok('a code is issued for the verified claim', live('n1'))).rows[0].id;
  await refused('a second live code for the same claim', live('n2'), /handovers_one_live_per_claim/);
  await refused('a handover marked done without the ID check', `UPDATE handovers SET status='completed', completed_at=now(), completed_by=${u2} WHERE id=${h}`, /handovers_completed_needs_id_check/);
  await t.test('a code works once: the second caller gets no row', async () => {
    const done = 'UPDATE handovers SET status=\'completed\', completed_at=now(), completed_by=$2, id_checked=true WHERE id=$1 AND status=\'pending\' AND expires_at > now() RETURNING id';
    assert.equal((await db.query(done, [h, u2])).rows.length, 1);
    assert.equal((await db.query(done, [h, u2])).rows.length, 0);
  });
  await ok('a cancelled code does not block a new one', `UPDATE handovers SET status='cancelled', completed_at=NULL, completed_by=NULL, id_checked=false WHERE id=${h}`);

  // ---- audit, settings, tokens
  await ok('an audit entry is added', "INSERT INTO audit_logs (actor,action) VALUES ('s@bup.edu.bd','handover.completed')");
  await refused('changing an audit entry', "UPDATE audit_logs SET action='nothing'", /audit_logs is append-only/);
  await refused('deleting an audit entry', 'DELETE FROM audit_logs', /audit_logs is append-only/);
  await t.test('settings start as one row with the defaults', async () => {
    const r = (await db.query('SELECT * FROM settings')).rows;
    assert.equal(r.length, 1);
    assert.deepEqual([r[0].retention_days, r[0].match_threshold, r[0].weight_category, r[0].weight_description, r[0].weight_location, r[0].weight_time, r[0].handover_valid_days], [90, 40, 30, 35, 20, 15, 7]);
  });
  await refused('a second settings row', 'INSERT INTO settings (id) VALUES (2)', /settings_id_check/);
  await refused('weights that do not add up to 100', 'UPDATE settings SET weight_category=50', /settings_weights_sum_100/);
  await ok('weights that add up to 100', 'UPDATE settings SET weight_category=25, weight_description=25, weight_location=25, weight_time=25');
  const tok = (hash, purpose) => `INSERT INTO auth_tokens (token_hash,user_id,purpose,expires_at) VALUES ('${hash}',${u3},'${purpose}',now() + interval '1 day')`;
  await ok('a link is stored', tok('h1', 'invite'));
  await refused('a second link for the same purpose', tok('h2', 'invite'), /auth_tokens_one_per_purpose/);
  await refused('an unknown link purpose', tok('h3', 'magic'), /auth_tokens_purpose_check/);
  await ok('a link to send a new ID card photo', tok('h4', 'resubmit'));

  // ---- ID card verification (AUTH-8 to AUTH-12)
  await refused('an unknown way of joining', "INSERT INTO users (name,email,password_hash,role,status,verification_method) VALUES ('X Y','v@gmail.com','h','member','pending','telepathy')", /users_verification_method_check/);
  const idu = (await ok('a person who joins with an ID card', "INSERT INTO users (name,email,password_hash,role,status,verification_method) VALUES ('Card Person','card@gmail.com','h','member','pending','id_card') RETURNING id")).rows[0].id;
  const proof = (id, extra = '') => `INSERT INTO identity_proofs (user_id,file${extra ? ',' + extra.split('|')[0] : ''}) VALUES (${id},'${'a'.repeat(32)}.png'${extra ? ',' + extra.split('|')[1] : ''}) RETURNING id`;
  const p1 = (await ok('a photo waiting for review', proof(idu))).rows[0].id;
  await refused('a second photo waiting at the same time', proof(idu), /identity_proofs_one_open/);
  await refused('a file name that is not one of ours', `INSERT INTO identity_proofs (user_id,file) VALUES (${u1},'../../etc/passwd')`, /identity_proofs_file_check/);
  await refused('an approval with no time of decision', `UPDATE identity_proofs SET status='approved' WHERE id=${p1}`, /identity_proofs_decision_complete/);
  await refused('a rejection with no reason', `UPDATE identity_proofs SET status='rejected', reviewed_at=now() WHERE id=${p1}`, /identity_proofs_decision_complete/);
  await refused('the reason \"other\" without a note', `UPDATE identity_proofs SET status='rejected', reviewed_at=now(), reject_code='other' WHERE id=${p1}`, /identity_proofs_other_has_note/);
  await refused('an unknown reason', `UPDATE identity_proofs SET status='rejected', reviewed_at=now(), reject_code='dislike' WHERE id=${p1}`, /identity_proofs_reject_code_check/);
  await refused('a waiting photo marked final', `UPDATE identity_proofs SET final=TRUE WHERE id=${p1}`, /identity_proofs_decision_complete/);
  await ok('a rejection with a reason', `UPDATE identity_proofs SET status='rejected', reviewed_at=now(), reviewed_by=${u2}, reject_code='unreadable', purge_after=now() + interval '30 days' WHERE id=${p1}`);
  await ok('a new photo after a rejection', proof(idu));
  await refused('a photo with no file that was never deleted', `UPDATE identity_proofs SET file=NULL WHERE id=${p1}`, /identity_proofs_file_or_purged/);
  await ok('a deleted photo keeps its decision', `UPDATE identity_proofs SET file=NULL, purged_at=now() WHERE id=${p1}`);
  await ok('the public board query runs on this schema', "SELECT id FROM cases WHERE status IN ('open','matched') ORDER BY created_at DESC LIMIT 12");

  // ---- the public board query (copied into docs/DB_NOTES.md)
  // Ids come from RETURNING: a refused insert earlier in this test still used up a sequence value.
  const bank = (await ok('a sensitive category', "INSERT INTO categories (name, sensitive, high_value) VALUES ('Bank or payment card', TRUE, TRUE) RETURNING id")).rows[0].id;
  await ok('a found bank card with a name in its title', `INSERT INTO cases (type,user_id,category_id,location_id,title,description,occurred_at,status) VALUES ('found',${u4},${bank},1,'Debit card of Zubaida Khanom','Blue debit card, name printed on the front',now(),'open')`);
  const board = (q) => db.query(`
    SELECT cs.ref, cs.type, cs.status, cs.occurred_at,
           CASE WHEN cat.sensitive THEN cat.name ELSE cs.title END AS title,
           cat.name AS category, loc.building
    FROM cases cs
    JOIN categories cat ON cat.id = cs.category_id
    JOIN locations  loc ON loc.id = cs.location_id
    WHERE cs.status IN ('open', 'matched')
      AND ($1::text IS NULL OR (
            (NOT cat.sensitive AND strpos(lower(cs.title), lower($1)) > 0)
         OR strpos(lower(cat.name), lower($1)) > 0
         OR strpos(lower(loc.building), lower($1)) > 0))
    ORDER BY cs.created_at DESC
    LIMIT 12 OFFSET 0`, [q]);
  await t.test('board query: returns only public columns, and the category name in place of a sensitive title', async () => {
    const rows = (await board(null)).rows;
    assert.deepEqual(Object.keys(rows[0]).sort(), ['building', 'category', 'occurred_at', 'ref', 'status', 'title', 'type']);
    const card = rows.find((r) => r.category === 'Bank or payment card');
    assert.equal(card.title, 'Bank or payment card');
    assert.ok(!JSON.stringify(rows).includes('Zubaida'));
  });
  await t.test('board query: a name in a sensitive title cannot be searched; the category name can', async () => {
    assert.equal((await board('zubaida')).rows.length, 0);
    assert.equal((await board('debit card of')).rows.length, 0);
    assert.equal((await board('bank or')).rows.length, 1);
    assert.ok((await board('glasses')).rows.length >= 1, 'a normal title is searchable');
    assert.equal((await board('100%')).rows.length, 0, 'wildcard characters are plain text');
  });
});
