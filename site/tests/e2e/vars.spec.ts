import { expect, test } from '@playwright/test';
import { copyFrom, GATEWAY_LAB, PROMPT_GUARD } from './helpers';

test('fills every occurrence, copies the filled text, and carries to the next page', async ({ page }) => {
  await page.goto(GATEWAY_LAB);
  await page.locator('#var-INGRESS_GW_ADDRESS').fill('20.84.113.7');
  const spans = page.locator('.var[data-var="INGRESS_GW_ADDRESS"]');
  const count = await spans.count();
  expect(count).toBeGreaterThan(1);
  for (let i = 0; i < count; i++) await expect(spans.nth(i)).toHaveText('20.84.113.7');
  expect(await copyFrom(page, ':8080/ollama')).toContain('curl "20.84.113.7:8080/ollama"');
  expect(await copyFrom(page, 'export INGRESS_GW_ADDRESS=')).toContain('export INGRESS_GW_ADDRESS=$(kubectl');

  await page.goto(PROMPT_GUARD);
  await expect(page.locator('.var[data-var="INGRESS_GW_ADDRESS"]').first()).toHaveText('20.84.113.7');
});

test('value with HTML is inserted as text', async ({ page }) => {
  await page.goto(GATEWAY_LAB);
  const payload = '<img src=x onerror="window.__xss=1">';
  await page.locator('#var-INGRESS_GW_ADDRESS').fill(payload);
  await expect(page.locator('.var[data-var="INGRESS_GW_ADDRESS"]').first()).toHaveText(payload);
  await expect(page.locator('figure.code img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
});

test('works when storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  });
  await page.goto(GATEWAY_LAB);
  await page.locator('#var-INGRESS_GW_ADDRESS').fill('10.0.0.5');
  await expect(page.locator('.var[data-var="INGRESS_GW_ADDRESS"]').first()).toHaveText('10.0.0.5');
  await page.locator('[data-theme-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', /dark|light/);
});

test('without JavaScript the page still shows content and raw variables', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(GATEWAY_LAB);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.var[data-var="INGRESS_GW_ADDRESS"]').first()).toHaveText('$INGRESS_GW_ADDRESS');
  await expect(page.locator('[data-var-panel]')).toBeHidden();
  await expect(page.locator('.lab-side a[aria-current="page"]')).toBeVisible();
  await context.close();
});

test('corrupted stored values do not break the page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('afg:vars', 'null'));
  await page.goto(GATEWAY_LAB);
  await expect(page.locator('#var-INGRESS_GW_ADDRESS')).toBeVisible();
  await expect(page.locator('figure.code .copy-btn').first()).toBeVisible();
});
