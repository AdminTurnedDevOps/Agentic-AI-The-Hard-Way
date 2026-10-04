import { expect, test } from '@playwright/test';
import { copyFrom, GATEWAY_LAB, withProductionCsp } from './helpers';

test('secrets get no input, are never stored, and stay as $VAR when copied', async ({ page }) => {
  await page.goto(GATEWAY_LAB);
  await expect(page.locator('#var-ANTHROPIC_API_KEY')).toHaveCount(0);
  await expect(page.locator('[data-var-panel]')).toContainText('Set this in your shell');
  await page.locator('#var-INGRESS_GW_ADDRESS').fill('1.2.3.4');
  const stored = await page.evaluate(() => localStorage.getItem('afg:vars') ?? '');
  expect(stored).not.toContain('ANTHROPIC');
  expect(stored).toContain('INGRESS_GW_ADDRESS');
  expect(await copyFrom(page, 'anthropic-secret')).toContain('$ANTHROPIC_API_KEY');
});

test('stored secret is ignored', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('afg:vars', JSON.stringify({ ANTHROPIC_API_KEY: 'sk-should-not-show' })));
  await page.goto(GATEWAY_LAB);
  await expect(page.getByText('sk-should-not-show')).toHaveCount(0);
  await expect(page.locator('.var[data-var="ANTHROPIC_API_KEY"]').first()).toHaveText('$ANTHROPIC_API_KEY');
});

test('no CSP violations on home, a lab page and a search', async ({ page }) => {
  const violations = await withProductionCsp(page);
  await page.goto('/');
  await page.goto(GATEWAY_LAB);
  await page.locator('#site-search').fill('substrate');
  await expect(page.locator('[data-search-results] a').first()).toBeVisible();
  expect(violations).toEqual([]);
});
