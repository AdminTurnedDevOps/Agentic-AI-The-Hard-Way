import type { Page } from '@playwright/test';
import { cspFor } from '../../scripts/write-swa-config.mjs';
import { THEME_SCRIPT } from '../../src/lib/theme-script.mjs';

export const GATEWAY_LAB = '/platform-engineering-assistant/gateway-creation-update-modelconfig/';
export const PROMPT_GUARD = '/platform-engineering-assistant/prompt-guard/';

/** `astro preview` doesn't send SWA headers, so add the production CSP to every HTML response. */
export async function withProductionCsp(page: Page): Promise<string[]> {
  const csp = cspFor(THEME_SCRIPT);
  await page.route('**/*', async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers() };
    if ((headers['content-type'] ?? '').includes('text/html')) headers['content-security-policy'] = csp;
    await route.fulfill({ response, headers });
  });
  const violations: string[] = [];
  await page.exposeFunction('__reportCsp', (v: string) => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { __reportCsp: (v: string) => void }).__reportCsp(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  return violations;
}

export async function copyFrom(page: Page, blockText: string): Promise<string> {
  const figure = page.locator('figure.code', { hasText: blockText }).first();
  await figure.locator('.copy-btn').click();
  return page.evaluate(() => navigator.clipboard.readText());
}
