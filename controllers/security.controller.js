'use strict';
// Security Cell workspace. Administrators may read these pages; only Security Cell staff can act
// (the routes enforce this, and the templates hide the forms from everyone else).
const wrap = require('../utils/wrapController');
const cases = require('../services/case.service');
const claims = require('../services/claim.service');
const handovers = require('../services/handover.service');
const matching = require('../services/matching.service');
const retention = require('../services/retention.service');
const analytics = require('../services/analytics.service');
const caseModel = require('../models/case.model');
const claimModel = require('../models/claim.model');
const categoryModel = require('../models/category.model');
const locationModel = require('../models/location.model');
const { CASE, CLAIM, IN_CUSTODY } = require('../config/statuses');

const ALL_CASE_STATUSES = Object.values(CASE);
const HANDOVER_FILTERS = ['pending', 'expired', 'completed', 'cancelled'];
const { parseInputValue } = require('../utils/format');
const { validate, echo } = require('../validators');
const schemas = require('../validators/schemas');
const { isPartial, pageNum, oneOfOr, intOr, shortText, cleanRef, perform, rejectInput, isDomainError, errorKey, clientIp } = require('./_helpers');

const QUEUE_STATUSES = [CASE.UNDER_REVIEW, CASE.OPEN, CASE.MATCHED, CASE.CLAIM_PENDING, CASE.READY, CASE.CLOSED, CASE.REJECTED];
const CLAIM_TABS = { waiting: [CLAIM.SUBMITTED], proof: [CLAIM.PROOF_REQUESTED], verified: [CLAIM.VERIFIED], closed: [CLAIM.REJECTED, CLAIM.COMPLETED] };
const shell = (active, extra = {}) => ({ shell: 'app', active, ...extra });

async function handoverPage(req, res, { code = '', errors = {}, formError = null, status = 200 } = {}) {
  const pending = await handovers.listPending();
  let preview = null;
  if (code) {
    try {
      const ctx = await handovers.resolve(code);
      preview = await claims.hydrateClaim(ctx.claim, { forStaff: true });
    } catch (err) {
      if (!isDomainError(err)) throw err;
      if (!formError) formError = { key: errorKey(err), params: err };
      if (status < 400) status = 400; // a code that is expired, used or invalid is a rejected request
    }
  }
  return res.status(status).render('security/handover', {
    pageTitle: res.locals.t('handover_title'), ...shell('/security/handover'), pending, preview, code, errors, formError
  });
}

module.exports = wrap({
  async overview(req, res) {
    const [summary, queue, pending, waiting] = await Promise.all([
      analytics.staffSummary(),
      cases.listForStaff({ statuses: [CASE.UNDER_REVIEW], pageSize: 5 }),
      handovers.listPending(),
      claims.listForStaff([CLAIM.SUBMITTED, CLAIM.PROOF_REQUESTED])
    ]);
    res.render('security/overview', {
      pageTitle: res.locals.t('nav_overview'), ...shell('/security'), summary, queue: queue.rows, pending: pending.slice(0, 5), waiting: waiting.slice(0, 5)
    });
  },

  async records(req, res) {
    const filters = {
      status: oneOfOr(req.query.status, ALL_CASE_STATUSES),
      type: oneOfOr(req.query.type, ['lost', 'found']),
      q: shortText(req.query.q)
    };
    const list = await cases.listForStaff({
      statuses: filters.status ? [filters.status] : ALL_CASE_STATUSES,
      type: filters.type, q: filters.q, newest: true, page: pageNum(req)
    });
    if (isPartial(req)) {
      res.set('Cache-Control', 'no-store');
      return res.render('partials/list-results', { list, listBase: '/security/cases/', pagerBase: '/security/records', params: filters, progress: false, filtered: Boolean(filters.status || filters.type || filters.q), emptyKind: 'staff' });
    }
    return res.render('security/records', {
      pageTitle: res.locals.t('nav_all_cases'), ...shell('/security/records'), filters, list, statuses: ALL_CASE_STATUSES
    });
  },

  async queue(req, res) {
    const filters = {
      status: oneOfOr(req.query.status, QUEUE_STATUSES, CASE.UNDER_REVIEW),
      type: oneOfOr(req.query.type, ['lost', 'found']),
      q: shortText(req.query.q)
    };
    const list = await cases.listForStaff({ statuses: [filters.status], type: filters.type, q: filters.q, page: pageNum(req) });
    if (isPartial(req)) {
      res.set('Cache-Control', 'no-store');
      return res.render('partials/list-results', { list, listBase: '/security/cases/', pagerBase: '/security/queue', params: filters, progress: false, filtered: Boolean(filters.type || filters.q), emptyKind: 'staff' });
    }
    return res.render('security/queue', { pageTitle: res.locals.t('nav_review_queue'), ...shell('/security/queue'), filters, list, statuses: QUEUE_STATUSES });
  },

  async caseDetail(req, res, next) {
    const ref = cleanRef(req.params.ref);
    const data = ref && await cases.getForViewer(req.user, ref);
    if (!data || data.level !== 'staff') return next();
    const matches = await matching.forCaseView(data.view.id, 'staff');
    let caseClaims = [];
    if (data.view.type === 'found') {
      const rows = await claimModel.forCase(data.view.id);
      caseClaims = await Promise.all(rows.map((c) => claims.hydrateClaim(c, { forStaff: true })));
    }
    res.render('security/case', { pageTitle: data.view.ref, ...shell('/security/queue'), ...data, matches, caseClaims, errors: {}, formError: null, values: {} });
  },

  async review(req, res, next) {
    const ref = cleanRef(req.params.ref);
    if (!ref) return next();
    const to = `/security/cases/${ref}`;
    const { values, errors, ok } = validate(req.body, schemas.review);
    if (!ok) return rejectInput(req, res, errors, to);
    return perform(req, res, {
      run: () => cases.reviewDecision(req.user, ref, values, clientIp(req)),
      success: values.decision === 'accept' ? 'flash_review_accepted' : 'flash_review_rejected', to
    });
  },

  async note(req, res, next) {
    const ref = cleanRef(req.params.ref);
    if (!ref) return next();
    const to = `/security/cases/${ref}`;
    const { values, errors, ok } = validate(req.body, schemas.note);
    if (!ok) return rejectInput(req, res, errors, to);
    return perform(req, res, {
      run: () => cases.addNote(req.user, ref, { ...values, windowFrom: parseInputValue(values.windowFrom), windowTo: parseInputValue(values.windowTo) }, clientIp(req)),
      success: 'flash_note_saved', to
    });
  },

  async noteDelete(req, res, next) {
    const ref = cleanRef(req.params.ref);
    const id = intOr(req.params.id);
    if (!ref || !id) return next();
    return perform(req, res, { run: () => cases.deleteNote(req.user, ref, id, clientIp(req)), success: 'flash_note_deleted', to: `/security/cases/${ref}` });
  },

  async updatePost(req, res, next) {
    const ref = cleanRef(req.params.ref);
    if (!ref) return next();
    const to = `/security/cases/${ref}`;
    if (req.uploadError) { req.flash('error', `svc_${req.uploadError}`); return res.redirect(to); }
    const { values, errors, ok } = validate(req.body, schemas.caseUpdate);
    if (!ok) return rejectInput(req, res, errors, to);
    return perform(req, res, { run: () => cases.addUpdate(req.user, ref, values.body, req.file || null, clientIp(req)), success: 'flash_update_sent', to });
  },

  async updateDelete(req, res, next) {
    const ref = cleanRef(req.params.ref);
    const id = intOr(req.params.id);
    if (!ref || !id) return next();
    return perform(req, res, { run: () => cases.deleteUpdate(req.user, ref, id, clientIp(req)), success: 'flash_update_deleted', to: `/security/cases/${ref}` });
  },

  async updateImageDelete(req, res, next) {
    const ref = cleanRef(req.params.ref);
    const id = intOr(req.params.id);
    if (!ref || !id) return next();
    return perform(req, res, { run: () => cases.deleteUpdateImage(req.user, ref, id, clientIp(req)), success: 'flash_image_deleted', to: `/security/cases/${ref}` });
  },

  async inventory(req, res) {
    const q = shortText(req.query.q);
    const list = await cases.listForStaff({ statuses: IN_CUSTODY, type: 'found', q, page: pageNum(req) });
    res.render('security/inventory', { pageTitle: res.locals.t('nav_inventory'), ...shell('/security/inventory'), list, q });
  },

  async intakeForm(req, res) {
    const [categories, locations] = await Promise.all([categoryModel.list({ activeOnly: true }), locationModel.list({ activeOnly: true })]);
    res.render('security/intake', {
      pageTitle: res.locals.t('intake_title'), ...shell('/security/inventory'), categories, locations,
      values: { occurredAt: res.locals.nowInput() }, errors: {}, formError: null
    });
  },

  async intakeSubmit(req, res) {
    const { values, errors, ok } = validate(req.body, schemas.intake);
    const again = async (extra) => {
      const [categories, locations] = await Promise.all([categoryModel.list({ activeOnly: true }), locationModel.list({ activeOnly: true })]);
      return res.status(400).render('security/intake', {
        pageTitle: res.locals.t('intake_title'), ...shell('/security/inventory'), categories, locations, values: echo(values), errors: {}, formError: null, ...extra
      });
    };
    if (req.uploadError) return again({ errors, formError: { key: `svc_${req.uploadError}` } });
    if (!ok) return again({ errors });
    try {
      const c = await cases.intakeFound(req.user, { ...values, occurredAt: parseInputValue(values.occurredAt) }, req.file || null, clientIp(req));
      req.flash('success', 'flash_intake_done');
      return res.redirect(`/security/cases/${c.ref}`);
    } catch (err) {
      if (!isDomainError(err)) throw err;
      return again({ formError: { key: errorKey(err), params: err } });
    }
  },

  async matches(req, res) {
    const list = await matching.suggested();
    res.render('security/matches', { pageTitle: res.locals.t('nav_matches'), ...shell('/security/matches'), list });
  },

  async matchConfirm(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    return perform(req, res, { run: () => matching.confirm(req.user, id, clientIp(req)), success: 'flash_match_confirmed', to: '/security/matches' });
  },

  async matchReject(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    return perform(req, res, { run: () => matching.reject(req.user, id, clientIp(req)), success: 'flash_match_rejected', to: '/security/matches' });
  },

  async claimsList(req, res) {
    const tab = oneOfOr(req.query.tab, Object.keys(CLAIM_TABS), 'waiting');
    const rows = await claims.listForStaff(CLAIM_TABS[tab]);
    res.render('security/claims', { pageTitle: res.locals.t('nav_claims'), ...shell('/security/claims'), tab, tabs: Object.keys(CLAIM_TABS), rows });
  },

  async claimDetail(req, res, next) {
    const id = intOr(req.params.id);
    const claim = id && await claims.getForViewer(req.user, id);
    if (!claim) return next();
    if (claim.userId === req.user.id) return res.redirect(`/claims/${claim.id}`);
    const h = await handovers.forClaim(claim.id);
    const handover = h ? { status: h.status, expiresAt: h.expiresAt, expired: h.status === 'pending' && new Date(h.expiresAt) < new Date() } : null;
    return res.render('security/claim', { pageTitle: res.locals.t('claim_page_title'), ...shell('/security/claims'), claim, handover, errors: {}, formError: null });
  },

  async claimVerify(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    const { values } = validate(req.body, schemas.optionalNote);
    return perform(req, res, { run: () => claims.verify(req.user, id, { note: values.note }, clientIp(req)), success: 'flash_claim_verified', to: `/security/claims/${id}` });
  },

  async claimProof(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    const to = `/security/claims/${id}`;
    const { values, errors, ok } = validate(req.body, schemas.reason);
    if (!ok) return rejectInput(req, res, errors, to);
    return perform(req, res, { run: () => claims.requestProof(req.user, id, values.reason, clientIp(req)), success: 'flash_proof_requested', to });
  },

  async claimReject(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    const to = `/security/claims/${id}`;
    const { values, errors, ok } = validate(req.body, schemas.reason);
    if (!ok) return rejectInput(req, res, errors, to);
    return perform(req, res, { run: () => claims.reject(req.user, id, values.reason, clientIp(req)), success: 'flash_claim_rejected', to });
  },

  async handoverRenew(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    return perform(req, res, { run: () => handovers.renewAs(req.user, id, clientIp(req)), success: 'flash_handover_renewed', to: `/security/claims/${id}` });
  },

  handoverPage: (req, res) => handoverPage(req, res),

  async handoverHistory(req, res) {
    const filters = {
      status: oneOfOr(req.query.status, HANDOVER_FILTERS),
      q: shortText(req.query.q)
    };
    const list = await handovers.listHistory({ ...filters, page: pageNum(req) });
    res.render('security/handover-history', {
      pageTitle: res.locals.t('handover_history_title'), ...shell('/security/handover/history'), filters, list, statuses: HANDOVER_FILTERS
    });
  },

  async handoverLookup(req, res) {
    const { values, errors, ok } = validate(req.body, { code: schemas.handover.code });
    if (!ok) return handoverPage(req, res, { errors, status: 400 });
    return handoverPage(req, res, { code: values.code });
  },

  async handoverComplete(req, res) {
    const { values, errors, ok } = validate(req.body, schemas.handover);
    if (!ok) return handoverPage(req, res, { code: values.code, errors, status: 400 });
    try {
      await handovers.complete(req.user, values.code, { idChecked: values.idChecked }, clientIp(req));
      req.flash('success', 'flash_handover_done');
      return res.redirect('/security/handover');
    } catch (err) {
      if (!isDomainError(err)) throw err;
      return handoverPage(req, res, { code: values.code, formError: { key: errorKey(err), params: err }, status: 400 });
    }
  },

  async unclaimed(req, res) {
    const board = await retention.board();
    res.render('security/unclaimed', { pageTitle: res.locals.t('nav_unclaimed'), ...shell('/security/unclaimed'), board, methods: retention.METHODS });
  },

  async dispose(req, res, next) {
    const ref = cleanRef(req.params.ref);
    if (!ref) return next();
    const { values, errors, ok } = validate(req.body, schemas.dispose);
    if (!ok) return rejectInput(req, res, errors, '/security/unclaimed');
    return perform(req, res, { run: () => retention.dispose(req.user, ref, values, clientIp(req)), success: 'flash_disposed', to: '/security/unclaimed' });
  },

  async extend(req, res, next) {
    const ref = cleanRef(req.params.ref);
    if (!ref) return next();
    const { values } = validate(req.body, schemas.optionalNote);
    return perform(req, res, { run: () => retention.extend(req.user, ref, values.note, clientIp(req)), success: 'flash_extended', to: '/security/unclaimed' });
  }
});
