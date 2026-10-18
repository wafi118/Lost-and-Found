'use strict';
// System administration: accounts, categories, places, settings, analytics and the audit log.
// Every change is written to the audit log (FR-22, FR-23, NFR-10).
const wrap = require('../utils/wrapController');
const userService = require('../services/user.service');
const auth = require('../services/auth.service');
const identity = require('../services/identity.service');
const analytics = require('../services/analytics.service');
const catalog = require('../services/catalog.service');
const settingsService = require('../services/settings.service');
const auditModel = require('../models/audit.model');
const userModel = require('../models/user.model');
const config = require('../config');
const { ALL_ROLES } = require('../config/roles');
const { USER } = require('../config/statuses');
const { validate } = require('../validators');
const schemas = require('../validators/schemas');
const { pageNum, oneOfOr, intOr, shortText, perform, rejectInput, isDomainError, errorKey, clientIp } = require('./_helpers');

const shell = (active) => ({ shell: 'app', active });

async function renderUser(req, res, next, id, extra = {}) {
  const account = await userModel.findById(id);
  if (!account) return next();
  const row = await withProof(account);
  const values = extra.values || {
    name: account.name, email: account.deletedAt ? '' : account.email, phone: account.phone || '',
    role: account.role, affiliation: account.affiliation || '', lang: account.lang || 'en'
  };
  return res.status(extra.status || 200).render('admin/user', {
    pageTitle: account.name, ...shell('/admin/users'), account: row, values, roles: ALL_ROLES,
    errors: extra.errors || {}, formError: extra.formError || null
  });
}

// Password hashes never leave the model layer.
const safeUser = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, affiliation: u.affiliation, universityId: u.universityId, phone: u.phone,
  status: u.status, emailVerified: u.emailVerified, invited: !u.passwordHash, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
  verificationMethod: u.verificationMethod, idProofId: null, lang: u.lang, deletedAt: u.deletedAt
});

// People who joined with an ID card get a link to their latest photo's review page.
const withProof = async (u) => {
  const row = safeUser(u);
  if (u.verificationMethod === 'id_card') {
    const proof = await identity.latestFor(u.id);
    row.idProofId = proof ? proof.id : null;
  }
  return row;
};

module.exports = wrap({
  async dashboard(req, res) {
    const [counts, overview, recent, pending, idWaiting] = await Promise.all([
      userService.counts(), analytics.overview({ months: 1 }), auditModel.list({ page: 1, pageSize: 6 }), userService.list({ status: USER.PENDING, pageSize: 5 }),
      identity.waitingCount()
    ]);
    res.render('admin/dashboard', {
      pageTitle: res.locals.t('nav_overview'), ...shell('/admin'), counts, totals: overview.totals, idWaiting,
      recent: recent.rows, pending: await Promise.all(pending.rows.map(withProof)), requireApproval: config.auth.requireAdminApproval
    });
  },

  // ---------------------------------------------------------------- accounts
  async users(req, res) {
    const filters = {
      role: oneOfOr(req.query.role, ALL_ROLES),
      status: oneOfOr(req.query.status, Object.values(USER).concat('deleted')),
      q: shortText(req.query.q)
    };
    const list = await userService.list({ ...filters, page: pageNum(req) });
    const inviteLink = req.session.inviteLink || null;
    if (inviteLink) delete req.session.inviteLink;
    res.render('admin/users', {
      pageTitle: res.locals.t('nav_users'), ...shell('/admin/users'), filters, list: { ...list, rows: await Promise.all(list.rows.map(withProof)) },
      inviteLink, roles: ALL_ROLES.filter((r) => r !== 'member'), requireApproval: config.auth.requireAdminApproval
    });
  },

  async invite(req, res) {
    const { values, errors, ok } = validate(req.body, schemas.authorityAccount);
    if (!ok) return rejectInput(req, res, errors, '/admin/users');
    try {
      const r = await auth.inviteAuthority(req.user, values, clientIp(req));
      if (r.link) req.session.inviteLink = r.link;
      req.flash('success', 'flash_invite_sent', { email: values.email });
    } catch (err) {
      if (!isDomainError(err)) throw err;
      req.flash('error', errorKey(err), err);
    }
    return res.redirect('/admin/users');
  },

  async resendInvite(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    try {
      const r = await auth.resendInvite(req.user, id, clientIp(req));
      if (r.link) req.session.inviteLink = r.link;
      req.flash('success', 'flash_invite_resent');
    } catch (err) {
      if (!isDomainError(err)) throw err;
      req.flash('error', errorKey(err), err);
    }
    return res.redirect('/admin/users');
  },

  async approve(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    return perform(req, res, { run: () => userService.approve(req.user, id, clientIp(req)), success: 'flash_user_approved', to: '/admin/users' });
  },
  async suspend(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    return perform(req, res, { run: () => userService.suspend(req.user, id, clientIp(req)), success: 'flash_user_suspended', to: '/admin/users' });
  },
  async reactivate(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    return perform(req, res, { run: () => userService.reactivate(req.user, id, clientIp(req)), success: 'flash_user_reactivated', to: '/admin/users' });
  },

  userForm(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    return renderUser(req, res, next, id);
  },

  async userUpdate(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    const { values, errors, ok } = validate(req.body, schemas.accountEdit);
    if (!ok) return renderUser(req, res, next, id, { values, errors, status: 400 });
    try {
      await userService.updateAccount(req.user, id, values, clientIp(req));
      req.flash('success', 'flash_user_updated');
      return res.redirect(`/admin/users/${id}`);
    } catch (err) {
      if (!isDomainError(err)) throw err;
      return renderUser(req, res, next, id, { values, formError: { key: errorKey(err), params: err }, status: 400 });
    }
  },

  async userDelete(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    return perform(req, res, { run: () => userService.remove(req.user, id, clientIp(req)), success: 'flash_user_deleted', to: '/admin/users' });
  },

  // ---------------------------------------------------------------- categories and places
  async categories(req, res) {
    res.render('admin/categories', { pageTitle: res.locals.t('nav_categories'), ...shell('/admin/categories'), rows: await catalog.listCategories() });
  },

  async categoryCreate(req, res) {
    const { values, errors, ok } = validate(req.body, schemas.category);
    if (!ok) return rejectInput(req, res, errors, '/admin/categories');
    return perform(req, res, { run: () => catalog.createCategory(req.user, values, clientIp(req)), success: 'flash_saved', to: '/admin/categories' });
  },

  async categoryUpdate(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    const { values, errors, ok } = validate(req.body, schemas.category);
    if (!ok) return rejectInput(req, res, errors, '/admin/categories');
    return perform(req, res, { run: () => catalog.updateCategory(req.user, id, values, clientIp(req)), success: 'flash_saved', to: '/admin/categories' });
  },

  async locations(req, res) {
    res.render('admin/locations', { pageTitle: res.locals.t('nav_locations'), ...shell('/admin/locations'), rows: await catalog.listLocations() });
  },

  async locationCreate(req, res) {
    const { values, errors, ok } = validate(req.body, schemas.location);
    if (!ok) return rejectInput(req, res, errors, '/admin/locations');
    return perform(req, res, { run: () => catalog.createLocation(req.user, values, clientIp(req)), success: 'flash_saved', to: '/admin/locations' });
  },

  async locationUpdate(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    const { values, errors, ok } = validate(req.body, schemas.location);
    if (!ok) return rejectInput(req, res, errors, '/admin/locations');
    return perform(req, res, { run: () => catalog.updateLocation(req.user, id, values, clientIp(req)), success: 'flash_saved', to: '/admin/locations' });
  },

  // ---------------------------------------------------------------- settings
  async settings(req, res) {
    res.render('admin/settings', { pageTitle: res.locals.t('nav_settings'), ...shell('/admin/settings'), cfg: await settingsService.get() });
  },

  async settingsSave(req, res) {
    const { values, errors, ok } = validate(req.body, schemas.settings);
    if (!ok) return rejectInput(req, res, errors, '/admin/settings');
    return perform(req, res, { run: () => settingsService.update(req.user, values, clientIp(req)), success: 'flash_settings_saved', to: '/admin/settings' });
  },

  // ---------------------------------------------------------------- analytics and audit
  async analytics(req, res) {
    const data = await analytics.overview({ months: 6 });
    const { t, nm, place } = res.locals;
    const chart = {
      byCategory: data.byCategory.map((r) => ({ label: nm(r), lost: r.lost, found: r.found })),
      byStatus: data.byStatus.map((r) => ({ label: t(`status_${r.status}`), count: r.count })),
      monthly: data.monthly,
      hotspots: data.hotspots.map((h) => ({ label: place(h), count: h.count, lat: h.lat, lng: h.lng })),
      campus: config.campus,
      labels: { lost: t('type_lost'), found: t('type_found'), cases: t('an_cases'), noMap: t('an_map_none') }
    };
    res.render('admin/analytics', {
      pageTitle: res.locals.t('nav_analytics'), ...shell('/admin/analytics'), totals: data.totals, hotspots: data.hotspots, byCategory: data.byCategory,
      chartJson: JSON.stringify(chart).replace(/</g, '\\u003c')
    });
  },

  async audit(req, res) {
    const filters = { action: shortText(req.query.action, 60), q: shortText(req.query.q) };
    const [list, actions] = await Promise.all([auditModel.list({ ...filters, page: pageNum(req) }), auditModel.actions()]);
    res.render('admin/audit', { pageTitle: res.locals.t('nav_audit'), ...shell('/admin/audit'), filters, list, actions });
  }
});
