'use strict';
// One error type for business-rule failures. `code` maps to the locale key `svc_<CODE>`,
// so controllers can show a translated message without a switch statement.
class ServiceError extends Error {
  constructor(code, extra = {}) {
    super(code);
    this.name = 'ServiceError';
    this.code = code;
    Object.assign(this, extra);
  }
}

const DOMAIN_ERRORS = new Set(['ServiceError', 'AuthError', 'UserError', 'MatchError']);
const isDomainError = (e) => Boolean(e) && DOMAIN_ERRORS.has(e.name) && typeof e.code === 'string';
const errorKey = (e) => `svc_${e.code}`;

module.exports = { ServiceError, isDomainError, errorKey };
