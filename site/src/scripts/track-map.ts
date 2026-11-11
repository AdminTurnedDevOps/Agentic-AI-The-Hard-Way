import rough from 'roughjs';

const round = (n: number) => Math.round(n * 10) / 10;

export function initTrackMap(): void {
  for (const box of document.querySelectorAll<HTMLElement>('[data-box-href]')) {
    box.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('a')) return;
      window.location.href = box.dataset.boxHref ?? '/';
    });
  }

  const svg = document.querySelector<SVGSVGElement>('svg[data-rough-arrow]');
  const flow = svg?.closest<HTMLElement>('.flow');
  if (!svg || !flow) return;
  // Below this width the flow is one column and the arrow points down (see global.css).
  const stacked = matchMedia('(max-width: 1000px)');

  const draw = () => {
    const stroke = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#1e1e1e';
    const rc = rough.svg(svg);
    const options = { stroke, strokeWidth: 2, roughness: 1.4, seed: 7 };
    const head = (x: number, y: number) => [rc.line(x, y, x - 10, y - 9, options), rc.line(x, y, x - 10, y + 9, options)];

    const frame = svg.getBoundingClientRect();
    const targets = svg.dataset.roughArrow === 'fork' && !stacked.matches ? [...flow.querySelectorAll<HTMLElement>('[data-arrow-target]')] : [];
    if (targets.length < 2 || frame.height === 0) {
      svg.setAttribute('viewBox', '0 0 60 40');
      svg.replaceChildren(rc.line(4, 20, 54, 20, options), ...head(54, 20));
      return;
    }

    // One branch per target, from the middle of "Start here" to the middle of each card. The viewBox is
    // the SVG's own pixel size, so strokes keep their weight however tall the cards are.
    const start = flow.querySelector<HTMLElement>('.start')?.getBoundingClientRect();
    const fromY = round(start ? start.top + start.height / 2 - frame.top : frame.height / 2);
    const tipX = round(frame.width - 6);
    svg.setAttribute('viewBox', `0 0 ${round(frame.width)} ${round(frame.height)}`);
    svg.replaceChildren(
      ...targets.flatMap((target) => {
        const rect = target.getBoundingClientRect();
        const y = round(rect.top + rect.height / 2 - frame.top);
        const curve = `M4 ${fromY} C ${round(frame.width * 0.55)} ${fromY}, ${round(frame.width * 0.4)} ${y}, ${tipX} ${y}`;
        return [rc.path(curve, options), ...head(tipX, y)];
      }),
    );
  };

  draw();
  document.addEventListener('afg:themechange', draw);
  // Card heights change with the viewport and when the web fonts load.
  new ResizeObserver(draw).observe(flow);
}
