import { expect, test } from '@playwright/test';
import { loadSiteNav } from '../../src/lib/repo';
import { firstLabRoute } from '../../src/lib/readme-nav';

const nav = loadSiteNav();

test('home renders every README track', async ({ page }) => {
  await page.goto('/');
  for (const track of nav.tracks) {
    await expect(page.locator(`#${track.slug} h3`)).toHaveText(track.title);
  }
  await expect(page.locator('#scenarios')).not.toContainText(/\bWIP\b/);
  await expect(page.getByText('work in progress', { exact: false })).toHaveCount(0);
});

test('a lab link inside a box opens that lab; the box itself opens the first lab', async ({ page }) => {
  const track = nav.tracks.find((t) => firstLabRoute(t))!;
  await page.goto('/');
  const link = page.locator(`#${track.slug} .nav-list a`).nth(1);
  const href = await link.getAttribute('href');
  await link.click();
  await expect(page).toHaveURL(href!);
  await page.goto('/');
  await page.locator(`#${track.slug} .track-count`).click();
  await expect(page).toHaveURL(firstLabRoute(track)!);
});
