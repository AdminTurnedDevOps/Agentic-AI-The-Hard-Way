import { expect, test } from '@playwright/test';
import { loadSiteNav } from '../../src/lib/repo';
import { firstLabRoute } from '../../src/lib/readme-nav';

const nav = loadSiteNav();

test('home offers every README track and lists its scenarios, not their labs', async ({ page }) => {
  await page.goto('/');
  for (const track of nav.tracks) {
    const card = page.locator(`#${track.slug}`);
    await expect(card.locator('h3')).toHaveText(track.title);
    await expect(card.locator('.track-card-scenarios a')).toHaveText(track.scenarios.map((s) => s.title));
  }
  await expect(page.locator('.scenario')).toHaveCount(0);
  await expect(page.locator('#tracks')).not.toContainText(/\bWIP\b/);
  await expect(page.getByText('work in progress', { exact: false })).toHaveCount(0);
});

test('the fork draws one branch to each track card', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  // Each branch is one rough path (the curve) plus two arrowhead lines.
  await expect(page.locator('svg[data-rough-arrow="fork"] > g')).toHaveCount(nav.tracks.length * 3);
});

test('a track card opens its track page, which shows only that track\'s scenarios', async ({ page }) => {
  for (const track of nav.tracks) {
    await page.goto('/');
    await page.locator(`#${track.slug} .track-card-total`).click();
    await expect(page).toHaveURL(track.route);
    await expect(page.locator('h1')).toHaveText(track.title);
    await expect(page.locator('.scenario h3')).toHaveText(track.scenarios.map((s) => s.title));
    for (const other of nav.tracks.filter((t) => t.slug !== track.slug)) {
      await expect(page.locator(`.other-tracks a[href="${other.route}"]`)).toHaveText(other.title);
    }
  }
});

test('a scenario name on a track card opens that scenario on the track page', async ({ page }) => {
  const track = nav.tracks[0];
  const scenario = track.scenarios[track.scenarios.length - 1];
  await page.goto('/');
  await page.locator(`#${track.slug} .track-card-scenarios a`, { hasText: scenario.title }).click();
  await expect(page).toHaveURL(`${track.route}#${scenario.slug}`);
  await expect(page.locator(`#${scenario.slug} h3`)).toHaveText(scenario.title);
});

test('on a track page, a lab link inside a box opens that lab; the box itself opens the first lab', async ({ page }) => {
  const track = nav.tracks.find((t) => t.scenarios.some((s) => firstLabRoute(s)))!;
  const scenario = track.scenarios.find((s) => firstLabRoute(s))!;
  await page.goto(track.route);
  const link = page.locator(`#${scenario.slug} .nav-list a`).nth(1);
  const href = await link.getAttribute('href');
  await link.click();
  await expect(page).toHaveURL(href!);
  await page.goto(track.route);
  await page.locator(`#${scenario.slug} .scenario-count`).click();
  await expect(page).toHaveURL(firstLabRoute(scenario)!);
});

test('a lab page links back to its track', async ({ page }) => {
  const track = nav.tracks[0];
  await page.goto(firstLabRoute(track.scenarios[0])!);
  await page.locator(`.lab-meta a[href="${track.route}"]`).click();
  await expect(page).toHaveURL(track.route);
});
