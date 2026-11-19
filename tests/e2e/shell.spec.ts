import { expect, test } from '@playwright/test';
import { GAMES, builtGames } from '../../src/games/registry';
import { expectNoHorizontalScroll, realClick, watchErrors } from './helpers';

test('home lists all 8 levels and 24 games, unbuilt ones marked coming soon', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/');
  await expect(page.locator('.level')).toHaveCount(8);
  await expect(page.locator('[data-game]')).toHaveCount(24);
  const built = builtGames().length;
  await expect(page.locator('a.game')).toHaveCount(built);
  await expect(page.locator('.game.soon')).toHaveCount(24 - built);
  for (const g of GAMES) await expect(page.locator(`[data-game="${g.id}"] h3`)).toHaveText(g.title);
  // Career card and first-game call to action.
  await expect(page.locator('#career .career-title')).toHaveText('Intern');
  await expect(page.locator('#cta')).toHaveAttribute('href', `#/play/${builtGames()[0].id}`);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('privacy notice shows once, and Delete my data clears local storage', async ({ page }) => {
  await page.goto('./#/');
  const notice = page.locator('.notice');
  await expect(notice).toBeVisible();
  await realClick(page, notice.locator('button'));
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.notice')).toHaveCount(0);

  await page.evaluate(() => localStorage.setItem('btc:best', JSON.stringify({ 'traffic-cop': { ms: 30000, moves: 9, at: 'x' } })));
  await page.goto('./#/privacy');
  await expect(page.locator('#privacy h2')).toHaveText('What this site stores');
  await expectNoHorizontalScroll(page);
  await realClick(page, page.locator('#delete-data'));
  await expect(page.locator('#delete-msg')).toContainText('Deleted 2 saved items');
  const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('btc:')).length);
  expect(left).toBe(0);
});

test('unknown routes fall back to home', async ({ page }) => {
  await page.goto('./#/play/not-a-game');
  await expect(page.locator('.level')).toHaveCount(8);
  await page.goto('./#/');
  await page.goto('./#/play/another-missing-game');
  await expect(page.locator('.level')).toHaveCount(8);
});

test('home shows today’s incident; finishing a task unlocks a deck card and starts a streak', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('btc:noticeOk', 'true');
      localStorage.setItem('btc:muted', 'true');
    } catch {
      /* ignore */
    }
  });
  await page.goto('./#/');
  await expect(page.locator('#daily')).toBeVisible();
  await expect(page.locator('#daily-pager')).toContainText('📟');
  await expect(page.locator('#streak')).toContainText('start a streak');
  await expect(page.locator('.game.next')).toHaveCount(1);
  // Deck starts empty; after the tutorial of a game, its first card is unlocked.
  await page.goto('./#/deck');
  await expect(page.locator('#deck-count')).toContainText('0 of');
  await page.evaluate(() => localStorage.setItem('btc:deck', JSON.stringify({ 'cache-hit': [0, 1] })));
  await page.reload();
  await expect(page.locator('#deck-count')).toContainText('2 of');
  await expect(page.locator('[data-card="cache-hit-0"]')).toBeVisible();
  // A finished game puts a stand-up question on the home page.
  await page.evaluate(() => localStorage.setItem('btc:best', JSON.stringify({ 'cache-hit': { ms: 60000, moves: 10, points: 1000, stars: 2, at: new Date().toISOString() } })));
  await page.goto('./#/');
  await expect(page.locator('#standup')).toBeVisible();
  await page.locator('#standup [data-su]').first().click();
  await expect(page.locator('#standup .tp-why')).toBeVisible();
});
