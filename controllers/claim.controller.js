'use strict';
// The claimant's side of a claim: make it, add proof when staff ask, collect the item.
const wrap = require('../utils/wrapController');
const cases = require('../services/case.service');
const claims = require('../services/claim.service');
const handovers = require('../services/handover.service');
const caseModel = require('../models/case.model');
const claimModel = require('../models/claim.model');
const { CASE } = require('../config/statuses');
const { validate, echo } = require('../validators');
const schemas = require('../validators/schemas');
const { cleanRef, intOr, perform, isDomainError, errorKey, clientIp } = require('./_helpers');

async function claimFormData(req, found) {
  const { catMap, locMap } = await cases.lookups();
  const category = catMap.get(found.categoryId);
  const card = cases.publicCard(found, category, locMap.get(found.locationId), req.lang);
  const mine = await cases.listMine(req.user, { type: 'lost', page: 1 });
  const lostOptions = mine.rows.filter((c) => [CASE.OPEN, CASE.MATCHED].includes(c.status));
  return { card, lostOptions, tier2: Boolean(category && category.highValue), foundRef: found.ref };
}

module.exports = wrap({
  async list(req, res) {
    const rows = await claims.listMine(req.user);
    const list = await Promise.all(rows.map(async (c) => {
      const h = await handovers.forClaim(c.id);
      const handover = c.status === 'verified' && h && h.status === 'pending'
        ? { code: handovers.shortCode(h), expiresAt: h.expiresAt, expired: new Date(h.expiresAt) < new Date() }
        : null;
      return { claim: c, handover };
    }));
    res.render('member/claims', {
      pageTitle: res.locals.t('nav_my_claims'), shell: 'app', active: '/claims', list
    });
  },

  async form(req, res, next) {
    const ref = cleanRef(req.params.ref);
    const found = ref && await caseModel.findByRef(ref);
    if (!found || found.type !== 'found' || !claims.CLAIMABLE.includes(found.status)) return next();
    if (found.userId && found.userId === req.user.id) {
      req.flash('error', 'svc_OWN_FOUND');
      return res.redirect(`/items/${ref}`);
    }
    if (!claims.canClaimAs(req.user)) {
      req.flash('error', 'svc_STAFF_CANNOT_CLAIM');
      return res.redirect(`/items/${ref}`);
    }
    return res.render('member/claim-form', {
      pageTitle: res.locals.t('claim_form_title'), shell: 'app', active: '/track',
      ...(await claimFormData(req, found)), values: { lostRef: cleanRef(req.query.lost) || '' }, errors: {}, formError: null
    });
  },

  async submit(req, res, next) {
    const ref = cleanRef(req.params.ref);
    const found = ref && await caseModel.findByRef(ref);
    if (!found || found.type !== 'found') return next();

    const claimCheck = validate(req.body, schemas.claim);
    const proofCheck = validate(req.body, schemas.proof);
    const again = async (extra) => res.status(400).render('member/claim-form', {
      pageTitle: res.locals.t('claim_form_title'), shell: 'app', active: '/track',
      ...(await claimFormData(req, found)), values: echo({ ...claimCheck.values, ...proofCheck.values }), errors: {}, formError: null, ...extra
    });
    if (req.uploadError) return again({ errors: claimCheck.errors, formError: { key: `svc_${req.uploadError}` } });
    if (!claimCheck.ok) return again({ errors: claimCheck.errors });
    try {
      const claim = await claims.submit(req.user, ref, { ...claimCheck.values, proofNote: proofCheck.values.proofNote }, req.file || null, clientIp(req));
      req.flash('success', 'flash_claim_sent');
      return res.redirect(`/claims/${claim.id}`);
    } catch (err) {
      if (!isDomainError(err)) throw err;
      return again({ formError: { key: errorKey(err), params: err } });
    }
  },

  async show(req, res, next) {
    const id = intOr(req.params.id);
    const claim = id && await claims.getForViewer(req.user, id);
    if (!claim) return next();
    if (claim.userId !== req.user.id) return res.redirect(`/security/claims/${claim.id}`);

    const h = await handovers.forClaim(claim.id);
    const handover = h && h.status === 'pending'
      ? { code: handovers.shortCode(h), expiresAt: h.expiresAt, expired: new Date(h.expiresAt) < new Date() }
      : null;
    return res.render('member/claim', {
      pageTitle: res.locals.t('claim_page_title'), shell: 'app', active: '/claims', claim, handover, errors: {}, formError: null
    });
  },

  async proof(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    if (req.uploadError) { req.flash('error', `svc_${req.uploadError}`); return res.redirect(`/claims/${id}`); }
    const { values } = validate(req.body, schemas.proof);
    return perform(req, res, { run: () => claims.submitProof(req.user, id, { proofNote: values.proofNote }, req.file || null, clientIp(req)), success: 'flash_proof_sent', to: `/claims/${id}` });
  },

  async withdraw(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    return perform(req, res, { run: () => claims.withdraw(req.user, id, clientIp(req)), success: 'flash_claim_withdrawn', to: `/claims/${id}` });
  },

  // The QR image is shown only to the person who made the claim, and only while it can be used.
  async qr(req, res, next) {
    const id = intOr(req.params.id);
    const claim = id && await claimModel.get(id);
    if (!claim || claim.userId !== req.user.id) return next();
    const h = await handovers.forClaim(claim.id);
    if (!h || h.status !== 'pending' || new Date(h.expiresAt) < new Date()) return next();
    const png = await handovers.qrPng(h);
    return res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }).send(png);
  }
});
