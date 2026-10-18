/* Live filtering without a page reload. A form with data-live-filter="#results" asks the same URL
   for just the results list (?partial=1) and swaps it in. The page URL is updated, so a filtered
   view can be shared or reloaded; with JavaScript off the form still works as a normal GET form.
   The list is rendered by the server, so every value in it is already escaped. */
(function () {
  'use strict';

  var DEBOUNCE_MS = 300;

  function init(form) {
    var target = document.querySelector(form.getAttribute('data-live-filter'));
    if (!target) return;
    var statusBox = form.querySelector('[data-live-status]');
    var timer = null;
    var controller = null;
    var seq = 0;
    var numberFormat = null;
    try { numberFormat = new Intl.NumberFormat(document.documentElement.lang === 'bn' ? 'bn-BD' : 'en-GB'); } catch (e) { /* plain numbers */ }

    function params() {
      var p = new URLSearchParams();
      new FormData(form).forEach(function (value, key) {
        var v = String(value).trim();
        if (v) p.set(key, v);
      });
      return p;
    }

    function announce() {
      var marker = target.querySelector('[data-count]');
      if (!statusBox || !marker) return;
      var n = parseInt(marker.getAttribute('data-count'), 10) || 0;
      statusBox.textContent = (form.getAttribute('data-msg-count') || '{n}').replace('{n}', numberFormat ? numberFormat.format(n) : n);
    }

    function run() {
      var p = params();
      var query = p.toString();
      history.replaceState(null, '', location.pathname + (query ? '?' + query : '')); // shareable, and no extra Back step

      if (controller) controller.abort(); // an older request is no longer wanted
      controller = new AbortController();
      var mine = ++seq;
      target.setAttribute('aria-busy', 'true');
      target.classList.add('is-loading');
      p.set('partial', '1');

      fetch((form.getAttribute('action') || location.pathname) + '?' + p.toString(), {
        headers: { 'X-Requested-With': 'fetch', Accept: 'text/html' },
        credentials: 'same-origin',
        signal: controller.signal
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      }).then(function (html) {
        if (mine !== seq) return; // a newer request has taken over
        target.innerHTML = html;
        announce();
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        if (window.SafeFind && window.SafeFind.toast) window.SafeFind.toast.error(form.getAttribute('data-msg-error') || '');
      }).then(function () {
        if (mine === seq) { target.setAttribute('aria-busy', 'false'); target.classList.remove('is-loading'); }
      });
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); clearTimeout(timer); run(); });
    form.addEventListener('input', function (e) {
      if (e.target.matches('input[type="search"], input[type="text"]')) { clearTimeout(timer); timer = setTimeout(run, DEBOUNCE_MS); }
    });
    form.addEventListener('change', function (e) {
      if (e.target.matches('select')) { clearTimeout(timer); run(); }
    });
    // "Clear filters" button inside an empty result.
    document.addEventListener('click', function (e) {
      var reset = e.target.closest ? e.target.closest('[data-live-reset]') : null;
      if (!reset || !target.contains(reset)) return;
      e.preventDefault();
      form.querySelectorAll('input[type="search"], input[type="text"]').forEach(function (el) { el.value = ''; });
      form.querySelectorAll('select').forEach(function (el) { el.selectedIndex = 0; });
      clearTimeout(timer);
      run();
    });
  }

  function ready() { document.querySelectorAll('form[data-live-filter]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
