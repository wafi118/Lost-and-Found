/* Camera scanner for the handover desk. It only reads a QR code and fills the lookup form; the
   server checks the signed token, so nothing is trusted because the browser read it. */
(function () {
  'use strict';
  var root = document.querySelector('[data-scanner]');
  var startBtn = document.querySelector('[data-scanner-start]');
  var stopBtn = document.querySelector('[data-scanner-stop]');
  var input = document.getElementById('f-code');
  if (!root || !startBtn || !input || !input.form) return;

  var video = root.querySelector('video');
  var msg = root.querySelector('[data-scanner-msg]');
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d', { willReadFrequently: true });
  var stream = null;
  var frame = 0;

  function say(text) { msg.textContent = text || ''; msg.hidden = !text; }

  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
    video.srcObject = null;
    root.hidden = true;
    startBtn.hidden = false;
    stopBtn.hidden = true;
  }

  function tick() {
    if (!stream) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA && window.jsQR) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var found = window.jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
      if (found && found.data) {
        input.value = found.data;
        stop();
        input.form.submit();
        return;
      }
    }
    frame = requestAnimationFrame(tick);
  }

  function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { root.hidden = false; say(root.getAttribute('data-msg-unsupported')); return; }
    root.hidden = false;
    startBtn.hidden = true;
    stopBtn.hidden = false;
    say(root.getAttribute('data-msg-starting'));
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(function (s) { stream = s; video.srcObject = s; return video.play(); })
      .then(function () { say(''); frame = requestAnimationFrame(tick); })
      .catch(function () { stop(); root.hidden = false; say(root.getAttribute('data-msg-denied')); startBtn.hidden = false; });
  }

  // The button is hidden in the markup, so people without JavaScript only see the code field.
  startBtn.hidden = false;
  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stop);
  window.addEventListener('pagehide', stop);
})();
