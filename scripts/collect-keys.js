'use strict';
// Developer tool: lists every locale key the code refers to, so the locale files and the test
// suite can be checked against it. Usage: node scripts/collect-keys.js [--json]
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const DIRS = ['views', 'controllers', 'services', 'config', 'middleware', 'utils', 'validators', 'routes'];
const EXT = /\.(ejs|js)$/;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walk(p, out);
    else if (EXT.test(name.name)) out.push(p);
  }
  return out;
}

const KEYLIKE = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;
const WORD = /^[a-z][a-z0-9_]*$/;
const patterns = [
  /\bt\(\s*'([^']+)'/g,
  /\bt\(\s*"([^"]+)"/g,
  /\bflash\(\s*'[a-z]+'\s*,\s*'([^']+)'/g,
  /\b(?:key|label|hint|placeholder|blank|success|titleKey|bodyKey):\s*'([^']+)'/g,
  /'((?:ev|cev|notif|mail|flash|err|mr|mr_pub|svc|dz|wizard|progress|empty|toast)_[A-Za-z0-9_]+)'/g
];
const CODE = /new\s+(?:ServiceError|AuthError|UserError|MatchError)\(\s*'([A-Z_]+)'/g;

const found = new Map();
const add = (key, file) => { if (!found.has(key)) found.set(key, path.relative(root, file)); };

for (const d of DIRS) {
  for (const file of walk(path.join(root, d))) {
    const src = fs.readFileSync(file, 'utf8');
    for (const re of patterns) { re.lastIndex = 0; let m; while ((m = re.exec(src))) if (KEYLIKE.test(m[1]) || /^svc_[A-Z_]+$/.test(m[1])) add(m[1], file); }
    // t('save'): a single word is a key too, but only when it is passed straight to t()
    const single = /\bt\(\s*'([a-z][a-z0-9]*)'\s*[,)]/g;
    let w;
    while ((w = single.exec(src))) if (WORD.test(w[1])) add(w[1], file);
    CODE.lastIndex = 0;
    let m;
    while ((m = CODE.exec(src))) add(`svc_${m[1]}`, file);
  }
}

// Families built at run time (prefix + value). Keep in step with config/statuses.js and the views.
const { CASE, CLAIM, USER, ID_PROOF, ID_REJECT_REASONS } = require('../config/statuses');
const { ROLES } = require('../config/roles');
const families = {
  status_: Object.values(CASE), claim_st_: Object.values(CLAIM), user_st_: Object.values(USER), role_: Object.values(ROLES),
  type_: ['lost', 'found'], match_st_: ['suggested', 'confirmed', 'rejected'],
  factor_: ['category', 'description', 'location', 'time'], close_: ['withdrawn', 'recovered', 'returned', 'disposed'],
  method_: ['donate', 'recycle', 'transfer'], handover_state_: ['pending', 'completed', 'cancelled'],
  note_kind_: ['note', 'cctv'], claims_tab_: ['waiting', 'proof', 'verified', 'closed'], appr_: ['approved', 'rejected'],
  aff_: ['student', 'staff'], wizard_step_: ['1', '2', '3'],
  id_reason_: ID_REJECT_REASONS, idp_st_: Object.values(ID_PROOF), idr_empty_: Object.values(ID_PROOF)
};
for (const [prefix, values] of Object.entries(families)) values.forEach((v) => add(prefix + v, 'dynamic'));
const nextKeys = ['pending_approval', 'rejected', 'under_review_lost', 'under_review_found', 'open_lost', 'open_found', 'matched', 'claim_pending', 'ready_for_handover', 'closed', 'disposed'];
nextKeys.forEach((k) => add(`next_${k}`, 'dynamic'));
// Codes thrown from a variable, so the pattern above cannot see them (identity.service waitingState).
['ID_PENDING', 'ID_REJECTED', 'ID_REJECTED_FINAL'].forEach((c) => add(`svc_${c}`, 'services/identity.service.js'));

if (process.argv.includes('--json')) console.log(JSON.stringify([...found.keys()].sort(), null, 2));
module.exports = { collect: () => [...found.keys()].sort(), sources: found };
if (require.main === module && !process.argv.includes('--json')) {
  const keys = [...found.keys()].sort();
  const groups = {};
  keys.forEach((k) => { const g = k.split('_')[0]; (groups[g] = groups[g] || []).push(k); });
  console.log(`${keys.length} keys`);
  Object.entries(groups).forEach(([g, list]) => console.log(`\n[${g}] ${list.length}: ${list.join(' ')}`));
}
