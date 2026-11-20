import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/latency-budget/meta';
import { REQUESTS } from '../../src/games/latency-budget/sim';
import { expectNoHorizontalScroll, playTutorial, realClick, waitTask, watchErrors } from './helpers';

/** Latency Budget, solved, with pauses so every task respects the server's minimum times. */
async function solveLatencyBudget(page: Page) {
  await realClick(page, page.locator('#start-btn'));
  // The nickname gate comes first (shared leaderboard, no nickname yet).
  await expect(page.locator('#nick-gate')).toBeVisible();
  await page.fill('#gate-nick', 'VJTI_Ace');
  await realClick(page, page.locator('#gate-save'));
  await expect(page.locator('#claim-code')).toHaveText(/^BTC-/);
  const code = (await page.locator('#claim-code').textContent())!.trim();
  await expect(page.locator('#claim-nick')).toHaveText('VJTI_Ace');
  await realClick(page, page.locator('#gate-go'));
  await playTutorial(page, meta.walkthrough);
  await waitTask(page, 2);
  await page.waitForTimeout(2200);
  await realClick(page, page.locator('[data-site="eu-west"]'));
  await waitTask(page, 3);
  await page.waitForTimeout(5200);
  for (const id of ['eu-west', 'ap-south', 'ap-northeast']) await realClick(page, page.locator(`[data-site="${id}"]`));
  await realClick(page, page.locator('[data-site="ap-northeast"]'));
  await realClick(page, page.locator('[data-site="sa-east"]'));
  await waitTask(page, 4);
  await page.waitForTimeout(6200);
  for (let i = 0; i < REQUESTS.length; i++) await realClick(page, page.locator(`button[data-req="${i}"][data-choice="${REQUESTS[i].edge ? 'edge' : 'origin'}"]`));
  await realClick(page, page.locator('#debrief-next'));
  await expect(page.locator('#post-status')).toContainText('Posted', { timeout: 15_000 });
  return code;
}

test('organiser creates a competition; a player gets a nickname and claim code, plays, ranks; the organiser verifies the claim', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    localStorage.setItem('btc:noticeOk', 'true');
    localStorage.setItem('btc:muted', 'true');
    (window as unknown as { __BTC_LB__?: string }).__BTC_LB__ = 'mock';
  });
  await page.goto('./#/');
  await realClick(page, page.locator('footer a[href="#/competitions/new"]'));
  await page.fill('#co-name', 'VJTI Break the Cloud Cup');
  await expect(page.locator('#co-id')).toHaveValue('vjti-break-the-cloud-cup');
  await page.fill('#co-id', 'vjti-2026');
  // Started an hour ago, ends tomorrow.
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await page.fill('#co-start', local(new Date(Date.now() - 3600_000)));
  await page.fill('#co-end', local(new Date(Date.now() + 24 * 3600_000)));
  await realClick(page, page.locator('#co-create'));
  const adminLink = await page.locator('#cm-adm').inputValue();
  expect(adminLink).toContain('#/c/vjti-2026/admin?key=');

  // Home shows the competition banner.
  await page.evaluate(() => (location.hash = '#/'));
  await expect(page.locator('#comp-ban-link')).toContainText('VJTI Break the Cloud Cup');

  // A player: nickname gate, claim code, a full game.
  await page.evaluate(() => (location.hash = '#/play/latency-budget?seed=1'));
  const code = await solveLatencyBudget(page);

  // The public leaderboard ranks them; level 1 too; projector mode toggles.
  await page.evaluate(() => (location.hash = '#/c/vjti-2026'));
  await expect(page.locator('#comp-status')).toContainText('Live');
  await expect(page.locator('#comp-board tr.me')).toContainText('VJTI_Ace');
  const rank = await page.locator('#comp-board tr.me').getAttribute('data-crank');
  await realClick(page, page.locator('[data-lv="1"]'));
  await expect(page.locator('#comp-board tr.me')).toContainText('VJTI_Ace');
  await realClick(page, page.locator('[data-lv="2"]'));
  // Level 2 has other players' scores but not ours (we only played a level 1 game).
  await expect(page.locator('#comp-board')).toContainText('packet_pusher');
  await expect(page.locator('#comp-board')).not.toContainText('VJTI_Ace');
  await expectNoHorizontalScroll(page);

  // Report card.
  await realClick(page, page.locator('#comp-me'));
  await expect(page.locator('#rc-nick')).toHaveText('VJTI_Ace');
  await expect(page.locator('#rc-rank')).toHaveText(`#${rank}`);
  await expectNoHorizontalScroll(page);

  // Organiser: standings and claim verification (wrong code, then the right one).
  await page.evaluate((h) => (location.hash = h.slice(h.indexOf('#'))), adminLink);
  await expect(page.locator('#adm-body')).toContainText('VJTI_Ace');
  await page.fill('#vf-nick', 'vjti_ace');
  await page.fill('#vf-code', 'BTC-WRNG-CODE');
  await realClick(page, page.locator('#vf button'));
  await expect(page.locator('#vf-out')).toContainText('Not valid');
  await page.fill('#vf-code', code);
  await realClick(page, page.locator('#vf button'));
  await expect(page.locator('#vf-out')).toContainText('Valid');
  await expect(page.locator('#vf-out')).toContainText(`#${rank}`);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});
