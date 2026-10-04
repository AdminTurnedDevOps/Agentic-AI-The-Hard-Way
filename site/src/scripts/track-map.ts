import rough from 'roughjs';

export function initTrackMap(): void {
  for (const box of document.querySelectorAll<HTMLElement>('[data-box-href]')) {
    box.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('a')) return;
      window.location.href = box.dataset.boxHref ?? '/';
    });
  }

  const svg = document.querySelector<SVGSVGElement>('svg[data-rough-arrow]');
  if (!svg) return;
  const draw = () => {
    const stroke = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#1e1e1e';
    const rc = rough.svg(svg);
    const options = { stroke, strokeWidth: 2, roughness: 1.4, seed: 7 };
    svg.replaceChildren(rc.line(4, 20, 54, 20, options), rc.line(54, 20, 44, 11, options), rc.line(54, 20, 44, 29, options));
  };
  draw();
  document.addEventListener('afg:themechange', draw);
}
