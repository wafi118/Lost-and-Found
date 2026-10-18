'use strict';
// Pages for signed-in people, plus the public view of one item.
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const limiter = require('../middleware/rateLimiter');
const upload = require('../middleware/upload');
const member = require('../controllers/member.controller');
const items = require('../controllers/items.controller');
const claim = require('../controllers/claim.controller');

router.get('/items/:ref', items.show); // limited card when not signed in
router.post('/items/:ref/updates', requireAuth, limiter.uploads, upload.photo, items.updatePost);
router.post('/items/:ref/updates/:id/delete', requireAuth, items.updateDelete);
router.post('/items/:ref/updates/:id/image', requireAuth, items.updateImageDelete);
router.post('/items/:ref/withdraw', requireAuth, items.withdraw);
router.get('/items/:ref/claim', requireAuth, claim.form);
router.post('/items/:ref/claim', requireAuth, limiter.uploads, upload.proof, claim.submit);

router.get('/claims', requireAuth, claim.list);
router.get('/claims/:id', requireAuth, claim.show);
router.get('/claims/:id/qr.png', requireAuth, claim.qr);
router.post('/claims/:id/proof', requireAuth, limiter.uploads, upload.proof, claim.proof);
router.post('/claims/:id/withdraw', requireAuth, claim.withdraw);

router.get('/uploads/:file', requireAuth, items.file);

router.get('/dashboard', requireAuth, member.dashboard);
router.get('/report', requireAuth, member.reportForm);
router.post('/report', requireAuth, limiter.uploads, upload.photo, member.reportSubmit);
router.get('/track', requireAuth, member.track);
router.get('/notifications', requireAuth, member.notifications);
router.get('/account', requireAuth, member.account);
router.post('/account/profile', requireAuth, member.profile);
router.post('/account/password', requireAuth, member.password);

module.exports = router;
