import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEME_SCRIPT } from '../src/lib/theme-script.mjs';

export function cspFor(themeScript) {
  const hash = createHash('sha256').update(themeScript).digest('base64');
  return [
    "default-src 'self'",
    // 'wasm-unsafe-eval': Pagefind runs its search index as WebAssembly.
    `script-src 'self' 'sha256-${hash}' 'wasm-unsafe-eval'`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function buildSwaConfig(themeScript) {
  return {
    trailingSlash: 'always',
    responseOverrides: { 404: { rewrite: '/404.html' } },
    globalHeaders: {
      'Content-Security-Policy': cspFor(themeScript),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
    mimeTypes: {
      '.pagefind': 'application/octet-stream',
      '.pf_meta': 'application/octet-stream',
      '.pf_index': 'application/octet-stream',
      '.pf_fragment': 'application/octet-stream',
      '.wasm': 'application/wasm',
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = path.resolve('dist', 'staticwebapp.config.json');
  fs.writeFileSync(out, `${JSON.stringify(buildSwaConfig(THEME_SCRIPT), null, 2)}\n`);
  console.log(`wrote ${out}`);
}
