import { displayValue, isSecret } from '../lib/vars';
import { clearValues, loadValues, saveValue } from './var-store';

export function initVarPanel(): void {
  const panel = document.querySelector<HTMLElement>('[data-var-panel]');
  const list = panel?.querySelector<HTMLElement>('[data-var-list]');
  const spans = [...document.querySelectorAll<HTMLElement>('.var[data-var]')];
  if (!panel || !list || spans.length === 0) return;

  let values = loadValues();
  const apply = () => {
    for (const span of spans) {
      const raw = span.dataset.raw ?? '';
      const shown = displayValue(span.dataset.var ?? '', raw, values);
      span.textContent = shown; // textContent, never innerHTML: pasted values stay literal text
      span.classList.toggle('is-set', shown !== raw);
    }
  };

  for (const name of [...new Set(spans.map((s) => s.dataset.var ?? ''))]) {
    const row = document.createElement('div');
    row.className = 'var-row';
    const label = document.createElement('label');
    label.textContent = name;
    if (isSecret(name)) {
      const note = document.createElement('p');
      note.className = 'var-secret';
      note.textContent = 'Set this in your shell. Never stored here.';
      row.append(label, note);
    } else {
      const input = document.createElement('input');
      input.id = `var-${name}`;
      input.type = 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.value = values[name] ?? '';
      label.htmlFor = input.id;
      input.addEventListener('input', () => {
        values = saveValue(name, input.value);
        apply();
      });
      row.append(label, input);
    }
    list.append(row);
  }

  panel.querySelector('[data-var-clear]')?.addEventListener('click', (event) => {
    event.preventDefault();
    values = clearValues();
    list.querySelectorAll('input').forEach((input) => (input.value = ''));
    apply();
  });

  // On narrow screens, put the note just above the first code block instead of after the article.
  const firstCode = document.querySelector('.prose figure.code');
  if (firstCode && matchMedia('(max-width: 1000px)').matches) {
    firstCode.before(panel);
    const aside = document.querySelector<HTMLElement>('.lab-aside');
    if (aside) aside.hidden = true;
  }
  panel.hidden = false;
  apply();
}
