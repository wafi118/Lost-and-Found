'use strict';
// Security Cell workspace. Reading is open to Security and Admin; acting is Security only.
const router = require('express').Router();
const { requireRole } = require('../middleware/auth');
const limiter = require('../middleware/rateLimiter');
const upload = require('../middleware/upload');
const sec = require('../controllers/security.controller');
const { ROLES } = require('../config/roles');

const read = requireRole(ROLES.SECURITY, ROLES.ADMIN);
const act = requireRole(ROLES.SECURITY);

router.use((req, res, next) => { res.locals.canAct = Boolean(req.user && req.user.role === ROLES.SECURITY); next(); });

router.get('/', read, sec.overview);
router.get('/records', read, sec.records);
router.get('/queue', read, sec.queue);
router.get('/cases/:ref', read, sec.caseDetail);
router.post('/cases/:ref/review', act, sec.review);
router.post('/cases/:ref/notes', act, sec.note);
router.post('/cases/:ref/notes/:id/delete', act, sec.noteDelete);
router.post('/cases/:ref/updates', act, limiter.uploads, upload.photo, sec.updatePost);
router.post('/cases/:ref/updates/:id/delete', act, sec.updateDelete);
router.post('/cases/:ref/updates/:id/image', act, sec.updateImageDelete);

router.get('/inventory', read, sec.inventory);
router.get('/intake', act, sec.intakeForm);
router.post('/intake', act, limiter.uploads, upload.photo, sec.intakeSubmit);

router.get('/matches', read, sec.matches);
router.post('/matches/:id/confirm', act, sec.matchConfirm);
router.post('/matches/:id/reject', act, sec.matchReject);

router.get('/claims', read, sec.claimsList);
router.get('/claims/:id', read, sec.claimDetail);
router.post('/claims/:id/verify', act, sec.claimVerify);
router.post('/claims/:id/request-proof', act, sec.claimProof);
router.post('/claims/:id/reject', act, sec.claimReject);
router.post('/claims/:id/renew', act, sec.handoverRenew);

router.get('/handover/history', read, sec.handoverHistory);
router.get('/handover', read, sec.handoverPage);
router.post('/handover/lookup', act, limiter.scan, sec.handoverLookup);
router.post('/handover/complete', act, limiter.scan, sec.handoverComplete);

router.get('/unclaimed', read, sec.unclaimed);
router.post('/unclaimed/:ref/dispose', act, sec.dispose);
router.post('/unclaimed/:ref/extend', act, sec.extend);

module.exports = router;
