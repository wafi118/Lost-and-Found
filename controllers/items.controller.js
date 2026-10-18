'use strict';
// One page per case (role-aware) and protected access to uploaded photos.
const path = require('path');
const wrap = require('../utils/wrapController');
const cases = require('../services/case.service');
const claims = require('../services/claim.service');
const matching = require('../services/matching.service');
const caseModel = require('../models/case.model');
const claimModel = require('../models/claim.model');
const { PUBLIC_VISIBLE, CLAIM_ACTIVE } = require('../config/statuses');
const { ROLES } = require('../config/roles');
const { MIME_BY_EXT, sendStored } = require('../utils/images');
const { validate } = require('../validators');
const schemas = require('../validators/schemas');
const { cleanRef, intOr, perform, rejectInput, clientIp } = require('./_helpers');

const FILE = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

module.exports = wrap({
  async show(req, res, next) {
    const ref = cleanRef(req.params.ref);
    if (!ref) return next();

    // Not signed in: the same limited card as the public board, nothing more (PUB-1 to PUB-6).
    if (!req.user) {
      const c = await caseModel.findByRef(ref);
      if (!c || !PUBLIC_VISIBLE.includes(c.status)) return next();
      const { catMap, locMap } = await cases.lookups();
      const card = cases.publicCard(c, catMap.get(c.categoryId), locMap.get(c.locationId), req.lang);
      return res.render('items/public', { pageTitle: card.masked ? card.categoryName : card.title, card });
    }

    const data = await cases.getForViewer(req.user, ref);
    if (!data) return next();
    const { view, level } = data;
    const isStaff = level === 'staff';
    const matches = isStaff || level === 'owner' ? await matching.forCaseView(view.id, isStaff ? 'staff' : 'member') : [];

    let myClaim = null;
    let canClaim = false;
    if (view.type === 'found') {
      const mine = await claims.listMine(req.user);
      myClaim = mine.find((c) => c.foundCaseId === view.id && CLAIM_ACTIVE.includes(c.status)) || null;
      canClaim = level === 'viewer' && claims.CLAIMABLE.includes(view.status) && !myClaim;
    }
    const canAct = req.user.role === ROLES.SECURITY;
    return res.render('items/show', {
      pageTitle: view.titleMasked ? data.category.name : view.title, shell: 'app', active: isStaff ? '/security/queue' : '/track',
      ...data, matches, myClaim, canClaim, canAct, canUpdate: level === 'owner' || canAct
    });
  },

  async updatePost(req, res, next) {
    const ref = cleanRef(req.params.ref);
    if (!ref) return next();
    const to = `/items/${ref}`;
    if (req.uploadError) { req.flash('error', `svc_${req.uploadError}`); return res.redirect(to); }
    const { values, errors, ok } = validate(req.body, schemas.caseUpdate);
    if (!ok) return rejectInput(req, res, errors, to);
    return perform(req, res, { run: () => cases.addUpdate(req.user, ref, values.body, req.file || null, clientIp(req)), success: 'flash_update_sent', to });
  },

  async updateDelete(req, res, next) {
    const ref = cleanRef(req.params.ref);
    const id = intOr(req.params.id);
    if (!ref || !id) return next();
    return perform(req, res, { run: () => cases.deleteUpdate(req.user, ref, id, clientIp(req)), success: 'flash_update_deleted', to: `/items/${ref}` });
  },

  async updateImageDelete(req, res, next) {
    const ref = cleanRef(req.params.ref);
    const id = intOr(req.params.id);
    if (!ref || !id) return next();
    return perform(req, res, { run: () => cases.deleteUpdateImage(req.user, ref, id, clientIp(req)), success: 'flash_image_deleted', to: `/items/${ref}` });
  },

  async withdraw(req, res) {
    const ref = cleanRef(req.params.ref);
    if (!ref) return res.redirect('/track');
    return perform(req, res, { run: () => cases.withdraw(req.user, ref, clientIp(req)), success: 'flash_withdrawn', to: `/items/${ref}` });
  },

  // Photos are private. The file name alone is not enough: we look up what it belongs to and
  // check that this person may see that case or claim.
  async file(req, res, next) {
    const name = String(req.params.file || '');
    if (!FILE.test(name)) return next();
    let allowed = false;

    const c = await caseModel.findByPhoto(name);
    if (c) {
      allowed = ['staff', 'owner', 'approver'].includes(cases.accessLevel(req.user, c));
    } else {
      const claim = await claimModel.findByProof(name);
      if (claim) allowed = claim.userId === req.user.id || req.user.role === ROLES.SECURITY || req.user.role === ROLES.ADMIN;
    }
    if (!allowed) {
      const updateModel = require('../models/caseUpdate.model');
      const message = await updateModel.findByImage(name);
      if (message && message.image) {
        const owner = await caseModel.findById(message.caseId);
        allowed = Boolean(owner && ['staff', 'owner'].includes(cases.accessLevel(req.user, owner)));
      }
    }
    if (!allowed) return next(); // same answer as a missing file

    res.set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Type': MIME_BY_EXT[path.extname(name)] || 'application/octet-stream'
    });
    try {
      if (!(await sendStored(res, name))) return next();
    } catch (err) {
      if (err && !['ENOENT', 'ERR_STREAM_PREMATURE_CLOSE', 'ECONNRESET'].includes(err.code)) console.error('[images] could not send', name, '-', err.message);
      if (!res.headersSent) return next(); // same answer as a missing file
      res.destroy(); // a transfer that broke half-way cannot be turned into an error page
    }
    return undefined;
  }
});
