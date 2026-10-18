'use strict';
// Reports that need approval. The authorized approver decides them. An administrator can too.
const wrap = require('../utils/wrapController');
const cases = require('../services/case.service');
const analytics = require('../services/analytics.service');
const { validate } = require('../validators');
const schemas = require('../validators/schemas');
const { pageNum, cleanRef, perform, rejectInput, clientIp } = require('./_helpers');

const shell = { shell: 'app', active: '/approver' };

module.exports = wrap({
  async queue(req, res) {
    const history = req.path === '/history';
    const [list, summary] = await Promise.all([cases.listApprovals({ history, page: pageNum(req) }), analytics.approverSummary()]);
    res.render('approver/queue', { pageTitle: res.locals.t('nav_approvals'), ...shell, list, summary, history });
  },

  async caseDetail(req, res, next) {
    const ref = cleanRef(req.params.ref);
    const data = ref && await cases.getForViewer(req.user, ref);
    const mayDecide = data && (data.level === 'approver' || req.user.role === 'admin');
    if (!mayDecide || !data.view.approvalRequired) return next();
    res.render('approver/case', { pageTitle: data.view.ref, ...shell, ...data, errors: {}, formError: null });
  },

  async decide(req, res, next) {
    const ref = cleanRef(req.params.ref);
    if (!ref) return next();
    const { values, errors, ok } = validate(req.body, schemas.approval);
    if (!ok) return rejectInput(req, res, errors, `/approver/cases/${ref}`);
    return perform(req, res, {
      run: () => cases.approvalDecision(req.user, ref, values, clientIp(req)),
      success: values.decision === 'approve' ? 'flash_approval_approved' : 'flash_approval_rejected',
      to: values.decision === 'approve' ? '/approver' : '/approver'
    });
  }
});
