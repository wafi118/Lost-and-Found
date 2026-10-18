'use strict';
// Single source of truth for role names. If the team's User table uses different
// values, change them here and nowhere else.
const ROLES = Object.freeze({
  MEMBER: 'member',       // Student / Staff
  SECURITY: 'security',   // Security Cell Staff
  APPROVER: 'approver',   // Chairman / Authorized Approver
  ADMIN: 'admin'          // System Administrator
});

const ALL_ROLES = Object.values(ROLES);
const AUTHORITY_ROLES = [ROLES.SECURITY, ROLES.APPROVER, ROLES.ADMIN];
const isAuthority = (role) => AUTHORITY_ROLES.includes(role);

const ROLE_LABEL_KEY = {
  member: 'role_member',
  security: 'role_security',
  approver: 'role_approver',
  admin: 'role_admin'
};

// Where each role lands after signing in.
const LANDING = {
  member: '/dashboard',
  security: '/security',
  approver: '/approver',
  admin: '/admin'
};

module.exports = { ROLES, ALL_ROLES, AUTHORITY_ROLES, isAuthority, ROLE_LABEL_KEY, LANDING };
