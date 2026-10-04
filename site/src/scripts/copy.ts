export function initCopyButtons(): void {
  for (const figure of document.querySelectorAll<HTMLElement>('figure.code')) {
    const code = figure.querySelector('code');
    if (!code) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-btn sk';
    button.textContent = 'copy';
    button.setAttribute('aria-label', 'Copy code');
    button.addEventListener('click', async () => {
      try {
        // textContent includes the reader's filled-in values; secrets and blanks stay as $VAR.
        await navigator.clipboard.writeText(code.textContent ?? '');
        button.textContent = 'copied';
        button.classList.add('is-done');
      } catch {
        button.textContent = 'select and copy';
      }
      window.setTimeout(() => {
        button.textContent = 'copy';
        button.classList.remove('is-done');
      }, 1500);
    });
    figure.prepend(button);
  }
}
