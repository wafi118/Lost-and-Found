'use strict';
// The administrator's check of ID card photos (AUTH-10, AUTH-11). Admin only: the router that mounts this
// controller already requires the admin role, and the photo is never served by any other route.
const path = require('path');
const wrap = require('../utils/wrapController');
const identity = require('../services/identity.service');
const { ID_PROOF, ID_REJECT_REASONS } = require('../config/statuses');
const { validate } = require('../validators');
const schemas = require('../validators/schemas');
const { MIME_BY_EXT, sendStored } = require('../utils/images');
const { pageNum, oneOfOr, intOr, perform, rejectInput, isDomainError, clientIp } = require('./_helpers');

const shell = (active) => ({ shell: 'app', active });

module.exports = wrap({
  async list(req, res) {
    const status = oneOfOr(req.query.status, Object.values(ID_PROOF), ID_PROOF.SUBMITTED);
    const [list, waiting] = await Promise.all([identity.queue({ status, page: pageNum(req) }), identity.waitingCount()]);
    res.render('admin/id-reviews', { pageTitle: res.locals.t('nav_id_reviews'), ...shell('/admin/id-reviews'), status, list, waiting });
  },

  async show(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    let data;
    try {
      data = await identity.get(id);
    } catch (err) {
      if (isDomainError(err) && err.code === 'NOT_FOUND') return next();
      throw err;
    }
    return res.render('admin/id-review', {
      pageTitle: res.locals.t('idr_detail_title'), ...shell('/admin/id-reviews'), ...data, reasons: ID_REJECT_REASONS
    });
  },

  // The photo. Every viewing is audited. It is never cached and never rendered as a page of its own.
  async image(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    let file;
    try {
      ({ file } = await identity.photoFor(req.user, id, clientIp(req)));
    } catch (err) {
      if (isDomainError(err) && err.code === 'NOT_FOUND') return next();
      throw err;
    }
    res.set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Type': MIME_BY_EXT[path.extname(file)] || 'application/octet-stream'
    });
    try {
      if (!(await sendStored(res, file))) return next();
    } catch (err) {
      if (err && !['ENOENT', 'ERR_STREAM_PREMATURE_CLOSE', 'ECONNRESET'].includes(err.code)) console.error('[images] could not send an ID photo -', err.message);
      if (!res.headersSent) return next();
      res.destroy();
    }
    return undefined;
  },

  async approve(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    const { errors, ok } = validate(req.body, schemas.idApprove);
    if (!ok) return rejectInput(req, res, errors, `/admin/id-reviews/${id}`);
    return perform(req, res, { run: () => identity.approve(req.user, id, clientIp(req)), success: 'flash_id_approved', to: '/admin/id-reviews' });
  },

  async reject(req, res, next) {
    const id = intOr(req.params.id);
    if (!id) return next();
    const { values, errors, ok } = validate(req.body, schemas.idReject);
    if (!ok) return rejectInput(req, res, errors, `/admin/id-reviews/${id}`);
    return perform(req, res, {
      run: () => identity.reject(req.user, id, values, clientIp(req)),
      success: 'flash_id_rejected', to: '/admin/id-reviews'
    });
  }
});
