/** Make each screenshot open at full size. */
export function initImageLinks(): void {
  for (const img of document.querySelectorAll<HTMLImageElement>('.prose img')) {
    if (img.closest('a')) continue;
    const link = document.createElement('a');
    link.href = img.currentSrc || img.src;
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('aria-label', `${img.alt || 'Screenshot'} (open full size)`);
    img.replaceWith(link);
    link.append(img);
  }
}
