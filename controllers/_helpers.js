'use strict';
// Shared controller helpers. Keeps request handling short and the error handling uniform.
const { isDomainError, errorKey } = require('../services/errors');
const config = require('../config');

const pageNum = (req) => Math.max(1, parseInt(req.query.page, 10) || 1);
const oneOfOr = (value, list, fallback = '') => (list.includes(value) ? value : fallback);
const intOr = (value, fallback = '') => { const n = parseInt(value, 10); return Number.isInteger(n) && n > 0 ? n : fallback; };
const shortText = (value, max = 60) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

// Run a service call for a POST action. On a business-rule failure, show the message and go
// back; anything else is a real error and goes to the error handler.
async function perform(req, res, { run, success, to, successParams }) {
  try {
    await run();
    if (success) req.flash('success', success, successParams);
  } catch (err) {
    if (!isDomainError(err)) throw err;
    req.flash('error', errorKey(err), err);
  }
  return res.redirect(to);
}

// A failed validation on a small action form: show the first message and go back.
function rejectInput(req, res, errors, to) {
  const first = Object.values(errors)[0];
  req.flash('error', first.key, first.params);
  return res.redirect(to);
}

const clientIp = (req) => req.ip || '';

// The live filters ask for just the results list (?partial=1). Same URL and rules as the full page.
const isPartial = (req) => req.query.partial === '1';

function setLangCookie(res, lang) {
  res.cookie('lang', lang === 'bn' ? 'bn' : 'en', { maxAge: 365 * 24 * 3600 * 1000, sameSite: 'lax', httpOnly: true, secure: config.cookieSecure, path: '/' });
}

// Show a form again with a business-rule message (and what the person typed).
function formFail(res, view, data, err, status = 400) {
  return res.status(status).render(view, { formError: { key: errorKey(err), params: err }, errors: {}, ...data });
}

// Refs look like SF-2026-0001. Anything else is a 404, not a lookup.
const REF = /^SF-\d{4}-\d{4}$/i;
const cleanRef = (v) => (REF.test(String(v || '')) ? String(v).toUpperCase() : null);

module.exports = { isPartial, pageNum, oneOfOr, intOr, shortText, perform, rejectInput, isDomainError, errorKey, clientIp, setLangCookie, formFail, cleanRef };
