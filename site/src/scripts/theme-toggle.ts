const KEY = 'afg:theme';

export function effectiveTheme(): 'light' | 'dark' {
  const set = document.documentElement.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function initThemeToggle(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
  if (!button) return;
  const render = () => {
    const theme = effectiveTheme();
    button.textContent = theme === 'dark' ? 'light' : 'dark';
    button.setAttribute('aria-pressed', String(theme === 'dark'));
  };
  const announce = () => document.dispatchEvent(new CustomEvent('afg:themechange'));
  button.addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: the theme lasts for this page only.
    }
    render();
    announce();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    render();
    announce();
  });
  render();
}
