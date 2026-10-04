/** The lab list is a disclosure on narrow screens and always open on wide ones. */
export function initSideMenu(): void {
  const menu = document.querySelector<HTMLDetailsElement>('[data-side-menu]');
  if (!menu) return;
  const narrow = matchMedia('(max-width: 1000px)');
  const sync = () => {
    menu.open = !narrow.matches;
  };
  narrow.addEventListener('change', sync);
  sync();
}
