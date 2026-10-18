/* Live alerts. The server pushes each new notification to the person's open pages; here it becomes a
   toast and the bell badge is updated. Loaded only for signed-in people, after /socket.io/socket.io.js.
   If the connection fails nothing is lost: the notification is also stored, and the bell and the
   notifications page show it on the next visit. */
(function () {
  'use strict';
  if (typeof window.io !== 'function' || !window.SafeFind || !window.SafeFind.toast) return;

  var socket = window.io({ transports: ['websocket'] });

  function language() { return document.documentElement.lang === 'bn' ? 'bn' : 'en'; }

  function updateBadge(unread) {
    if (typeof unread !== 'number') return;
    var text = unread > 9 ? '9+' : String(unread);
    var bell = document.querySelector('a.icon-btn[href="/notifications"]');
    if (bell) {
      var dot = bell.querySelector('.dot-count');
      if (!dot && unread > 0) {
        dot = document.createElement('span');
        dot.className = 'dot-count';
        dot.setAttribute('aria-hidden', 'true');
        bell.appendChild(dot);
      }
      if (dot) { dot.textContent = text; dot.hidden = unread === 0; }
    }
    var link = document.querySelector('.side-link[href="/notifications"]');
    if (link) {
      var chip = link.querySelector('.chip');
      if (!chip && unread > 0) {
        chip = document.createElement('span');
        chip.className = 'chip chip-red';
        link.appendChild(chip);
      }
      if (chip) {
        chip.textContent = String(unread);
        chip.setAttribute('aria-label', (document.body.getAttribute('data-unread-label') || '{n}').replace('{n}', unread));
        chip.hidden = unread === 0;
      }
    }
  }

  socket.on('notification', function (n) {
    if (!n || !n.message) return;
    var text = n.message[language()] || n.message.en;
    window.SafeFind.toast.show(text, n.tone, { href: n.link, duration: 7000 });
    updateBadge(n.unread);
    document.dispatchEvent(new CustomEvent('sf:notification', { detail: n }));
  });

  // Signed out or suspended: stop trying instead of reconnecting forever.
  socket.on('connect_error', function (err) { if (err && err.message === 'unauthorized') socket.close(); });
})();
