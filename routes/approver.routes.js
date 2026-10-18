'use strict';
const router = require('express').Router();
const { requireRole } = require('../middleware/auth');
const approver = require('../controllers/approver.controller');
const { ROLES } = require('../config/roles');

// The authorized approver decides these reports. An administrator can do the same when
// that approver is not available, which is the "Waiting for approval" status on a lost report.
router.use(requireRole(ROLES.APPROVER, ROLES.ADMIN));
router.get('/', approver.queue);
router.get('/history', approver.queue);
router.get('/cases/:ref', approver.caseDetail);
router.post('/cases/:ref/decision', approver.decide);

module.exports = router;
