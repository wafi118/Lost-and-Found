/* Home page only. Two small things: the four-step panel and the highlight in the header while scrolling.
   Without this script the four steps are listed one after another and everything still reads. */
(function () {
  'use strict';
  var doc = document;

  var wrap = doc.querySelector('[data-steps]');
  if (wrap) {
    var tabs = [].slice.call(wrap.querySelectorAll('[role="tab"]'));
    var panels = tabs.map(function (t) { return doc.getElementById(t.getAttribute('aria-controls')); });
    var pick = function (i, focus) {
      tabs.forEach(function (t, j) {
        t.setAttribute('aria-selected', j === i ? 'true' : 'false');
        t.tabIndex = j === i ? 0 : -1;
        t.classList.toggle('is-done', j < i);
        if (panels[j]) panels[j].classList.toggle('is-active', j === i);
      });
      if (focus) tabs[i].focus();
    };
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { pick(i); });
      t.addEventListener('keydown', function (e) {
        var n;
        if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') n = (i + tabs.length - 1) % tabs.length;
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = tabs.length - 1;
        else return;
        e.preventDefault();
        pick(n, true);
      });
    });
    pick(0);
  }

  var links = [].slice.call(doc.querySelectorAll('.nav-links a[data-spy]'));
  var sections = links.map(function (a) { return doc.getElementById(a.getAttribute('data-spy')); });
  var bar = doc.querySelector('.read-progress i');
  var queued = false;
  function update() {
    queued = false;
    var y = window.scrollY + 150;
    var current = -1;
    sections.forEach(function (s, i) { if (s && y >= s.getBoundingClientRect().top + window.scrollY) current = i; });
    if (window.innerHeight + window.scrollY >= doc.documentElement.scrollHeight - 4) current = links.length - 1;
    links.forEach(function (a, i) {
      if (i === current) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
    });
    if (bar) {
      var h = doc.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, window.scrollY / h) : 0).toFixed(3) + ')';
    }
  }
  function queue() { if (!queued) { queued = true; window.requestAnimationFrame(update); } }
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  update();
})();
