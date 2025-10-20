// Theme toggle for Nicole's Snake.io (remembers choice)
(() => {
  const KEY = 'snake_theme';
  const select = document.getElementById('themeSelect');
  const body = document.body;

  // Restore saved theme
  const saved = localStorage.getItem('snake_theme');
  if (saved) body.className = saved;

  // Ensure select shows current theme
  const current = body.className || 'theme-blueberry';
  if ([...select.options].some(o => o.value === current)) {
    select.value = current;
  }

  select.addEventListener('change', () => {
    body.className = select.value;
    localStorage.setItem('snake_theme', select.value);
  });
})();