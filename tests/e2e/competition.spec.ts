import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/latency-budget/meta';
import { REQUESTS } from '../../src/games/latency-budget/sim';
import { expectNoHorizontalScroll, openGame, playTutorial, realClick, waitTask, watchErrors } from './helpers';

const BOOK = 'https://zenodo.org/records/23031568';

/**
 * The claim code window: it stays up (a board reload once wiped it after 3–4 s), names the competition or class,
 * offers the free book, and Continue stays disabled until the player confirms they saved the code.
 */
async function saveClaimCode(page: Page, nick: string, scope: string, why: RegExp, keyboard = false): Promise<string> {
  const ov = page.locator('#claim-ov');
  await expect(ov).toBeVisible();
  await expect(page.locator('#claim-code')).toHaveText(/^BTC-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  await expect(page.locator('#claim-nick')).toHaveText(nick);
  await expect(page.locator('#claim-scope')).toHaveText(scope);
  await expect(ov).toContainText('screenshot');
  await expect(ov).toContainText(why);
  await expect(page.locator('#claim-done')).toBeDisabled();
  await expect(page.locator('#claim-book')).toHaveAttribute('href', BOOK);
  await expect(page.locator('#claim-book')).toHaveAttribute('target', '_blank');
  await page.waitForTimeout(4000);
  await expect(ov).toBeVisible();
  await expectNoHorizontalScroll(page);
  const code = (await page.locator('#claim-code').textContent())!.trim();
  if (keyboard) {
    // Focus starts on Copy; Tab → Download → book link → the checkbox, Space ticks it, Tab → Continue, Enter.
    await expect(page.locator('#claim-copy')).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.locator('#claim-book')).toBeFocused();
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

/** The welcome window after picking a nickname: global players get no code, but they get the free book. */
async function passWelcome(page: Page, nick: string, keyboard = false): Promise<void> {
  const ov = page.locator('#welcome-ov');
  await expect(ov).toBeVisible();
  await expect(page.locator('#welcome-nick')).toHaveText(nick);
  await expect(page.locator('#welcome-book')).toHaveAttribute('href', BOOK);
  await expect(page.locator('#claim-code')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  if (keyboard) {
    await expect(page.locator('#welcome-go')).toBeFocused();
    await page.keyboard.press('Enter');
  } else await realClick(page, page.locator('#welcome-go'));
  await expect(ov).toHaveCount(0);
}

/** Latency Budget, solved, with pauses so every task respects the server's minimum times. */
async function solveLatencyBudget(page: Page) {
  // Already has a nickname (picked when joining): no nickname card.
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

test('organiser hosts; a player joins with the code, plays and ranks; the organiser verifies, removes and reinstates', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    localStorage.setItem('btc:noticeOk', 'true');
    localStorage.setItem('btc:muted', 'true');
    (window as unknown as { __BTC_LB__?: string }).__BTC_LB__ = 'mock';
  });
  await page.goto('./#/');
  // Hosting is easy to find: the Teach or host section on the home page.
  await expect(page.locator('#teach')).toBeVisible();
  await realClick(page, page.locator('#host-comp'));
  await page.fill('#co-name', 'VJTI Break the Cloud Cup');
  await expect(page.locator('#co-id')).toHaveValue('vjti-break-the-cloud-cup');
  await page.fill('#co-id', 'vjti-2026');
  // Started an hour ago, ends tomorrow.
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await page.fill('#co-start', local(new Date(Date.now() - 3600_000)));
  await page.fill('#co-end', local(new Date(Date.now() + 24 * 3600_000)));
  await realClick(page, page.locator('#co-create'));
  const joinCode = (await page.locator('#cm-code').textContent())!.trim();
  expect(joinCode).toMatch(/^[A-Z0-9]{6}$/);
  const joinLink = await page.locator('#cm-pub').inputValue();
  expect(joinLink).toContain(`#/c/vjti-2026?code=${joinCode}`);
  const adminLink = await page.locator('#cm-adm').inputValue();
  expect(adminLink).toContain('#/c/vjti-2026/admin?key=');

  // Not a member yet: the competition is not on this home page.
  await page.evaluate(() => (location.hash = '#/'));
  await expect(page.locator('#daily')).toBeVisible();
  await expect(page.locator('#comp-ban-link')).toHaveCount(0);

  // Without the code nobody can join: a wrong code is refused.
  await page.evaluate(() => (location.hash = '#/c/vjti-2026'));
  await expect(page.locator('#cj-form')).toBeVisible();
  await page.fill('#cj-nick', 'VJTI_Ace');
  await page.fill('#cj-code', 'ZZZZZZ');
  await realClick(page, page.locator('#cj-go'));
  await expect(page.locator('#cj-msg')).toContainText('not right');

  // The poster's link carries the code: one press joins, and the claim code is for this competition only.
  await page.evaluate((h) => (location.hash = h.slice(h.indexOf('#'))), joinLink);
  await expect(page.locator('#cj-code')).toHaveValue(joinCode);
  await realClick(page, page.locator('#cj-go'));
  const claim = await saveClaimCode(page, 'VJTI_Ace', 'VJTI Break the Cloud Cup', /collect a prize in VJTI Break the Cloud Cup/);
  await expect(page.locator('#cj-in')).toContainText('VJTI_Ace');
  await expectNoHorizontalScroll(page);

  // A member sees the competition on the home page.
  await page.evaluate(() => (location.hash = '#/'));
  await expect(page.locator('#comp-ban-link')).toContainText('VJTI Break the Cloud Cup');

  // A full game.
  await page.evaluate(() => (location.hash = '#/play/latency-budget?seed=1'));
  await solveLatencyBudget(page);

  // The public leaderboard ranks them; level 1 too; level 2 has other members, not us.
  await page.evaluate(() => (location.hash = '#/c/vjti-2026'));
  await expect(page.locator('#comp-status')).toContainText('Live');
  await expect(page.locator('#comp-board tr.me')).toContainText('VJTI_Ace');
  const rank = await page.locator('#comp-board tr.me').getAttribute('data-crank');
  await realClick(page, page.locator('[data-lv="1"]'));
  await expect(page.locator('#comp-board tr.me')).toContainText('VJTI_Ace');
  await realClick(page, page.locator('[data-lv="2"]'));
  await expect(page.locator('#comp-board')).toContainText('packet_pusher');
  await expect(page.locator('#comp-board')).not.toContainText('VJTI_Ace');
  await expectNoHorizontalScroll(page);

  // Report card.
  await realClick(page, page.locator('#comp-me'));
  await expect(page.locator('#rc-nick')).toHaveText('VJTI_Ace');
  await expect(page.locator('#rc-rank')).toHaveText(`#${rank}`);
  await expect(page.locator('#report-card #rc-book')).toHaveAttribute('href', BOOK);
  await expectNoHorizontalScroll(page);

  // Organiser: join code, claim verification (wrong code, then the right one).
  await page.evaluate((h) => (location.hash = h.slice(h.indexOf('#'))), adminLink);
  await expect(page.locator('#adm-code')).toHaveText(joinCode);
  await expect(page.locator('#adm-body')).toContainText('VJTI_Ace');
  await page.fill('#vf-nick', 'vjti_ace');
  await page.fill('#vf-code', 'BTC-WRNG-CODE');
  await realClick(page, page.locator('#vf button'));
  await expect(page.locator('#vf-out')).toContainText('Not valid');
  await page.fill('#vf-code', claim);
  await realClick(page, page.locator('#vf button'));
  await expect(page.locator('#vf-out')).toContainText('Valid');
  await expect(page.locator('#vf-out')).toContainText(`#${rank}`);

  // Disqualify from the standings row: gone from every board, the claim no longer wins; then reinstate.
  await realClick(page, page.locator('[data-dq="VJTI_Ace"]'));
  await expect(page.locator('#dq-nick')).toHaveValue('VJTI_Ace');
  await page.fill('#dq-reason', 'testing the desk');
  await realClick(page, page.locator('#dq-go'));
  await expect(page.locator('#dq-list')).toContainText('VJTI_Ace');
  await expect(page.locator('#dq-list')).toContainText('testing the desk');
  await expect(page.locator('[data-dq="VJTI_Ace"]')).toHaveCount(0);
  await page.fill('#vf-nick', 'vjti_ace');
  await page.fill('#vf-code', claim);
  await realClick(page, page.locator('#vf button'));
  await expect(page.locator('#vf-out')).toContainText('disqualified');
  await expectNoHorizontalScroll(page);
  await page.evaluate(() => (location.hash = '#/c/vjti-2026'));
  await expect(page.locator('#cj-dq')).toBeVisible();
  await expect(page.locator('#comp-board')).not.toContainText('VJTI_Ace');
  await page.evaluate((h) => (location.hash = h.slice(h.indexOf('#'))), adminLink);
  await realClick(page, page.locator('[data-rein="VJTI_Ace"]'));
  await expect(page.locator('[data-dq="VJTI_Ace"]')).toBeVisible();

  // Learning activity was recorded along the way (the mock backend keeps it in the page).
  await page.evaluate(async () => (window as unknown as { __btcFlush?: () => Promise<void> }).__btcFlush?.());
  const types = await page.evaluate(() => (window as unknown as { __BTC_EVENTS__?: { type: string }[] }).__BTC_EVENTS__!.map((e) => e.type));
  for (const t of ['visit', 'game_open', 'learn_done', 'tutorial_done', 'task_done', 'game_finish']) expect(types).toContain(t);
  expect(errors).toEqual([]);
});

test('a game page asks for a nickname when it opens; then a welcome with the free book, and no code', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'traffic-cop', 1, { lb: 'mock' });
  // The nickname card is up before Start; the stage waits behind it.
  await expect(page.locator('#nick-gate')).toBeVisible();
  await expect(page.locator('#coach-text')).toContainText('Pick a nickname');
  // Pressing Start first just points back at the card.
  await realClick(page, page.locator('#start-btn'));
  await expect(page.locator('#coach-text')).toContainText('First pick a nickname');
  await page.fill('#gate-nick', 'Cloud_Kid');
  await realClick(page, page.locator('#gate-save'));
  await passWelcome(page, 'Cloud_Kid');
  await expect(page.locator('#nick-gate')).toHaveCount(0);
  // Then the explainer starts, as if Start had just been pressed.
  await expect(page.locator('#learn-ov')).toBeVisible();
  await expect(page.locator('#board-nick')).toContainText('Playing as Cloud_Kid');
  expect(errors).toEqual([]);
});

test('skipping the card, then picking a nickname under the leaderboard: the welcome survives the board reload (keyboard)', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'traffic-cop', 1, { lb: 'mock' });
  await realClick(page, page.locator('#gate-skip'));
  await expect(page.locator('#nick-gate')).toHaveCount(0);
  await expect(page.locator('#coach-text')).toContainText('Press Start');
  await page.fill('#board-nick-in', 'Late_Joiner');
  await realClick(page, page.locator('#board-nick button[type="submit"]'));
  await expect(page.locator('#welcome-ov')).toBeVisible();
  await page.waitForTimeout(4000);
  await passWelcome(page, 'Late_Joiner', true);
  await expect(page.locator('#board-nick')).toContainText('Playing as Late_Joiner');
  expect(errors).toEqual([]);
});

test('Teach or host: from the top bar; a join code finds its class; an unknown code says so', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    localStorage.setItem('btc:noticeOk', 'true');
    localStorage.setItem('btc:muted', 'true');
    (window as unknown as { __BTC_LB__?: string }).__BTC_LB__ = 'mock';
  });
  await page.goto('./#/privacy');
  await realClick(page, page.locator('#nav-host'));
  await expect(page.locator('#teach')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.fill('#jc-code', 'QQQQQQ');
  await realClick(page, page.locator('#jc-go'));
  await expect(page.locator('#jc-msg')).toContainText('No class or competition');
  await realClick(page, page.locator('#host-class'));
  await page.fill('#cf-name', 'Jetking Nashik');
  await page.fill('#cf-city', 'Nashik');
  await realClick(page, page.locator('#cf-create'));
  const code = (await page.locator('#made-code').textContent())!.trim();
  await page.evaluate(() => (location.hash = '#/host'));
  await page.fill('#jc-code', code.toLowerCase());
  await page.keyboard.press('Enter');
  await expect(page.locator('#join-name')).toHaveText('Jetking Nashik');
  // The privacy page explains learning activity and has the delete button.
  await page.evaluate(() => (location.hash = '#/privacy'));
  await expect(page.locator('#activity')).toBeVisible();
  await expect(page.locator('#privacy')).toContainText('do not store your IP address');
  expect(errors).toEqual([]);
});
