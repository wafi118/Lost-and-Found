/* Turns a long form into steps. Markup: form[data-wizard] with panels [data-step], an indicator list
   [data-wizard-steps], buttons [data-wizard-prev|next|submit] and an optional review [data-review].
   Every field stays in the page while you move between steps, so nothing typed is lost, and the
   form is submitted once at the end. Without this script the form is one long page. */
(function () {
  'use strict';

  var TEXT_LIKE = /^(text|email|tel|number|date|datetime-local|time|search|url)$/;

  function fill(template, values) {
    return String(template || '').replace(/\{(\w+)\}/g, function (m, k) { return values[k] !== undefined ? values[k] : m; });
  }
  function icon(name) {
    return '<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-' + name + '"></use></svg>';
  }

  function init(form) {
    var panels = Array.prototype.slice.call(form.querySelectorAll('[data-step]'));
    if (panels.length < 2) return;
    var list = form.querySelector('[data-wizard-steps]');
    var tabs = Array.prototype.slice.call(form.querySelectorAll('[data-step-indicator]'));
    var prevBtn = form.querySelector('[data-wizard-prev]');
    var nextBtn = form.querySelector('[data-wizard-next]');
    var submitBtn = form.querySelector('[data-wizard-submit]');
    var statusBox = form.querySelector('[data-wizard-status]');
    var review = form.querySelector('[data-review]');
    if (!prevBtn || !nextBtn || !submitBtn) return;

    var last = panels.length - 1;
    var current = 0;
    var furthest = 0;
    var done = {};
    var msg = function (name) { return form.getAttribute('data-msg-' + name) || ''; };

    // The "not in the future" limit printed into the page is the time the page was built. Moving it to the
    // current Bangladesh time (UTC+6, no daylight saving, as in utils/format.js) keeps a form that stays open
    // for a while from rejecting a time that is no longer in the future.
    function refreshLimits() {
      var now = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 16);
      form.querySelectorAll('input[type="datetime-local"][max]').forEach(function (el) { el.max = now; });
    }

    form.classList.add('is-wizard');
    if (list) list.hidden = false;

    function controls(panel) {
      return Array.prototype.slice.call(panel.querySelectorAll('input, select, textarea')).filter(function (el) { return !el.disabled && el.type !== 'file'; });
    }

    // ---- inline errors, drawn like the server's (field.ejs) so both look the same
    function boxOf(el) { return el.closest('.field') || el.parentElement; }
    function clearError(el) {
      var box = boxOf(el);
      if (!box) return;
      box.classList.remove('has-error');
      var old = box.querySelector('.error-text[data-client-error], .error-text[id^="e-"]');
      if (old && !old.hasAttribute('data-dz-error')) old.remove();
      el.removeAttribute('aria-invalid');
    }
    function showError(el, text) {
      clearError(el);
      var box = boxOf(el);
      var id = 'e-' + (el.name || el.id);
      var p = document.createElement('p');
      p.className = 'error-text';
      p.id = id;
      p.setAttribute('data-client-error', '');
      p.innerHTML = icon('alert') + '<span></span>';
      p.querySelector('span').textContent = text;
      box.appendChild(p);
      box.classList.add('has-error');
      el.setAttribute('aria-invalid', 'true');
      var described = (el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
      if (described.indexOf(id) === -1) described.push(id);
      el.setAttribute('aria-describedby', described.join(' '));
    }
    function problemWith(el) {
      var v = el.validity;
      if (v.valueMissing) return msg('required');
      if (v.tooShort) return fill(msg('too-short'), { n: el.getAttribute('minlength') });
      if (v.rangeOverflow) return msg('future');
      if (v.badInput || v.typeMismatch || v.patternMismatch || v.rangeUnderflow) return msg('invalid');
      return '';
    }
    // Checks one step. Shows every problem in it and returns the first field that has one.
    function checkStep(i) {
      var first = null;
      refreshLimits();
      controls(panels[i]).forEach(function (el) {
        var text = el.checkValidity() ? '' : problemWith(el);
        if (text) { showError(el, text); if (!first) first = el; }
      });
      return first;
    }
    // Typing in a field removes its message. The uploader shows and clears its own, so it is left alone.
    function onEdit(e) {
      var el = e.target;
      if (!el.hasAttribute || !el.hasAttribute('aria-invalid') || (el.closest && el.closest('[data-dropzone]'))) return;
      clearError(el);
    }
    form.addEventListener('input', onEdit);
    form.addEventListener('change', onEdit);
    form.addEventListener('sf:photo', function () { if (current === last) fillReview(); });

    // ---- the review in the last step
    function selectedText(el) { return el.options && el.selectedIndex > -1 ? el.options[el.selectedIndex].text : el.value; }
    function whenText(value) {
      var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '');
      if (!m) return value || '';
      var d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
      try { return new Intl.DateTimeFormat(document.documentElement.lang === 'bn' ? 'bn-BD' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(d); } catch (e) { return value; }
    }
    function fillReview() {
      if (!review) return;
      review.querySelectorAll('[data-sum]').forEach(function (dd) {
        var el = document.getElementById(dd.getAttribute('data-sum'));
        if (!el) return;
        dd.textContent = el.type === 'datetime-local' ? whenText(el.value) : selectedText(el);
      });
      review.querySelectorAll('[data-sum-radio]').forEach(function (dd) {
        var on = form.querySelector('input[name="' + dd.getAttribute('data-sum-radio') + '"]:checked');
        var label = on && form.querySelector('label[for="' + on.id + '"]');
        dd.textContent = label && label.firstChild ? label.firstChild.textContent.trim() : '';
      });
      review.querySelectorAll('[data-sum-file]').forEach(function (dd) {
        var file = document.getElementById(dd.getAttribute('data-sum-file'));
        dd.textContent = file && file.files && file.files[0] ? file.files[0].name : dd.getAttribute('data-empty');
      });
    }

    // ---- showing a step
    function render(moveFocus) {
      furthest = Math.max(furthest, current);
      panels.forEach(function (panel, i) {
        panel.hidden = i !== current;
        panel.classList.toggle('is-entering', !!moveFocus && i === current);
      });
      tabs.forEach(function (tab, i) {
        tab.classList.toggle('is-active', i === current);
        tab.classList.toggle('is-done', i !== current && !!done[i]);
        var btn = tab.querySelector('button');
        if (btn) {
          if (i === current) btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
          btn.disabled = i > furthest;
        }
      });
      prevBtn.hidden = current === 0;
      nextBtn.hidden = current === last;
      submitBtn.hidden = current !== last;
      if (review) { review.hidden = current !== last; if (current === last) fillReview(); }
      if (statusBox) {
        statusBox.textContent = fill(statusBox.getAttribute('data-template') || '{n}/{total} {title}', { n: current + 1, total: panels.length, title: panels[current].getAttribute('data-title') || '' });
      }
      if (moveFocus) {
        var heading = panels[current].querySelector('[data-step-heading]');
        if (heading) heading.focus({ preventScroll: true });
        var top = form.getBoundingClientRect().top;
        if (top < 0) window.scrollTo({ top: window.scrollY + top - 16, behavior: 'smooth' });
      }
    }

    // Moves to a step. Going forward checks every step it passes, so nothing is skipped.
    function goTo(target) {
      target = Math.max(0, Math.min(target, last));
      if (target > current) {
        for (var i = current; i < target; i += 1) {
          var bad = checkStep(i);
          if (bad) { current = i; render(false); bad.focus(); return; }
          done[i] = true;
        }
      }
      current = target;
      render(true);
    }

    nextBtn.addEventListener('click', function () { goTo(current + 1); });
    prevBtn.addEventListener('click', function () { goTo(current - 1); });
    tabs.forEach(function (tab, i) {
      var btn = tab.querySelector('button');
      if (btn) btn.addEventListener('click', function () { if (i <= furthest) goTo(i); });
    });

    // Enter inside a text box means "next step", not "send the half-finished form".
    form.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || current === last) return;
      if (e.target.tagName === 'INPUT' && TEXT_LIKE.test(e.target.type)) { e.preventDefault(); goTo(current + 1); }
    });

    // The final submit checks everything once more and jumps to the first step with a problem.
    // site.js disables the submit button after a valid submit, so a double click sends one request.
    form.addEventListener('submit', function (e) {
      for (var i = 0; i <= last; i += 1) {
        var bad = checkStep(i);
        if (bad) { e.preventDefault(); current = i; render(true); bad.focus(); return; }
      }
    });

    // Server said something is wrong (the form came back): open that step with earlier ones counted as done.
    var start = Math.max(1, Math.min(parseInt(form.getAttribute('data-start-step'), 10) || 1, panels.length)) - 1;
    for (var s = 0; s < start; s += 1) done[s] = true;
    current = start;
    render(false);
    var firstServerError = form.querySelector('.has-error input, .has-error select, .has-error textarea');
    if (firstServerError && !firstServerError.closest('[hidden]')) firstServerError.focus();
  }

  function ready() { document.querySelectorAll('form[data-wizard]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
