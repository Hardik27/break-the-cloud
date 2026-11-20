import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, openGame, realClick, watchErrors } from './helpers';

type Fb = { message: string; rating: number | null; page: string; game_id: string | null };
const sent = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __BTC_FEEDBACK__?: Fb[] }).__BTC_FEEDBACK__ ?? []);

test('feedback from the top bar on a game page: rating, message, sent with the game; validation and keyboard', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'traffic-cop', 1, { lb: 'mock' });
  await realClick(page, page.locator('#gate-skip'));
  await realClick(page, page.locator('#nav-feedback'));
  await expect(page.locator('#fb-ov')).toBeVisible();
  await expect(page.locator('[data-rate="1"]')).toBeFocused();
  await expectNoHorizontalScroll(page);
  // An empty message is not sent, and the window says why.
  await realClick(page, page.locator('#fb-send'));
  await expect(page.locator('#fb-out')).toContainText('Write a few words');
  await realClick(page, page.locator('[data-rate="4"]'));
  await expect(page.locator('[data-rate="4"]')).toHaveAttribute('aria-pressed', 'true');
  await page.fill('#fb-msg', 'The boss wave was great fun.');
  await realClick(page, page.locator('#fb-send'));
  await expect(page.locator('#fb-ov')).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('Thank you');
  expect(await sent(page)).toEqual([{ message: 'The boss wave was great fun.', rating: 4, page: 'play', game_id: 'traffic-cop' }]);
  // Escape closes without sending; focus returns to the button.
  await page.locator('#nav-feedback').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#fb-ov')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#fb-ov')).toHaveCount(0);
  await expect(page.locator('#nav-feedback')).toBeFocused();
  expect((await sent(page)).length).toBe(1);
  expect(errors).toEqual([]);
});

test('feedback from the footer on the home page, with no rating', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    localStorage.setItem('btc:noticeOk', 'true');
    (window as unknown as { __BTC_LB__?: string }).__BTC_LB__ = 'mock';
  });
  await page.goto('./#/');
  await realClick(page, page.locator('footer [data-feedback]'));
  await page.fill('#fb-msg', 'Please add a Kubernetes game.');
  await page.keyboard.press('Tab');
  await realClick(page, page.locator('#fb-send'));
  await expect(page.locator('#fb-ov')).toHaveCount(0);
  expect(await sent(page)).toEqual([{ message: 'Please add a Kubernetes game.', rating: null, page: 'home', game_id: null }]);
  expect(errors).toEqual([]);
});
