/* Apply the saved theme before first paint to prevent a white flash. */
(function () {
  try {
    var dark = localStorage.getItem('darkMode') === 'true';
    if (dark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.style.colorScheme = 'light';
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#16100c' : '#fdf8f3');
  } catch (e) {
    // Storage may be disabled; the page can continue with its default theme.
  }
})();
