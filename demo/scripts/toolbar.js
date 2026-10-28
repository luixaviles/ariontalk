// Theme choice lasts for the browser tab; every new visit starts light.
const THEME_KEY = 'ariontalk-demo-theme';

function readTheme() {
  try {
    return sessionStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(theme) {
  const dark = theme === 'dark';
  document.body.classList.toggle('dark', dark);

  const widget = document.getElementById('widget');
  if (widget) widget.setAttribute('theme', theme);

  const btn = document.getElementById('btn-theme');
  if (btn) {
    const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }
}

export function initToolbar() {
  // Clean mode hides toolbar and settings gear for recordings and screenshots
  if (new URLSearchParams(location.search).has('clean')) {
    document.body.classList.add('clean');
    const widget = document.getElementById('widget');
    if (widget) {
      widget.removeAttribute('settings');
    }
  }

  applyTheme(readTheme());

  const btn = document.getElementById('btn-theme');
  if (btn) {
    btn.addEventListener('click', () => {
      const next = document.body.classList.contains('dark') ? 'light' : 'dark';
      try {
        sessionStorage.setItem(THEME_KEY, next);
      } catch {
        // Storage can be blocked; the toggle still works for this page.
      }
      applyTheme(next);
    });
  }
}
