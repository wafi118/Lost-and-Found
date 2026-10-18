'use strict';
// CSRF protection with a per-session token.
//  - The token is created lazily, the first time a page asks for it (a page with a form). A
//    plain page view, such as the public home page, never touches the session (fixes D2).
//  - Forms send it as the hidden field _csrf. Upload forms put it in the query string instead
//    (?_csrf=...), because the body of a multipart request is not parsed yet at this point.
//  - The Origin header, when the browser sends one, must also match this host.
const crypto = require('crypto');

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

function token(req) {
  if (!req.session) return '';
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('base64url');
  return req.session.csrf;
}

function equal(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function sameOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === req.get('host'); } catch { return false; }
}

function locals(req, res, next) {
  res.locals.csrfToken = () => token(req);
  res.locals.csrfField = () => `<input type="hidden" name="_csrf" value="${token(req)}">`;
  next();
}

function verify(req, res, next) {
  if (SAFE.has(req.method)) return next();
  const expected = req.session && req.session.csrf;
  const supplied = (req.body && req.body._csrf) || req.query._csrf || req.get('x-csrf-token') || '';
  if (!expected || !supplied || !sameOrigin(req) || !equal(supplied, expected)) {
    const err = new Error('Invalid CSRF token');
    err.code = 'EBADCSRF';
    err.status = 403;
    return next(err);
  }
  return next();
}

module.exports = { locals, verify, token };
