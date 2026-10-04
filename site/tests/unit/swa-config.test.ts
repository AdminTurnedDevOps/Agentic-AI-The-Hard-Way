import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildSwaConfig, cspFor } from '../../scripts/write-swa-config.mjs';
import { THEME_SCRIPT } from '../../src/lib/theme-script.mjs';

describe('SWA config', () => {
  it('allows the theme script by hash and nothing inline', () => {
    const hash = createHash('sha256').update(THEME_SCRIPT).digest('base64');
    const csp = cspFor(THEME_SCRIPT);
    expect(csp).toContain(`script-src 'self' 'sha256-${hash}' 'wasm-unsafe-eval'`);
    expect(csp).toContain("style-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).toContain("frame-ancestors 'none'");
  });
  it('sets security headers, 404 rewrite and Pagefind MIME types', () => {
    const config = buildSwaConfig(THEME_SCRIPT);
    expect(config.globalHeaders['X-Content-Type-Options']).toBe('nosniff');
    expect(config.globalHeaders['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(config.responseOverrides['404'].rewrite).toBe('/404.html');
    expect(config.mimeTypes['.pf_fragment']).toBe('application/octet-stream');
    expect(config.mimeTypes['.wasm']).toBe('application/wasm');
  });
});
