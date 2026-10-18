'use strict';
// Helpers every template can use, so views stay free of logic and never build HTML by hand.
const config = require('../config');
const { LANDING, ROLE_LABEL_KEY } = require('../config/roles');
const { CASE_TONE, CLAIM_TONE, USER_TONE } = require('../config/statuses');
const { toInputValue } = require('../utils/format');
const { progressFor } = require('../utils/progress');

const tone = { case: CASE_TONE, claim: CLAIM_TONE, user: USER_TONE };

// Icons come from the sprite in partials/icons.ejs. Names are fixed in our own templates.
function icon(name, cls = '') {
  const id = String(name).replace(/[^a-z-]/g, '');
  const extra = String(cls).replace(/[^a-z0-9 _-]/gi, '');
  return `<svg class="icon${extra ? ` ${extra}` : ''}" aria-hidden="true" focusable="false"><use href="#i-${id}"></use></svg>`;
}

function qs(obj) {
  const p = new URLSearchParams();
  Object.entries(obj || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, String(v)); });
  return p.toString();
}

const localName = (obj, lang, key = 'name') => (obj ? (lang === 'bn' && obj[`${key}Bn`] ? obj[`${key}Bn`] : obj[key]) : '');

module.exports = (req, res, next) => {
  const lang = req.lang || 'en';
  const l = res.locals;
  l.icon = icon;
  l.qs = qs;
  l.progressFor = progressFor;
  l.liveAlerts = config.realtime.enabled;
  l.nm = (obj, key) => localName(obj, lang, key);
  l.place = (loc) => {
    if (!loc) return '';
    const b = localName(loc, lang, 'building');
    const n = localName(loc, lang, 'name');
    return !n || n === b ? b : `${b} · ${n}`;
  };
  l.LANDING = LANDING;
  l.roleKey = ROLE_LABEL_KEY;
  l.tone = tone;
  l.contact = config.contact;
  l.allowedDomains = config.auth.allowedEmailDomains;
  l.idCard = { enabled: config.auth.idCard.enabled, keepDays: config.auth.idCard.keepDays };
  l.currentPath = req.path;
  // The CSRF token can ride in the query string of upload forms; never echo it into links.
  l.currentUrl = req.originalUrl.replace(/([?&])_csrf=[^&]*&?/, '$1').replace(/[?&]$/, '');
  l.maxUploadBytes = config.upload.maxBytes;
  l.retentionNote = config.isProd ? '' : 'dev';
  l.isDev = !config.isProd;
  l.nowInput = () => toInputValue(new Date());
  l.toInput = (d) => (d ? toInputValue(d) : '');
  l.pageTitle = '';
  next();
};
