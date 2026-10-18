'use strict';
const router = require('express').Router();
const { requireRole } = require('../middleware/auth');
const admin = require('../controllers/admin.controller');
const idr = require('../controllers/idreview.controller');
const { ROLES } = require('../config/roles');

router.use(requireRole(ROLES.ADMIN));

router.get('/', admin.dashboard);

router.get('/users', admin.users);
router.post('/users/invite', admin.invite);
router.get('/users/:id', admin.userForm);
router.post('/users/:id', admin.userUpdate);
router.post('/users/:id/approve', admin.approve);
router.post('/users/:id/suspend', admin.suspend);
router.post('/users/:id/reactivate', admin.reactivate);
router.post('/users/:id/resend-invite', admin.resendInvite);
router.post('/users/:id/delete', admin.userDelete);

// ID card photos of people who registered without a university e-mail address.
router.get('/id-reviews', idr.list);
router.get('/id-reviews/:id', idr.show);
router.get('/id-reviews/:id/image', idr.image);
router.post('/id-reviews/:id/approve', idr.approve);
router.post('/id-reviews/:id/reject', idr.reject);

router.get('/categories', admin.categories);
router.post('/categories', admin.categoryCreate);
router.post('/categories/:id', admin.categoryUpdate);

router.get('/locations', admin.locations);
router.post('/locations', admin.locationCreate);
router.post('/locations/:id', admin.locationUpdate);

router.get('/settings', admin.settings);
router.post('/settings', admin.settingsSave);

router.get('/analytics', admin.analytics);
router.get('/audit', admin.audit);

module.exports = router;
