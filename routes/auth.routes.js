'use strict';
const router = require('express').Router();
const auth = require('../controllers/auth.controller');
const { requireGuest } = require('../middleware/auth');
const limiter = require('../middleware/rateLimiter');
const upload = require('../middleware/upload');

router.get('/login', requireGuest, auth.loginPage);
router.post('/login', requireGuest, limiter.login, auth.loginSubmit);
router.get('/register', requireGuest, auth.registerPage);
router.post('/register', requireGuest, limiter.register, auth.registerSubmit);
// Registration with an ID card photo. The CSRF token travels in the query string of the form action, because
// the multipart body is not read yet when the token is checked.
router.get('/register/id-card', requireGuest, auth.registerIdPage);
router.post('/register/id-card', requireGuest, limiter.register, limiter.uploads, upload.idcard, auth.registerIdSubmit);
router.get('/id-card/resubmit/:token', auth.resubmitPage);
router.post('/id-card/resubmit/:token', limiter.emailActions, limiter.uploads, upload.idcard, auth.resubmitSubmit);
router.get('/check-email', auth.checkEmail);
router.post('/resend', limiter.emailActions, auth.resend);

// The link in the e-mail only shows a confirm page; the token is used by the POST, so mail
// scanners that open links cannot use it up.
router.get('/verify/:token', auth.verifyPage);
router.post('/verify/:token', limiter.emailActions, auth.verifySubmit);

router.get('/forgot', auth.forgotPage);
router.post('/forgot', limiter.emailActions, auth.forgotSubmit);
router.get('/reset/:token', auth.resetPage);
router.post('/reset/:token', limiter.emailActions, auth.resetSubmit);

router.get('/invite/:token', auth.invitePage);
router.post('/invite/:token', limiter.emailActions, auth.inviteSubmit);

router.post('/logout', auth.logout);

module.exports = router;
