/* Shows the approval note when the chosen category needs the authorized approver (lost items only).
   The server decides this again on submit; the note is only a heads-up. */
(function () {
  'use strict';
  var form = document.querySelector('[data-report-form]');
  var hint = document.getElementById('approval-hint');
  var select = document.getElementById('f-categoryId');
  if (!form || !hint || !select) return;

  function update() {
    var checked = form.querySelector('input[name="type"]:checked');
    var option = select.options[select.selectedIndex];
    hint.hidden = !(checked && checked.value === 'lost' && option && option.hasAttribute('data-approval'));
  }
  form.addEventListener('change', update);
  update();
})();
