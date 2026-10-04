import { expect, test } from '@playwright/test';

test('search finds the Substrate install lab', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('/');
  await expect(page.locator('#site-search')).toBeFocused();
  await page.keyboard.type('substrate');
  await expect(page.locator('[data-search-results] a[href="/isolated-agent/installation/"]')).toBeVisible();
});

test('theme choice persists across reloads', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-theme-toggle]').click();
  const theme = await page.locator('html').getAttribute('data-theme');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme!);
});
