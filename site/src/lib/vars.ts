export type Token = { type: 'text'; value: string } | { type: 'var'; name: string; raw: string };

const VAR_RE = /\$\{([A-Z][A-Z0-9_]+)\}|\$([A-Z][A-Z0-9_]+)/g;
const SECRET_RE = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/;

export const SHELL_BUILTINS: ReadonlySet<string> = new Set(['HOME', 'PATH', 'USER', 'PWD', 'SHELL']);

/** Split text into plain text and `$NAME` / `${NAME}` variable references. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const match of text.matchAll(VAR_RE)) {
    const name = match[1] ?? match[2];
    if (SHELL_BUILTINS.has(name)) continue;
    const start = match.index ?? 0;
    if (start > last) tokens.push({ type: 'text', value: text.slice(last, start) });
    tokens.push({ type: 'var', name, raw: match[0] });
    last = start + match[0].length;
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) });
  return tokens;
}

export function isSecret(name: string): boolean {
  return SECRET_RE.test(name);
}

/** What a variable shows in code: the reader's value, or the original text for blanks and secrets. */
export function displayValue(name: string, raw: string, values: Record<string, string>): string {
  const value = values[name];
  if (isSecret(name) || !value || !value.trim()) return raw;
  return value;
}

export function varsInText(text: string): string[] {
  const names: string[] = [];
  for (const token of tokenize(text)) {
    if (token.type === 'var' && !names.includes(token.name)) names.push(token.name);
  }
  return names;
}
