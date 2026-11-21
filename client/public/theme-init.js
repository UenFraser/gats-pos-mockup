// Runs before the page is drawn so a dark-theme user never sees a white flash. Keep the names in sync with src/lib/theme.js.
(function () {
  try {
    document.documentElement.setAttribute('data-theme', localStorage.getItem('gats_theme_device') === 'dark' ? 'luxury' : 'gats');
  } catch (e) { /* no storage: the default theme in index.html stays */ }
})();
