export function initToolbar() {
  window.setTheme = function (theme) {
    const widget = document.getElementById('widget');
    widget.setAttribute('theme', theme);

    document.body.classList.toggle('dark', theme === 'dark');

    document.getElementById('btn-light').classList.toggle('active', theme === 'light');
    document.getElementById('btn-dark').classList.toggle('active', theme === 'dark');
  };

  window.toggleBrand = function () {
    const widget = document.getElementById('widget');
    const btn = document.getElementById('btn-brand');
    widget.classList.toggle('brand-theme');
    btn.classList.toggle('active');
  };
}
