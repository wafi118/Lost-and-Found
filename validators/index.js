'use strict';
// Small validation engine. Every message is a locale key (fixes D15: nothing is hard-coded
// English), every error is reported at once, and the cleaned values come back so a form can be
// shown again with what the person typed.
//
//   const { values, errors, ok } = validate(req.body, schema);
//   errors.email = { key: 'err_email_domain', params: { domains: '...' } }
const { oneLine, multiLine } = require('../utils/text');

// ---- cleaners
const line = (max = 200) => (v) => oneLine(v, max);
const text = (max = 2000) => (v) => multiLine(v, max);
const secret = (v) => (typeof v === 'string' ? v.slice(0, 200) : ''); // never trimmed or altered
const integer = (v) => { const n = parseInt(v, 10); return Number.isInteger(n) ? n : ''; };
const decimal = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : ''; };
const flag = (v) => v === 'on' || v === 'true' || v === '1' || v === true;
const lower = (max = 254) => (v) => oneLine(v, max).toLowerCase();

// ---- checks (return null, a key, or [key, params])
const need = (key = 'err_required') => (v) => (v === '' || v === undefined || v === null ? key : null);
const minLen = (n, key) => (v) => (String(v).length < n ? [key || 'err_too_short', { n }] : null);
const maxLen = (n) => (v) => (String(v).length > n ? ['err_too_long', { n }] : null);
const pattern = (re, key) => (v) => (re.test(String(v)) ? null : key);
const oneOf = (list, key = 'err_choice') => (v) => (list.includes(v) ? null : key);
const between = (lo, hi, key = 'err_range') => (v) => (typeof v === 'number' && v >= lo && v <= hi ? null : [key, { lo, hi }]);
const matches = (other, key) => (v, all) => (v === all[other] ? null : key);
const custom = (fn) => fn;
const isTrue = (key = 'err_required') => (v) => (v ? null : key);

function validate(body, schema) {
  const src = body || {};
  const values = {};
  const errors = {};
  for (const [name, def] of Object.entries(schema)) {
    const raw = Array.isArray(src[name]) ? src[name][0] : src[name];
    values[name] = def.clean(raw);
  }
  for (const [name, def] of Object.entries(schema)) {
    const v = values[name];
    if (def.optional && (v === '' || v === false)) continue;
    for (const check of def.checks) {
      const r = check(v, values);
      if (r) {
        errors[name] = Array.isArray(r) ? { key: r[0], params: r[1] } : { key: r };
        break;
      }
    }
  }
  return { values, errors, ok: Object.keys(errors).length === 0 };
}

const field = (clean, ...checks) => ({ clean, checks });
const optional = (clean, ...checks) => ({ clean, checks, optional: true });

// Values that are safe to put back into a form (passwords are never echoed).
const echo = (values, hide = ['password', 'confirm', 'current', 'next']) =>
  Object.fromEntries(Object.entries(values).filter(([k]) => !hide.includes(k)));

module.exports = {
  validate, field, optional, echo,
  line, text, secret, integer, decimal, flag, lower,
  need, minLen, maxLen, pattern, oneOf, between, matches, custom, isTrue
};
