'use strict';
// Pages for a signed-in person: dashboard, reporting, tracking, notifications and account.
const wrap = require('../utils/wrapController');
const cases = require('../services/case.service');
const claims = require('../services/claim.service');
const analytics = require('../services/analytics.service');
const notifications = require('../services/notification.service');
const auth = require('../services/auth.service');
const userService = require('../services/user.service');
const categoryModel = require('../models/category.model');
const locationModel = require('../models/location.model');
const { LANDING } = require('../config/roles');
const { CASE } = require('../config/statuses');
const { parseInputValue } = require('../utils/format');
const { validate, echo } = require('../validators');
const schemas = require('../validators/schemas');
const { isPartial, pageNum, oneOfOr, perform, rejectInput, isDomainError, errorKey, clientIp, setLangCookie } = require('./_helpers');

const formLists = async () => {
  const [categories, locations] = await Promise.all([categoryModel.list({ activeOnly: true }), locationModel.list({ activeOnly: true })]);
  return { categories, locations };
};

module.exports = wrap({
  async dashboard(req, res) {
    if (req.user.role !== 'member') return res.redirect(LANDING[req.user.role] || '/');
    const [summary, mine, myClaims, recent] = await Promise.all([
      analytics.memberSummary(req.user), cases.listMine(req.user, { page: 1 }), claims.listMine(req.user), notifications.recent(req.user.id, 5)
    ]);
    return res.render('member/dashboard', {
      pageTitle: res.locals.t('nav_dashboard'), shell: 'app', active: '/dashboard',
      summary, cases: mine.rows.slice(0, 5), claims: myClaims.slice(0, 3), recent
    });
  },

  async reportForm(req, res) {
    const type = oneOfOr(req.query.type, ['lost', 'found'], 'lost');
    res.render('member/report-form', {
      pageTitle: res.locals.t('report_title'), shell: 'app', active: '/report',
      ...(await formLists()), type, values: { type, occurredAt: res.locals.nowInput() }, errors: {}, formError: null
    });
  },

  async reportSubmit(req, res) {
    const type = oneOfOr(req.body && req.body.type, ['lost', 'found'], '');
    const { values, errors, ok } = validate(req.body, schemas.report);
    const again = async (extra) => res.status(400).render('member/report-form', {
      pageTitle: res.locals.t('report_title'), shell: 'app', active: '/report',
      ...(await formLists()), type: type || 'lost', values: { ...echo(values), type: type || 'lost' }, errors: {}, formError: null, ...extra
    });
    if (!type) return again({ formError: { key: 'err_choice' } });
    if (req.uploadError) return again({ errors, formError: { key: `svc_${req.uploadError}` } });
    if (!ok) return again({ errors });
    try {
      const c = await cases.createReport(req.user, { ...values, type, occurredAt: parseInputValue(values.occurredAt) }, req.file || null, clientIp(req));
      req.flash('success', c.status === CASE.PENDING_APPROVAL ? 'flash_report_sent_approval' : 'flash_report_sent');
      return res.redirect(`/items/${c.ref}`);
    } catch (err) {
      if (!isDomainError(err)) throw err;
      return again({ formError: { key: errorKey(err), params: err } });
    }
  },

  async track(req, res) {
    const filters = {
      type: oneOfOr(req.query.type, ['lost', 'found']),
      status: oneOfOr(req.query.status, Object.values(CASE))
    };
    if (isPartial(req)) {
      const only = await cases.listMine(req.user, { ...filters, page: pageNum(req) });
      res.set('Cache-Control', 'no-store');
      return res.render('partials/list-results', { list: only, listBase: '/items/', pagerBase: '/track', params: filters, progress: true, filtered: Boolean(filters.type || filters.status), emptyKind: 'mine' });
    }
    const [list, myClaims] = await Promise.all([cases.listMine(req.user, { ...filters, page: pageNum(req) }), claims.listMine(req.user)]);
    return res.render('member/track', { pageTitle: res.locals.t('track_title'), shell: 'app', active: '/track', filters, list, claims: myClaims, statuses: Object.values(CASE) });
  },

  async notifications(req, res) {
    const list = await notifications.list(req.user.id, { page: pageNum(req) });
    list.rows = list.rows.map((n) => ({ ...n })); // keep the "unread" state for this render
    await notifications.markAllRead(req.user.id);
    res.render('member/notifications', { pageTitle: res.locals.t('nav_notifications'), shell: 'app', active: '/notifications', list });
  },

  account(req, res) {
    res.render('member/account', {
      pageTitle: res.locals.t('account_title'), shell: 'app', active: '/account',
      values: { name: req.user.name, phone: req.user.phone || '', lang: req.user.lang || 'en' }, errors: {}, pwErrors: {}, formError: null
    });
  },

  async profile(req, res) {
    const { values, errors, ok } = validate(req.body, schemas.profile);
    if (!ok) return rejectInput(req, res, errors, '/account');
    return perform(req, res, {
      run: async () => { await userService.updateProfile(req.user, values, clientIp(req)); setLangCookie(res, values.lang); },
      success: 'flash_profile_saved', to: '/account'
    });
  },

  async password(req, res) {
    const { values, errors, ok } = validate(req.body, schemas.changePassword);
    if (!ok) return rejectInput(req, res, errors, '/account');
    try {
      await auth.changePassword(req.user, values.current, values.password, clientIp(req));
      req.session.authAt = Date.now(); // this session stays valid; every other one ends
      req.flash('success', 'flash_password_changed');
    } catch (err) {
      if (!isDomainError(err)) throw err;
      req.flash('error', errorKey(err), err);
    }
    return res.redirect('/account');
  }
});
