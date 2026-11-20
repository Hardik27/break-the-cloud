import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/latency-budget/meta';
import { REQUESTS } from '../../src/games/latency-budget/sim';
import { expectNoHorizontalScroll, openGame, playTutorial, realClick, waitTask, watchErrors } from './helpers';

/**
 * The claim code window: it must stay up (the bug was a board reload wiping it after 3–4 s)
 * and Continue stays disabled until the player confirms they saved the code.
 */
async function saveClaimCode(page: Page, nick: string, keyboard = false): Promise<string> {
  const ov = page.locator('#claim-ov');
  await expect(ov).toBeVisible();
  await expect(page.locator('#claim-code')).toHaveText(/^BTC-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  await expect(page.locator('#claim-nick')).toHaveText(nick);
  await expect(ov).toContainText('screenshot');
  await expect(ov).toContainText('need this code to collect a prize');
  await expect(page.locator('#claim-done')).toBeDisabled();
  await page.waitForTimeout(5000);
  await expect(ov).toBeVisible();
  await expectNoHorizontalScroll(page);
  const code = (await page.locator('#claim-code').textContent())!.trim();
  if (keyboard) {
    // Focus starts on Copy; Tab → Download → the checkbox, Space ticks it, Tab → Continue, Enter.
    await expect(page.locator('#claim-copy')).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.locator('#claim-ack')).toBeFocused();
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    await expect(page.locator('#claim-done')).toBeFocused();
    await page.keyboard.press('Enter');
  } else {
    await realClick(page, page.locator('#claim-ack'));
    await realClick(page, page.locator('#claim-done'));
  }
  await expect(ov).toHaveCount(0);
  return code;
}

/** Latency Budget, solved, with pauses so every task respects the server's minimum times. */
async function solveLatencyBudget(page: Page) {
  // Already has a nickname (joined on the competition page): no nickname card.
  await expect(page.locator('#board-nick')).toContainText('Playing as VJTI_Ace');
  await expect(page.locator('#nick-gate')).toHaveCount(0);
  await realClick(page, page.locator('#start-btn'));
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

  // A player arrives from the poster's QR code: the competition page asks for a nickname first, then shows the claim code.
  await page.evaluate(() => (location.hash = '#/c/vjti-2026'));
  await expect(page.locator('#nick-gate')).toBeVisible();
  await expect(page.locator('#gate-save')).toHaveText('Join the competition');
  await page.fill('#gate-nick', 'VJTI_Ace');
  await realClick(page, page.locator('#gate-save'));
  const code = await saveClaimCode(page, 'VJTI_Ace');
  await expect(page.locator('#nick-gate')).toHaveCount(0);

  // Then a full game.
  await page.evaluate(() => (location.hash = '#/play/latency-budget?seed=1'));
  await solveLatencyBudget(page);

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

test('a game page asks for a nickname when it opens; the claim code stays until saved', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'traffic-cop', 1, { lb: 'mock' });
  // The nickname card is up before Start; the stage waits behind it.
  await expect(page.locator('#nick-gate')).toBeVisible();
  await expect(page.locator('#nick-gate')).toContainText('screenshot it');
  await expect(page.locator('#coach-text')).toContainText('Pick a nickname');
  // Pressing Start first just points back at the card.
  await realClick(page, page.locator('#start-btn'));
  await expect(page.locator('#coach-text')).toContainText('First pick a nickname');
  await page.fill('#gate-nick', 'Cloud_Kid');
  await realClick(page, page.locator('#gate-save'));
  await saveClaimCode(page, 'Cloud_Kid');
  await expect(page.locator('#nick-gate')).toHaveCount(0);
  // Then the explainer starts, as if Start had just been pressed.
  await expect(page.locator('#learn-ov')).toBeVisible();
  await expect(page.locator('#board-nick')).toContainText('Playing as Cloud_Kid');
  expect(errors).toEqual([]);
});

test('skipping the card, then picking a nickname under the leaderboard: the claim code survives the board reload', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'traffic-cop', 1, { lb: 'mock' });
  await realClick(page, page.locator('#gate-skip'));
  await expect(page.locator('#nick-gate')).toHaveCount(0);
  await expect(page.locator('#coach-text')).toContainText('Press Start');
  await page.fill('#board-nick-in', 'Late_Joiner');
  await realClick(page, page.locator('#board-nick button[type="submit"]'));
  await saveClaimCode(page, 'Late_Joiner', true);
  await expect(page.locator('#board-nick')).toContainText('Playing as Late_Joiner');
  expect(errors).toEqual([]);
});
