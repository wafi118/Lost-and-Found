'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');

const safeRedirect = require('../utils/safeRedirect');
const auth = require('../services/auth.service');
const handovers = require('../services/handover.service');
const { validate } = require('../validators');
const schemas = require('../validators/schemas');
const { toInputValue, parseInputValue } = require('../utils/format');
const i18n = require('../utils/i18n');
const { collect } = require('../scripts/collect-keys');
const en = require('../locales/en.json');
const bn = require('../locales/bn.json');

test('safeRedirect keeps paths inside the app (D3)', () => {
  assert.equal(safeRedirect('/dashboard', '/x'), '/dashboard');
  assert.equal(safeRedirect('/report?type=found', '/x'), '/report?type=found');
  for (const bad of ['//evil.com', '/\\evil.com', '\\\\evil.com', 'https://evil.com', 'javascript:alert(1)', '/ok\r\nSet-Cookie: a=b', '', null, undefined, 'evil.com', `/${'a'.repeat(600)}`]) {
    assert.equal(safeRedirect(bad, '/x'), '/x', `should reject ${JSON.stringify(bad)}`);
  }
  assert.equal(safeRedirect('/auth/login', '/x'), '/x', 'auth pages would loop');
  assert.equal(safeRedirect('/auth/login', '/x', { allowAuth: true }), '/auth/login');
});

test('only institutional e-mail domains are accepted (D1, AUTH-1)', () => {
  assert.equal(auth.isAllowedEmail('a.student@bup.edu.bd'), true);
  assert.equal(auth.isAllowedEmail('A.Student@BUP.EDU.BD'), true);
  assert.equal(auth.isAllowedEmail('a@cse.bup.edu.bd'), true, 'subdomains are allowed by default');
  for (const bad of ['a@gmail.com', 'a@evilbup.edu.bd', 'a@bup.edu.bd.evil.com', 'a@bup.edu.bd@evil.com', 'a@-bup.edu.bd', 'a..b@bup.edu.bd', '@bup.edu.bd', 'bup.edu.bd', '']) {
    assert.equal(auth.isAllowedEmail(bad), false, `should reject ${JSON.stringify(bad)}`);
  }
});

test('university ID formats', () => {
  assert.equal(auth.isValidUniversityId('student', '20249990001'), true);
  assert.equal(auth.isValidUniversityId('student', 'abc'), false);
  assert.equal(auth.isValidUniversityId('student', '123'), false);
  assert.equal(auth.isValidUniversityId('staff', 'EMP-1001'), true);
  assert.equal(auth.isValidUniversityId('staff', '!!'), false);
});

test('validation reports every problem at once, with locale keys (D15)', () => {
  const { errors, ok } = validate({ name: 'A', email: 'x@gmail.com', affiliation: 'student', universityId: 'zz', password: 'short', confirm: 'other' }, schemas.register);
  assert.equal(ok, false);
  for (const field of ['name', 'email', 'universityId', 'password', 'confirm', 'attest']) assert.ok(errors[field], `${field} should have an error`);
  assert.equal(errors.email.key, 'err_email_domain');
  for (const e of Object.values(errors)) assert.ok(en[e.key], `${e.key} must exist in en.json`);
});

test('ID card registration: any address except a university one, and every message is a locale key (AUTH-8)', () => {
  const good = { name: 'Rafi Ahmed', email: 'Rafi@Gmail.com', affiliation: 'student', universityId: '20241234567', password: 'Testing@123', confirm: 'Testing@123', attest: 'on' };
  const r = validate(good, schemas.registerIdCard);
  assert.equal(r.ok, true);
  assert.equal(r.values.email, 'rafi@gmail.com');
  const uni = validate({ ...good, email: 'rafi@bup.edu.bd' }, schemas.registerIdCard);
  assert.equal(uni.errors.email.key, 'err_email_use_university');
  assert.equal(validate({ ...good, email: 'rafi@bup.edu.bd.evil.com' }, schemas.registerIdCard).ok, true, 'a look-alike domain is not a university address, so it takes the ID card way');
  for (const bad of ['rafi', 'rafi@', 'a b@gmail.com', 'rafi@gmail..com']) assert.ok(validate({ ...good, email: bad }, schemas.registerIdCard).errors.email, bad);
  const all = validate({ name: 'A', email: 'x', affiliation: 'student', universityId: 'zz', password: 'short', confirm: 'other' }, schemas.registerIdCard);
  for (const e of Object.values(all.errors)) assert.ok(en[e.key], `${e.key} must exist in en.json`);
  assert.equal(auth.isValidEmailShape('rafi@gmail.com'), true);
  assert.equal(auth.isValidEmailShape('-rafi@-gmail.com'), false);
});

test('the administrator\'s decision forms: approving needs the tick, \"other\" needs a note', () => {
  assert.equal(validate({}, schemas.idApprove).ok, false);
  assert.equal(validate({ checked: 'on' }, schemas.idApprove).ok, true);
  assert.equal(validate({ reason: 'unreadable' }, schemas.idReject).ok, true);
  assert.equal(validate({ reason: 'other' }, schemas.idReject).errors.note.key, 'err_id_note');
  assert.equal(validate({ reason: 'other', note: 'Card is expired' }, schemas.idReject).ok, true);
  assert.equal(validate({ reason: 'whatever' }, schemas.idReject).errors.reason.key, 'err_id_reason');
});

test('public titles may not carry personal identifiers (D10)', () => {
  const base = { categoryId: '1', locationId: '1', description: 'A long enough description of the item.', occurredAt: '2026-09-01T10:00' };
  for (const title of ['ID 20249990001 card', 'call 01712345678', 'me@example.com wallet', 'see www.example.com']) {
    const r = validate({ ...base, title }, schemas.report);
    assert.equal(r.errors.title && r.errors.title.key, 'err_title_private', title);
  }
  assert.equal(validate({ ...base, title: 'Black backpack' }, schemas.report).errors.title, undefined);
});

test('date-time inputs use Bangladesh time', () => {
  const d = parseInputValue('2026-09-30T18:00');
  assert.equal(d.toISOString(), '2026-09-30T12:00:00.000Z');
  assert.equal(toInputValue(d), '2026-09-30T18:00');
  assert.equal(parseInputValue('not a date'), null);
});

test('handover tokens are signed and cannot be altered', () => {
  const h = { id: 7, claimId: 3, nonce: 'abcdef123456' };
  const token = handovers.makeToken(h);
  const payload = handovers.parseToken(token);
  assert.ok(payload);
  assert.equal(payload.h, 7);
  assert.equal(payload.c, 3);
  assert.equal(payload.n, 'abcdef123456');
  assert.equal(handovers.parseToken(`${token.slice(0, -2)}xx`), null);
  assert.equal(handovers.parseToken(token.replace(/^[^.]+\./, 'other.')), null);
  assert.equal(handovers.parseToken('garbage'), null);
  assert.match(handovers.shortCode(h), /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
});

test('every locale key used by the code exists in en.json', () => {
  const missing = collect().filter((k) => !(k in en));
  assert.deepEqual(missing, []);
});

test('Bangla file: no stray keys, same placeholders as English', () => {
  const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  assert.deepEqual(Object.keys(bn).filter((k) => !(k in en)), []);
  assert.deepEqual(Object.keys(bn).filter((k) => ph(en[k]) !== ph(bn[k])), []);
});

test('untranslated Bangla keys fall back to English, not to a blank', () => {
  assert.equal(i18n.translate('bn', 'nav_users'), en.nav_users);
  assert.notEqual(i18n.translate('bn', 'nav_home'), en.nav_home);
  assert.equal(i18n.translate('bn', 'err_429_body', { minutes: 5 }).includes('5'), true);
  assert.equal(i18n.translate('en', 'no_such_key'), 'no_such_key');
});

test('copy does not overclaim (D14)', () => {
  const all = JSON.stringify(en).toLowerCase();
  for (const phrase of ['tamper-proof', 'tamperproof', 'unhackable', 'military-grade', '100% secure', 'verified student', 'blockchain']) {
    assert.ok(!all.includes(phrase), `copy should not say "${phrase}"`);
  }
});
