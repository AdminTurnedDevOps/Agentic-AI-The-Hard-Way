import { tokenize } from './vars';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Render a code block as HTML. Variables become spans the client fills in. */
export function renderCodeBlock(code: string, lang?: string | null, title?: string): string {
  const body = tokenize(code)
    .map((token) =>
      token.type === 'text'
        ? escapeHtml(token.value)
        : `<span class="var" data-var="${token.name}" data-raw="${escapeHtml(token.raw)}">${escapeHtml(token.raw)}</span>`,
    )
    .join('');
  const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
  const caption = title ? `<figcaption class="code-title">${escapeHtml(title)}</figcaption>` : '';
  return `<figure class="code"${langAttr}>${caption}<pre><code>${body}</code></pre></figure>`;
}
