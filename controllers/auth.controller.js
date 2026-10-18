'use strict';
// Sign-in, registration, e-mail verification, password reset and invitations (AUTH-1 to AUTH-7).
const wrap = require('../utils/wrapController');
const auth = require('../services/auth.service');
const identity = require('../services/identity.service');
const mailer = require('../services/mailer.service');
const audit = require('../services/audit.service');
const config = require('../config');
const { LANDING } = require('../config/roles');
const { validate, echo } = require('../validators');
const schemas = require('../validators/schemas');
const safeRedirect = require('../utils/safeRedirect');
const { COOKIE_NAME } = require('../middleware/session');
const { isDomainError, errorKey, clientIp, shortText } = require('./_helpers');
const { ID_REJECT_REASONS } = require('../config/statuses');

const TOKEN = /^[A-Za-z0-9_-]{20,100}$/;
const cleanToken = (v) => (TOKEN.test(String(v || '')) ? String(v) : '');
// Only outside production and only when no SMTP server is configured: the page shows the link
// that would have been e-mailed, so the flow can be tried without a mail server.
const devLink = (email) => (config.isProd ? null : mailer.latestLinkFor(email));

const regenerate = (req) => new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
const save = (req) => new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
const destroy = (req) => new Promise((resolve) => req.session.destroy(() => resolve()));

function loginView(res, extra = {}, status = 200) {
  return res.status(status).render('auth/login', {
    pageTitle: res.locals.t('auth_login_title'), values: {}, errors: {}, formError: null,
    next: '', signedOut: false, resendEmail: null, ...extra
  });
}

module.exports = wrap({
  loginPage(req, res) {
    loginView(res, { next: safeRedirect(req.query.next, ''), signedOut: req.query.out === '1' });
  },

  async loginSubmit(req, res) {
    const { values, errors, ok } = validate(req.body, schemas.login);
    const base = { values: echo(values), next: safeRedirect(values.next, '') };
    if (!ok) return loginView(res, { ...base, errors }, 400);
    try {
      const user = await auth.login(values.email, values.password, clientIp(req));
      // A fresh session id after authentication prevents session fixation. The save is awaited
      // so the next request cannot arrive before the session exists (fixes D9).
      await regenerate(req);
      req.session.userId = user.id;
      req.session.authAt = Date.now();
      await save(req);
      return res.redirect(safeRedirect(values.next, LANDING[user.role] || '/'));
    } catch (err) {
      if (!isDomainError(err)) throw err;
      // Rejected ID card, and the password was right: go straight to the page where a new photo is sent.
      if (err.code === 'ID_REJECTED' && err.resubmitToken) {
        req.flash('warn', errorKey(err));
        return res.redirect(`/auth/id-card/resubmit/${err.resubmitToken}`);
      }
      const params = {};
      if (err.code === 'LOCKED') params.minutes = Math.max(1, Math.ceil((new Date(err.until) - Date.now()) / 60000));
      return loginView(res, {
        ...base, formError: { key: errorKey(err), params },
        resendEmail: err.code === 'UNVERIFIED' ? values.email : null
      }, err.code === 'INVALID' ? 401 : 403);
    }
  },

  registerPage(req, res) {
    res.render('auth/register', { pageTitle: res.locals.t('auth_register_title'), values: {}, errors: {} });
  },

  async registerSubmit(req, res) {
    const { values, errors, ok } = validate(req.body, schemas.register);
    const again = (extra) => res.status(400).render('auth/register', { pageTitle: res.locals.t('auth_register_title'), values: echo(values), errors: {}, ...extra });
    if (!ok) return again({ errors });
    try {
      const r = await auth.register({ ...values, lang: req.lang }, clientIp(req));
      return res.redirect(`/auth/check-email?email=${encodeURIComponent(r.email)}`);
    } catch (err) {
      if (!isDomainError(err)) throw err;
      return again({ formError: { key: errorKey(err), params: err } });
    }
  },

  // ---------------------------------------------------------------- registration with an ID card (AUTH-8, AUTH-9)
  registerIdPage(req, res, next) {
    if (!config.auth.idCard.enabled) return next();
    return res.render('auth/register-id', { pageTitle: res.locals.t('auth_register_id_title'), values: {}, errors: {} });
  },

  async registerIdSubmit(req, res, next) {
    if (!config.auth.idCard.enabled) return next();
    const { values, errors, ok } = validate(req.body, schemas.registerIdCard);
    const again = (extra) => res.status(400).render('auth/register-id', { pageTitle: res.locals.t('auth_register_id_title'), values: echo(values), errors: {}, ...extra });
    if (req.uploadError) return again({ errors, formError: { key: `svc_${req.uploadError}` } });
    if (!ok) return again({ errors });
    try {
      const r = await auth.registerWithIdCard({ ...values, lang: req.lang }, req.file, clientIp(req));
      return res.redirect(`/auth/check-email?email=${encodeURIComponent(r.email)}&via=id`);
    } catch (err) {
      if (!isDomainError(err)) throw err;
      return again({ formError: { key: errorKey(err), params: err } });
    }
  },

  async resubmitPage(req, res) {
    const ctx = await identity.peekResubmit(cleanToken(req.params.token));
    return res.render('auth/id-resubmit', {
      pageTitle: res.locals.t('auth_resubmit_title'), token: ctx ? cleanToken(req.params.token) : '', rejected: ctx ? ctx.proof : null, reasons: ID_REJECT_REASONS
    });
  },

  async resubmitSubmit(req, res) {
    const token = cleanToken(req.params.token);
    const pageTitle = res.locals.t('auth_resubmit_title');
    const ctx = token ? await identity.peekResubmit(token) : null;
    if (!ctx) return res.status(400).render('auth/id-resubmit', { pageTitle, token: '', rejected: null, reasons: ID_REJECT_REASONS });
    const again = (key, params) => res.status(400).render('auth/id-resubmit', { pageTitle, token, rejected: ctx.proof, reasons: ID_REJECT_REASONS, formError: { key, params } });
    if (req.uploadError) return again(`svc_${req.uploadError}`);
    try {
      await identity.resubmit(token, req.file, clientIp(req));
    } catch (err) {
      if (!isDomainError(err)) throw err;
      return again(errorKey(err), err);
    }
    req.flash('success', 'flash_id_resubmitted');
    return res.redirect('/auth/login');
  },

  checkEmail(req, res) {
    const email = shortText(req.query.email, 254).toLowerCase();
    if (!email) return res.redirect('/auth/register');
    return res.render('auth/check-email', {
      pageTitle: res.locals.t('auth_check_title'), email, resent: req.query.resent === '1', devLink: devLink(email), viaId: req.query.via === 'id'
    });
  },

  async resend(req, res) {
    const { values, ok } = validate(req.body, schemas.email);
    if (!ok) { req.flash('error', 'err_email'); return res.redirect('/auth/login'); }
    await auth.resendVerification(values.email, clientIp(req)); // same answer whether or not the account exists
    return res.redirect(`/auth/check-email?email=${encodeURIComponent(values.email)}&resent=1`);
  },

  async verifyPage(req, res) {
    const token = cleanToken(req.params.token);
    const valid = token ? await auth.peekVerify(token) : false;
    res.render('auth/verify', { pageTitle: res.locals.t('auth_verify_title'), valid, token });
  },

  async verifySubmit(req, res) {
    try {
      const r = await auth.verifyEmail(cleanToken(req.params.token), clientIp(req));
      return res.render('auth/verified', { pageTitle: res.locals.t('auth_verified_title'), needsApproval: r.needsApproval, byIdCard: r.byIdCard });
    } catch (err) {
      if (!isDomainError(err)) throw err;
      return res.status(400).render('auth/verify', { pageTitle: res.locals.t('auth_link_bad_title'), valid: false, token: '' });
    }
  },

  forgotPage(req, res) {
    res.render('auth/forgot', { pageTitle: res.locals.t('auth_forgot_title'), sent: false, devLink: null, errors: {}, values: {} });
  },

  async forgotSubmit(req, res) {
    const { values, errors, ok } = validate(req.body, schemas.email);
    const pageTitle = res.locals.t('auth_forgot_title');
    if (!ok) return res.status(400).render('auth/forgot', { pageTitle, sent: false, devLink: null, errors, values: echo(values) });
    await auth.startReset(values.email, clientIp(req));
    return res.render('auth/forgot', { pageTitle, sent: true, devLink: devLink(values.email), errors: {}, values: {} });
  },

  async resetPage(req, res) {
    const token = cleanToken(req.params.token);
    const valid = token ? await auth.peekReset(token) : false;
    res.render('auth/reset', { pageTitle: res.locals.t('auth_reset_title'), valid, token, errors: {} });
  },

  async resetSubmit(req, res) {
    const token = cleanToken(req.params.token);
    const pageTitle = res.locals.t('auth_reset_title');
    const { values, errors, ok } = validate(req.body, schemas.newPassword);
    if (!ok) return res.status(400).render('auth/reset', { pageTitle, valid: true, token, errors });
    try {
      await auth.completeReset(token, values.password, clientIp(req));
      req.flash('success', 'flash_password_reset');
      return res.redirect('/auth/login');
    } catch (err) {
      if (!isDomainError(err)) throw err;
      return res.status(400).render('auth/reset', { pageTitle, valid: false, token: '', errors: {} });
    }
  },

  async invitePage(req, res) {
    const token = cleanToken(req.params.token);
    const invitee = token ? await auth.peekInvite(token) : null;
    res.render('auth/invite', { pageTitle: res.locals.t('auth_invite_title'), invitee, token, errors: {} });
  },

  async inviteSubmit(req, res) {
    const token = cleanToken(req.params.token);
    const pageTitle = res.locals.t('auth_invite_title');
    const invitee = token ? await auth.peekInvite(token) : null;
    const { values, errors, ok } = validate(req.body, schemas.newPassword);
    if (!invitee) return res.status(400).render('auth/invite', { pageTitle, invitee: null, token: '', errors: {} });
    if (!ok) return res.status(400).render('auth/invite', { pageTitle, invitee, token, errors });
    try {
      await auth.acceptInvite(token, values.password, clientIp(req));
      req.flash('success', 'flash_invite_done');
      return res.redirect('/auth/login');
    } catch (err) {
      if (!isDomainError(err)) throw err;
      return res.status(400).render('auth/invite', { pageTitle, invitee: null, token: '', errors: {} });
    }
  },

  async logout(req, res) {
    if (req.user) await audit.record(req.user, 'auth.logout', req.user.email, '', clientIp(req));
    await destroy(req);
    res.clearCookie(COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.cookieSecure });
    res.redirect('/auth/login?out=1');
  }
});
