'use strict';
// Sidebar navigation per role. `key` is a locale key, `icon` a symbol id from partials/icons.ejs.
const personal = [
  { href: '/report', key: 'nav_report', icon: 'plus' },
  { href: '/track', key: 'nav_my_cases', icon: 'list' },
  { href: '/claims', key: 'nav_my_claims', icon: 'shield' },
  { href: '/notifications', key: 'nav_notifications', icon: 'bell' },
  { href: '/account', key: 'nav_account', icon: 'user' }
];

const workspace = {
  member: [{ href: '/dashboard', key: 'nav_dashboard', icon: 'home' }],
  security: [
    { href: '/security', key: 'nav_overview', icon: 'home' },
    { href: '/security/records', key: 'nav_all_cases', icon: 'list' },
    { href: '/security/queue', key: 'nav_review_queue', icon: 'clipboard' },
    { href: '/security/inventory', key: 'nav_inventory', icon: 'box' },
    { href: '/security/matches', key: 'nav_matches', icon: 'search' },
    { href: '/security/claims', key: 'nav_claims', icon: 'shield' },
    { href: '/security/handover', key: 'nav_handover', icon: 'qr' },
    { href: '/security/handover/history', key: 'nav_handover_history', icon: 'clock' },
    { href: '/security/unclaimed', key: 'nav_unclaimed', icon: 'clock' }
  ],
  approver: [{ href: '/approver', key: 'nav_approvals', icon: 'clipboard' }],
  admin: [
    { href: '/admin', key: 'nav_overview', icon: 'home' },
    { href: '/approver', key: 'nav_approvals', icon: 'clipboard' },
    { href: '/admin/users', key: 'nav_users', icon: 'users' },
    { href: '/admin/id-reviews', key: 'nav_id_reviews', icon: 'shield' },
    { href: '/admin/categories', key: 'nav_categories', icon: 'list' },
    { href: '/admin/locations', key: 'nav_locations', icon: 'map-pin' },
    { href: '/admin/settings', key: 'nav_settings', icon: 'settings' },
    { href: '/admin/analytics', key: 'nav_analytics', icon: 'chart' },
    { href: '/admin/audit', key: 'nav_audit', icon: 'clipboard' },
    { href: '/security/records', key: 'nav_all_cases', icon: 'list' },
    { href: '/security/handover/history', key: 'nav_handover_history', icon: 'clock' },
    { href: '/security', key: 'nav_security_view', icon: 'shield' }
  ]
};

function navFor(role) {
  return { workspace: workspace[role] || [], personal };
}

module.exports = { navFor };
