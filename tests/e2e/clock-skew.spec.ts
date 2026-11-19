import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/clock-skew/meta';
import { CHAT, EVENTS, PAIRS, lamport, relation } from '../../src/games/clock-skew/sim';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors,
} from './helpers';

const T = meta.tasks.length;
const waitTask = (page: Page, n: number) => expect(page.locator('#side .eyebrow')).toHaveText(`Task ${n} of ${T}`, { timeout: 10_000 });

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'clock-skew', 1);
  await expectNoHorizontalScroll(page);
  await realClick(page, page.locator('[data-msg="0"]'));
  await expect(page.locator('#toast')).toContainText('Press Start first');
  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  // Task 2: the top message (earliest timestamp) is a reply: clicking it first is a mistake. Then the real order.
  await waitTask(page, 2);
  await realClick(page, page.locator('.ck-msg').first());
  await expect(page.locator('#toast')).toContainText('clock is 9 s slow');
  for (let i = 0; i < CHAT.length; i++) await realClick(page, page.locator(`[data-msg="${i}"]`));
  await expectTasks(page, 2, T);

  // Task 3: Lamport timestamps; a wrong guess on the first receive explains the max rule.
  await waitTask(page, 3);
  const L = lamport();
  for (const e of EVENTS) {
    await expect(page.locator('#ck-q')).toContainText(e.id);
    if (e.id === 'b1') {
      await realClick(page, page.locator('[data-lv="1"]'));
      await expect(page.locator('#toast')).toContainText('larger of');
    }
    await realClick(page, page.locator(`[data-lv="${L[e.id]}"]`));
  }
  await expectTasks(page, 3, T);

  // Task 4: vector clocks.
  await waitTask(page, 4);
  for (const [x, y] of PAIRS) {
    await expect(page.locator('#ck-q')).toContainText(`${x} [`);
    await realClick(page, page.locator(`[data-rel="${relation(x, y)}"]`));
  }

  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'clock-skew', 1);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'clock-skew', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
