'use strict';
// One schema per form. Keep rules here, not in controllers.
const v = require('./index');
const auth = require('../services/auth.service');
const config = require('../config');
const { ALL_ROLES, ROLES } = require('../config/roles');
const { ID_REJECT_REASONS } = require('../config/statuses');

const EMAIL_LOOSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9\s-]{6,17}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const SLOT = /^[A-Za-z0-9][A-Za-z0-9 \-/]{0,19}$/;
const REF = /^SF-\d{4}-\d{4}$/i;

const emailField = () => v.field(v.lower(), v.need(), v.pattern(EMAIL_LOOSE, 'err_email'),
  v.custom((value) => (auth.isAllowedEmail(value) ? null : ['err_email_domain', { domains: config.auth.allowedEmailDomains.join(', ') }])));

// The address of a person who joins with an ID card: any real-looking address, but not a university one
// (that address would prove membership by itself, so the other form is the right one).
const otherEmailField = () => v.field(v.lower(), v.need(), v.pattern(EMAIL_LOOSE, 'err_email'),
  v.custom((value) => {
    if (!auth.isValidEmailShape(value)) return 'err_email';
    return auth.isAllowedEmail(value) ? ['err_email_use_university', { domains: config.auth.allowedEmailDomains.join(', ') }] : null;
  }));

// Password rules: 8 to 64 characters with an uppercase letter and a number. The upper limit is
// below bcrypt's 72-byte cut-off, so every character counts.
const passwordRules = [
  v.need(), v.minLen(8, 'err_password_short'), v.maxLen(64),
  v.pattern(/[A-Z]/, 'err_password_weak'), v.pattern(/[0-9]/, 'err_password_weak')
];

// The public title is shown to anyone. Keep personal identifiers out of it (fixes D10).
const publicTitle = v.custom((value) => {
  if (/\d{6,}/.test(value.replace(/[\s-]/g, ''))) return 'err_title_private';
  if (/@|https?:\/\/|www\./i.test(value)) return 'err_title_private';
  return null;
});

const whenField = () => v.field(v.line(20), v.need(), v.pattern(DATETIME, 'err_datetime'));

const caseFields = () => ({
  categoryId: v.field(v.integer, v.need()),
  locationId: v.field(v.integer, v.need()),
  title: v.field(v.line(80), v.need(), v.minLen(3), publicTitle),
  description: v.field(v.text(1000), v.need(), v.minLen(15, 'err_description_short')),
  locationDetail: v.optional(v.line(200)),
  occurredAt: whenField()
});

module.exports = {
  login: {
    email: v.field(v.lower(), v.need()),
    password: v.field(v.secret, v.need()),
    next: v.optional(v.line(512))
  },
  register: {
    name: v.field(v.line(80), v.need(), v.minLen(2)),
    email: emailField(),
    affiliation: v.field(v.line(10), v.oneOf(['student', 'staff'])),
    universityId: v.field(v.line(24), v.need(), v.custom((value, all) =>
      (auth.isValidUniversityId(all.affiliation, value) ? null : (all.affiliation === 'staff' ? 'err_id_staff' : 'err_id_student')))),
    phone: v.optional(v.line(20), v.pattern(PHONE, 'err_phone')),
    password: v.field(v.secret, ...passwordRules),
    confirm: v.field(v.secret, v.matches('password', 'err_password_match')),
    attest: v.field(v.flag, v.isTrue('err_attest'))
  },
  registerIdCard: {
    name: v.field(v.line(80), v.need(), v.minLen(2)),
    email: otherEmailField(),
    affiliation: v.field(v.line(10), v.oneOf(['student', 'staff'])),
    universityId: v.field(v.line(24), v.need(), v.custom((value, all) =>
      (auth.isValidUniversityId(all.affiliation, value) ? null : (all.affiliation === 'staff' ? 'err_id_staff' : 'err_id_student')))),
    phone: v.optional(v.line(20), v.pattern(PHONE, 'err_phone')),
    password: v.field(v.secret, ...passwordRules),
    confirm: v.field(v.secret, v.matches('password', 'err_password_match')),
    attest: v.field(v.flag, v.isTrue('err_attest'))
  },
  // Administrator's decision on an ID card photo. Approving needs the box ticked: the name and the ID
  // number on the card were compared with what the person typed.
  idApprove: { checked: v.field(v.flag, v.isTrue('err_id_checked')) },
  idReject: {
    reason: v.field(v.line(20), v.oneOf(ID_REJECT_REASONS, 'err_id_reason')),
    note: v.field(v.line(200), v.custom((value, all) => (all.reason === 'other' && !value ? 'err_id_note' : null))),
    permanent: v.field(v.flag)
  },
  email: { email: v.field(v.lower(), v.need(), v.pattern(EMAIL_LOOSE, 'err_email')) },
  newPassword: {
    password: v.field(v.secret, ...passwordRules),
    confirm: v.field(v.secret, v.matches('password', 'err_password_match'))
  },
  changePassword: {
    current: v.field(v.secret, v.need()),
    password: v.field(v.secret, ...passwordRules),
    confirm: v.field(v.secret, v.matches('password', 'err_password_match'))
  },
  profile: {
    name: v.field(v.line(80), v.need(), v.minLen(2)),
    phone: v.optional(v.line(20), v.pattern(PHONE, 'err_phone')),
    lang: v.field(v.line(2), v.oneOf(['en', 'bn']))
  },
  // Administrator edit. Password and university ID are not fields, so they cannot be submitted.
  accountEdit: {
    name: v.field(v.line(80), v.need(), v.minLen(2)),
    email: v.field(v.lower(), v.need(), v.pattern(EMAIL_LOOSE, 'err_email')),
    phone: v.optional(v.line(20), v.pattern(PHONE, 'err_phone')),
    role: v.field(v.line(20), v.oneOf(ALL_ROLES)),
    affiliation: v.optional(v.line(10), v.oneOf(['student', 'staff'])),
    lang: v.field(v.line(2), v.oneOf(['en', 'bn']))
  },

  report: caseFields(),
  intake: {
    ...caseFields(),
    finderName: v.field(v.line(80), v.need(), v.minLen(2)),
    finderContact: v.optional(v.line(80)),
    finderUniversityId: v.optional(v.line(24), v.pattern(/^[A-Za-z0-9][A-Za-z0-9\-/]{2,23}$/, 'err_id_any')),
    storageSlot: v.field(v.line(20), v.need(), v.pattern(SLOT, 'err_slot'))
  },
  claim: {
    statement: v.field(v.text(800), v.need(), v.minLen(25, 'err_statement_short')),
    lostRef: v.optional(v.line(20), v.pattern(REF, 'err_choice'))
  },
  proof: { proofNote: v.optional(v.text(500)) },

  approval: {
    decision: v.field(v.line(10), v.oneOf(['approve', 'reject'])),
    remarks: v.optional(v.text(500))
  },
  review: {
    decision: v.field(v.line(10), v.oneOf(['accept', 'reject'])),
    note: v.optional(v.text(500)),
    storageSlot: v.optional(v.line(20), v.pattern(SLOT, 'err_slot'))
  },
  caseUpdate: { body: v.optional(v.text(1500)) },
  note: {
    kind: v.field(v.line(10), v.oneOf(['note', 'cctv'])),
    camera: v.optional(v.line(80)),
    windowFrom: v.optional(v.line(20), v.pattern(DATETIME, 'err_datetime')),
    windowTo: v.optional(v.line(20), v.pattern(DATETIME, 'err_datetime')),
    findings: v.field(v.text(1500), v.need(), v.minLen(5))
  },
  reason: { reason: v.field(v.text(500), v.need()) },
  optionalNote: { note: v.optional(v.text(500)) },
  dispose: {
    method: v.field(v.line(12), v.oneOf(['donate', 'recycle', 'transfer'])),
    note: v.optional(v.text(500))
  },
  handover: {
    code: v.field(v.line(600), v.need('svc_QR_INVALID')),
    idChecked: v.field(v.flag, v.isTrue('err_id_check'))
  },

  category: {
    name: v.field(v.line(60), v.need(), v.minLen(2)),
    nameBn: v.optional(v.line(60)),
    sensitive: v.optional(v.flag),
    highValue: v.optional(v.flag),
    requiresApproval: v.optional(v.flag),
    active: v.optional(v.flag)
  },
  location: {
    building: v.field(v.line(60), v.need()),
    buildingBn: v.optional(v.line(60)),
    name: v.field(v.line(60), v.need()),
    nameBn: v.optional(v.line(60)),
    lat: v.optional(v.decimal, v.between(-90, 90)),
    lng: v.optional(v.decimal, v.between(-180, 180)),
    active: v.optional(v.flag)
  },
  settings: {
    retentionDays: v.field(v.integer, v.between(7, 730)),
    matchThreshold: v.field(v.integer, v.between(10, 90)),
    wCategory: v.field(v.integer, v.between(0, 100)),
    wDescription: v.field(v.integer, v.between(0, 100)),
    wLocation: v.field(v.integer, v.between(0, 100)),
    wTime: v.field(v.integer, v.between(0, 100)),
    handoverValidDays: v.field(v.integer, v.between(1, 30))
  },
  authorityAccount: {
    name: v.field(v.line(80), v.need(), v.minLen(2)),
    email: emailField(),
    role: v.field(v.line(12), v.oneOf(ALL_ROLES.filter((r) => r !== ROLES.MEMBER)))
  }
};
