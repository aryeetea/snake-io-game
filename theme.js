// Theme toggle for Nicole's Snake.io (remembers choice)
(() => {
  const KEY = 'snake_theme';
  const select = document.getElementById('themeSelect');
  const body = document.body;

  // Set initial theme from storage (fallback: blueberry)
  const saved = localStorage.getItem(KEY) || 'theme-blueberry';
  body.classList.remove('theme-blueberry', 'theme-butterscotch');
  body.classList.add(saved);
  if (select) select.value = saved;

  // Handle changes
  if (select) {
    select.addEventListener('change', () => {
      const theme = select.value;
      body.classList.remove('theme-blueberry', 'theme-butterscotch');
      body.classList.add(theme);
      localStorage.setItem(KEY, theme);
    });
  }
})();