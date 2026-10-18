/* Photo uploader: drag and drop or choose a file, instant preview, remove button.
   The checks here are a convenience. The server checks the file's real content and size again.
   Messages come from data-msg-* attributes on [data-dropzone], so they follow the page language. */
(function () {
  'use strict';

  function fmtSize(bytes) {
    return bytes < 1048576 ? Math.max(1, Math.round(bytes / 1024)) + ' KB' : (bytes / 1048576).toFixed(1) + ' MB';
  }
  function fill(template, values) {
    return String(template || '').replace(/\{(\w+)\}/g, function (m, k) { return values[k] !== undefined ? values[k] : m; });
  }
  function dragHasFiles(e) {
    return !!e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1;
  }

  function init(root) {
    var input = root.querySelector('input[type="file"]');
    var area = root.querySelector('.dropzone-area');
    var preview = root.querySelector('[data-dz-preview]');
    var img = root.querySelector('[data-dz-img]');
    var nameEl = root.querySelector('[data-dz-name]');
    var sizeEl = root.querySelector('[data-dz-size]');
    var removeBtn = root.querySelector('[data-dz-remove]');
    var errorBox = root.querySelector('[data-dz-error]');
    if (!input || !area || !preview || !img || !errorBox) return;

    var maxBytes = parseInt(root.getAttribute('data-max-bytes'), 10) || 3 * 1048576;
    var types = (root.getAttribute('data-types') || 'image/jpeg,image/png,image/webp').split(',');
    var msg = function (name) { return root.getAttribute('data-msg-' + name) || ''; };
    var objectUrl = null;
    function notify(name) { root.dispatchEvent(new CustomEvent('sf:photo', { bubbles: true, detail: { name: name } })); }

    function showError(text) {
      errorBox.querySelector('span').textContent = text || '';
      errorBox.hidden = !text;
      root.classList.toggle('has-error', !!text);
      if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    }
    function clearPreview() {
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
      img.removeAttribute('src');
      preview.hidden = true;
      area.hidden = false;
    }
    function discard() { clearPreview(); input.value = ''; notify(''); }
    function problemWith(file) {
      if (types.indexOf(file.type) === -1) return msg('type');
      if (file.size > maxBytes) return fill(msg('size'), { size: fmtSize(file.size), max: fmtSize(maxBytes) });
      return '';
    }
    function accept(file) {
      var problem = problemWith(file);
      if (problem) { discard(); showError(problem); return; }
      showError('');
      clearPreview();
      objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;
      nameEl.textContent = file.name;
      sizeEl.textContent = fmtSize(file.size);
      area.hidden = true;
      preview.hidden = false;
      notify(file.name);
    }
    // A dropped file is put into the real input, so the normal form submit uploads it.
    function attach(file) {
      try {
        var transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        return true;
      } catch (e) { return false; }
    }

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (file) accept(file); else { clearPreview(); showError(''); }
    });
    img.addEventListener('error', function () {
      if (!img.getAttribute('src')) return;
      discard();
      showError(msg('read'));
    });
    removeBtn.addEventListener('click', function () {
      discard();
      showError('');
      input.focus();
    });

    var depth = 0; // dragenter and dragleave also fire for child elements, so they are counted
    root.addEventListener('dragenter', function (e) {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      depth += 1;
      root.classList.add('is-dragover');
    });
    root.addEventListener('dragover', function (e) {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    root.addEventListener('dragleave', function () {
      depth = Math.max(0, depth - 1);
      if (!depth) root.classList.remove('is-dragover');
    });
    root.addEventListener('drop', function (e) {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      root.classList.remove('is-dragover');
      var files = e.dataTransfer.files;
      if (!files || !files.length) return;
      var file = files[0];
      var problem = problemWith(file);
      if (problem) { discard(); showError(problem); return; }
      if (!attach(file)) { showError(msg('nodnd')); return; }
      accept(file);
      if (files.length > 1) showError(msg('multi'));
    });
  }

  function ready() {
    var zones = document.querySelectorAll('[data-dropzone]');
    zones.forEach(init);
    if (!zones.length) return;
    // A file dropped outside the box would make the browser open it and throw the form away.
    ['dragover', 'drop'].forEach(function (type) {
      window.addEventListener(type, function (e) {
        var inside = e.target && e.target.closest && e.target.closest('[data-dropzone]');
        if (dragHasFiles(e) && !inside) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'; }
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
