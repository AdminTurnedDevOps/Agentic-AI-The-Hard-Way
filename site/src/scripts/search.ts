interface PagefindResultData {
  url: string;
  excerpt: string;
  meta: { title?: string };
}
interface Pagefind {
  search(term: string): Promise<{ results: Array<{ data(): Promise<PagefindResultData> }> }>;
}

let pagefind: Promise<Pagefind> | null = null;
function loadPagefind(): Promise<Pagefind> {
  const url = '/pagefind/pagefind.js';
  pagefind ??= import(/* @vite-ignore */ url) as Promise<Pagefind>;
  return pagefind;
}

/** Pagefind excerpts are HTML with <mark>; copy only text and <mark>, never raw HTML. */
function appendExcerpt(target: HTMLElement, excerpt: string): void {
  const parsed = new DOMParser().parseFromString(`<p>${excerpt}</p>`, 'text/html').body.firstElementChild;
  for (const node of parsed?.childNodes ?? []) {
    if (node.nodeName === 'MARK') {
      const mark = document.createElement('mark');
      mark.textContent = node.textContent;
      target.append(mark);
    } else {
      target.append(document.createTextNode(node.textContent ?? ''));
    }
  }
}

export function initSearch(): void {
  const root = document.querySelector<HTMLElement>('[data-search]');
  const input = root?.querySelector<HTMLInputElement>('[data-search-input]');
  const list = root?.querySelector<HTMLUListElement>('[data-search-results]');
  if (!root || !input || !list) return;

  let timer: number | undefined;
  let sequence = 0;
  const show = (items: HTMLElement[]) => {
    list.replaceChildren(...items);
    list.hidden = items.length === 0;
  };
  const message = (text: string) => {
    const li = document.createElement('li');
    li.className = 'search-msg';
    li.textContent = text;
    show([li]);
  };

  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    const term = input.value.trim();
    if (!term) {
      show([]);
      return;
    }
    timer = window.setTimeout(async () => {
      const mine = ++sequence;
      if (import.meta.env.DEV) {
        message('Search works after a build: npm run build && npm run preview');
        return;
      }
      try {
        const results = await (await loadPagefind()).search(term);
        const data = await Promise.all(results.results.slice(0, 8).map((r) => r.data()));
        if (mine !== sequence) return;
        if (data.length === 0) {
          message(`No labs match "${term}".`);
          return;
        }
        show(
          data.map((d) => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = d.url;
            const title = document.createElement('strong');
            title.textContent = d.meta.title ?? d.url;
            const excerpt = document.createElement('span');
            excerpt.className = 'search-excerpt';
            appendExcerpt(excerpt, d.excerpt);
            a.append(title, excerpt);
            li.append(a);
            return li;
          }),
        );
      } catch {
        if (mine === sequence) message('Search is unavailable right now.');
      }
    }, 150);
  });

  document.addEventListener('keydown', (event) => {
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if (event.key === '/' && !typing) {
      event.preventDefault();
      input.focus();
    }
    if (event.key === 'Escape' && document.activeElement === input) {
      show([]);
      input.blur();
    }
  });
}
