import { expect, test } from '@playwright/test';
import { GAMES } from '../../src/games/registry';
import { expectNoHorizontalScroll, realClick, watchErrors } from './helpers';

test('home lists all 8 levels and 24 games, unbuilt ones marked coming soon', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/');
  await expect(page.locator('.level')).toHaveCount(8);
  await expect(page.locator('[data-game]')).toHaveCount(24);
  await expect(page.locator('a.game')).toHaveCount(3);
  await expect(page.locator('.game.soon')).toHaveCount(21);
  for (const g of GAMES) await expect(page.locator(`[data-game="${g.id}"] h3`)).toHaveText(g.title);
  // Career card and first-game call to action.
  await expect(page.locator('#career .career-title')).toHaveText('Intern');
  await expect(page.locator('#cta')).toHaveAttribute('href', '#/play/traffic-cop');
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
  await page.goto('./#/play/gossip'); // coming soon
  await expect(page.locator('.level')).toHaveCount(8);
});
