'use strict';
// Error pages and the last-resort handler. Every failure ends in a readable page in the
// person's language (or JSON for the scanner), never a hung request or a stack trace.
const multer = require('multer');
const config = require('../config');
const { translate } = require('../utils/i18n');
const { formatters } = require('../utils/format');

const wantsJson = (req) => req.get('x-requested-with') === 'fetch' || req.accepts(['html', 'json']) === 'json';

// An error can happen before the locale and user middleware ran, so make sure a page can render.
function ensureLocals(req, res) {
  const lang = req.lang || 'en';
  const l = res.locals;
  l.lang = l.lang || lang;
  l.t = l.t || ((key, params) => translate(lang, key, params));
  l.fmt = l.fmt || formatters(lang);
  if (l.user === undefined) l.user = null;
  l.unread = l.unread || 0;
  l.flash = l.flash || null;
  l.nav = l.nav || null;
  l.csrfToken = l.csrfToken || (() => '');
  l.csrfField = l.csrfField || (() => '');
  l.currentPath = l.currentPath || req.path;
}

function page(req, res, status, titleKey, bodyKey, params = {}) {
  ensureLocals(req, res);
  res.status(status);
  if (wantsJson(req)) return res.json({ error: titleKey, status });
  return res.render('errors/error', { code: status, titleKey, bodyKey, params, pageTitle: res.locals.t(titleKey) }, (err, html) => {
    if (err) return res.type('text/plain').send(`${status} ${translate('en', titleKey)}`);
    return res.send(html);
  });
}

const notFound = (req, res) => page(req, res, 404, 'err_404_title', 'err_404_body');
const forbidden = (req, res) => page(req, res, 403, 'err_403_title', 'err_403_body');
const tooMany = (req, res, minutes = 15) => page(req, res, 429, 'err_429_title', 'err_429_body', { minutes });

// eslint-disable-next-line no-unused-vars
function handler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err && err.code === 'EBADCSRF') return page(req, res, 403, 'err_csrf_title', 'err_csrf_body');
  if (err instanceof multer.MulterError) return page(req, res, 413, 'err_upload_title', err.code === 'LIMIT_FILE_SIZE' ? 'svc_UPLOAD_SIZE' : 'svc_UPLOAD_TYPE');
  if (err && err.type === 'entity.too.large') return page(req, res, 413, 'err_upload_title', 'svc_UPLOAD_SIZE');
  if (err && (err.type === 'entity.parse.failed' || err instanceof URIError)) return page(req, res, 400, 'err_400_title', 'err_400_body');

  if (!config.isTest) console.error(`[error] ${req.method} ${req.originalUrl}\n`, err && err.stack ? err.stack : err);
  return page(req, res, 500, 'err_500_title', 'err_500_body');
}

module.exports = { notFound, forbidden, tooMany, handler, wantsJson, page };
