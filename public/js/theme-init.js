/* Runs in <head> before the page is painted, so the chosen theme is applied without a flash. */
(function () {
  var theme = null;
  try { theme = localStorage.getItem('sf-theme'); } catch (e) { /* storage blocked: fall through */ }
  if (theme !== 'dark' && theme !== 'light') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.classList.add('js'); // lets the stylesheet hide the flash banner that site.js turns into a toast
})();
