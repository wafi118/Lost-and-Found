/* Small progressive enhancements. Every page works without this file; it only adds
   the theme switch, the mobile menu, password reveal, toast messages and similar helpers. */
(function () {
  'use strict';
  var doc = document;
  var root = doc.documentElement;

  // ---- theme
  function syncToggle() {
    var dark = root.getAttribute('data-theme') === 'dark';
    doc.querySelectorAll('[data-theme-toggle]').forEach(function (b) { b.setAttribute('aria-pressed', dark ? 'true' : 'false'); });
  }
  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem('sf-theme', theme); } catch (e) { /* storage blocked: the choice lasts for this page only */ }
    syncToggle();
    doc.dispatchEvent(new CustomEvent('sf:theme', { detail: theme }));
  }

  // ---- mobile menu
  function setNav(open) {
    doc.body.classList.toggle('nav-open', open);
    doc.querySelectorAll('[data-nav-toggle]').forEach(function (b) { b.setAttribute('aria-expanded', open ? 'true' : 'false'); });
  }

  // ---- public header menu (narrow screens)
  function setMenu(open) {
    var nav = doc.getElementById('site-nav');
    if (nav) nav.classList.toggle('open', open);
    doc.querySelectorAll('[data-menu-toggle]').forEach(function (b) { b.setAttribute('aria-expanded', open ? 'true' : 'false'); });
  }

  doc.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target : e.target.parentElement;
    if (!el) return;
    if (el.closest('[data-theme-toggle]')) { setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); return; }
    if (el.closest('[data-menu-toggle]')) { setMenu(!doc.querySelector('#site-nav.open')); return; }
    if (el.closest('#site-nav a')) setMenu(false); // the link still works
    if (el.closest('[data-nav-toggle]')) { setNav(!doc.body.classList.contains('nav-open')); return; }
    if (el.closest('[data-nav-backdrop]') || el.closest('.sidebar a')) { setNav(false); return; }
    var dismiss = el.closest('[data-dismiss]');
    if (dismiss) { var flash = dismiss.closest('.flash'); if (flash) flash.remove(); return; }
    var pw = el.closest('[data-pw-toggle]');
    if (pw) {
      var input = doc.getElementById(pw.getAttribute('data-pw-toggle'));
      if (!input) return;
      var reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      pw.textContent = reveal ? pw.getAttribute('data-hide') : pw.getAttribute('data-show');
    }
  });

  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') { setNav(false); setMenu(false); } });

  // ---- forms: confirmation prompts and double-submit guard
  doc.addEventListener('submit', function (e) {
    var form = e.target;
    var message = form.getAttribute && form.getAttribute('data-confirm');
    if (message && !window.confirm(message)) { e.preventDefault(); return; }
    if (e.defaultPrevented || form.hasAttribute('data-keep')) return;
    setTimeout(function () {
      form.querySelectorAll('button[type="submit"], input[type="submit"]').forEach(function (b) { b.disabled = true; });
    }, 0);
  });
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    doc.querySelectorAll('button[type="submit"]:disabled').forEach(function (b) { b.disabled = false; });
  });

  doc.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches && t.matches('select[data-autosubmit]') && t.form) t.form.submit();

    // photo preview and size check
    if (t.matches && t.matches('input[type="file"][data-preview]')) {
      var box = doc.getElementById(t.getAttribute('data-preview'));
      var file = t.files && t.files[0];
      var warn = box && box.querySelector('[data-file-warning]');
      var img = box && box.querySelector('img');
      if (!box || !img) return;
      if (warn) warn.hidden = true;
      if (!file) { box.classList.remove('has-image'); img.removeAttribute('src'); return; }
      var max = parseInt(t.getAttribute('data-max-bytes'), 10) || 0;
      if (max && file.size > max) {
        t.value = '';
        box.classList.remove('has-image');
        if (warn) { warn.hidden = false; box.classList.add('has-image'); img.hidden = true; }
        return;
      }
      img.hidden = false;
      img.src = URL.createObjectURL(file);
      box.classList.add('has-image');
    }
  });

  // ---- toasts: floating messages. The server's flash banner (data-flash) becomes one, and other
  // scripts can show their own through window.SafeFind.toast (live filters, live alerts).
  var TOAST_MS = 3500;
  var TOAST_MAX = 4;
  var toastRoot = null;

  function toastStack() {
    if (toastRoot && toastRoot.isConnected) return toastRoot;
    toastRoot = doc.createElement('div');
    toastRoot.className = 'toast-stack';
    toastRoot.setAttribute('aria-live', 'polite');
    doc.body.appendChild(toastRoot);
    return toastRoot;
  }
  function removeToast(el) { clearTimeout(el._timer); el.remove(); }
  function dismissToast(el) {
    if (!el || el.classList.contains('is-leaving')) return;
    clearTimeout(el._timer);
    el.classList.add('is-leaving');
    setTimeout(function () { el.remove(); }, 230);
  }
  function toastLink(href) { return typeof href === 'string' && /^\/(?!\/)/.test(href) ? href : null; } // same-site paths only

  // type: success | error | warn | info. Text is inserted as text, never as HTML.
  function showToast(message, type, opts) {
    opts = opts || {};
    if (!message) return null;
    if (['success', 'error', 'warn', 'info'].indexOf(type) === -1) type = 'info';
    var duration = opts.duration || TOAST_MS;
    var stack = toastStack();
    while (stack.children.length >= TOAST_MAX) removeToast(stack.firstElementChild);

    var el = doc.createElement('div');
    el.className = 'toast toast-' + type;
    if (type === 'error') el.setAttribute('role', 'alert');
    el.style.setProperty('--toast-ms', duration + 'ms');
    var iconName = type === 'success' ? 'check' : (type === 'info' ? 'info' : 'alert');
    el.innerHTML = '<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-' + iconName + '"></use></svg>' +
      '<div class="toast-body"><p></p></div><button type="button" class="toast-close"></button>';
    el.querySelector('p').textContent = message;
    var close = el.querySelector('.toast-close');
    close.textContent = '\u00d7';
    close.setAttribute('aria-label', doc.body.getAttribute('data-close-label') || '');
    close.addEventListener('click', function () { dismissToast(el); });
    var href = toastLink(opts.href);
    if (href) {
      var link = doc.createElement('a');
      link.className = 'toast-link';
      link.href = href;
      link.textContent = opts.linkText || doc.body.getAttribute('data-open-label') || '';
      el.querySelector('.toast-body').appendChild(link);
    }
    stack.appendChild(el);

    // Goes away by itself, but not while the pointer or keyboard focus is on it.
    var remaining = duration;
    var startedAt = 0;
    function start() {
      clearTimeout(el._timer);
      startedAt = Date.now();
      el._timer = setTimeout(function () { dismissToast(el); }, remaining);
      el.classList.remove('is-paused');
    }
    function pause() {
      if (el.classList.contains('is-paused')) return;
      clearTimeout(el._timer);
      remaining = Math.max(800, remaining - (Date.now() - startedAt));
      el.classList.add('is-paused');
    }
    function resume() { if (!el.matches(':hover, :focus-within')) start(); }
    el.addEventListener('mouseenter', pause);
    el.addEventListener('mouseleave', resume);
    el.addEventListener('focusin', pause);
    el.addEventListener('focusout', resume);
    start();
    return el;
  }

  window.SafeFind = window.SafeFind || {};
  window.SafeFind.toast = {
    show: showToast,
    success: function (m, o) { return showToast(m, 'success', o); },
    error: function (m, o) { return showToast(m, 'error', o); },
    warn: function (m, o) { return showToast(m, 'warn', o); },
    info: function (m, o) { return showToast(m, 'info', o); }
  };

  // The flash banner from partials/flash.ejs stays in the page for visitors without JavaScript.
  function flashToToast() {
    doc.querySelectorAll('[data-flash]').forEach(function (banner) {
      var p = banner.querySelector('p');
      showToast(p ? p.textContent.trim() : '', banner.getAttribute('data-type'));
      var wrap = banner.parentElement;
      banner.remove();
      if (wrap && wrap.classList.contains('public-flash') && !wrap.children.length) wrap.remove();
    });
  }

  // ---- score bars (widths are set here because inline style attributes are blocked by our CSP)
  function paintBars() {
    doc.querySelectorAll('.bar[data-value]').forEach(function (bar) {
      var v = Math.max(0, Math.min(100, parseFloat(bar.getAttribute('data-value')) || 0));
      var fill = bar.firstElementChild;
      if (fill) fill.style.width = v + '%';
    });
  }

  function ready() { syncToggle(); paintBars(); flashToToast(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ready); else ready();
})();
