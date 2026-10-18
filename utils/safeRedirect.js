'use strict';
// Only ever redirect to a path inside this app. Rejects absolute URLs, protocol-relative
// URLs (//host), backslash tricks (/\host, which browsers treat as //host), control
// characters, and the auth pages themselves (which would cause a redirect loop).
function safeRedirect(target, fallback = null, { allowAuth = false } = {}) {
  if (typeof target !== 'string' || target.length === 0 || target.length > 512) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(target)) return fallback;
  if (!target.startsWith('/') || target.startsWith('//')) return fallback;
  try {
    const u = new URL(target, 'http://internal.invalid');
    if (u.origin !== 'http://internal.invalid') return fallback;
    if (!allowAuth && u.pathname.startsWith('/auth/')) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
module.exports = safeRedirect;
