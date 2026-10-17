import { expect, test } from '@playwright/test';
import { withProductionCsp } from './helpers';

const COMPONENTS = '/isolated-agent-substrate/components/';

test('substrate diagram renders, plays and stays inside the CSP', async ({ page }) => {
  const violations = await withProductionCsp(page);
  await page.goto(COMPONENTS);
  const diagram = page.locator('#substrate-diagram');
  await expect(diagram.locator('.rail .scene')).toHaveCount(9);
  await expect(diagram.locator('.node[data-node="api"]')).toBeVisible();
  await expect(diagram.locator('.worker')).toHaveCount(3);

  await diagram.locator('#sd-play').click();
  await expect(diagram.locator('#sd-play')).toHaveText('Pause');
  await expect(diagram.locator('#sd-feed li:not(.empty)').first()).toBeVisible();

  await diagram.locator('.node[data-node="pg"]').click();
  await expect(diagram.locator('#sd-comp h2')).toHaveText('State store (PostgreSQL)');

  expect(await page.evaluate(() => document.fonts.check('12px "DM Mono"'))).toBe(true);
  expect(violations).toEqual([]);
});

test('diagram keys do not hijack page scrolling', async ({ page }) => {
  await page.goto(COMPONENTS);
  await expect(page.locator('#substrate-diagram .rail .scene')).toHaveCount(9);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#sd-n-eyebrow')).toHaveText('• scene 1 of 9');
});
