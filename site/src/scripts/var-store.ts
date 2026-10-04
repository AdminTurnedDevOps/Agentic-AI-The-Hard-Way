import { isSecret } from '../lib/vars';

const KEY = 'afg:vars';
let memory: Record<string, string> = {};

function read(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return { ...memory };
  }
}

function write(values: Record<string, string>): void {
  memory = { ...values };
  try {
    localStorage.setItem(KEY, JSON.stringify(values));
  } catch {
    // Storage blocked: values live in memory for this page session.
  }
}

/** Saved values, minus anything that looks like a secret (even if an older build or a user stored one). */
export function loadValues(): Record<string, string> {
  const values = read();
  for (const name of Object.keys(values)) {
    if (isSecret(name) || typeof values[name] !== 'string') delete values[name];
  }
  memory = { ...values };
  return values;
}

export function saveValue(name: string, value: string): Record<string, string> {
  const values = loadValues();
  if (isSecret(name)) return values;
  if (value.trim()) values[name] = value;
  else delete values[name];
  write(values);
  return values;
}

export function clearValues(): Record<string, string> {
  write({});
  return {};
}
