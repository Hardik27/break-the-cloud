import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/saga/meta';
import { BOOK_TRIPS, FAIL_TRIPS } from '../../src/games/saga/sim';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors, waitTask, answerPredict, skipReplay,
} from './helpers';

const T = meta.tasks.length;
const doStep = (page: Page, i: number) => realClick(page, page.locator(`[data-do="${i}"]`));
const undo = (page: Page, i: number) => realClick(page, page.locator(`[data-undo="${i}"]`));

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'saga', 1);
  await expectNoHorizontalScroll(page);
  await doStep(page, 0);
  await expect(page.locator('#toast')).toContainText('Press Start first');
  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  // Task 2: Ana's trip runs clean; Bo's hotel times out (undo is a mistake), retry it.
  await waitTask(page, 2);
  await expect(page.locator('#sg-trip')).toContainText(BOOK_TRIPS[0].who);
  for (let i = 0; i < 4; i++) await doStep(page, i);
  await expect(page.locator('#sg-trip')).toContainText(BOOK_TRIPS[1].who);
  await doStep(page, 0);
  await doStep(page, 1);
  await expect(page.locator('[data-step="hotel"]')).toHaveClass(/failed/);
  await undo(page, 0);
  await expect(page.locator('#toast')).toContainText('Retry');
  await doStep(page, 1);
  await doStep(page, 2);
  await doStep(page, 3);
  await expectTasks(page, 2, T);

  // Task 3: permanent failures; undo newest first (oldest first is a mistake with an explanation).
  await waitTask(page, 3);
  for (const trip of FAIL_TRIPS) {
    await expect(page.locator('#sg-trip')).toContainText(trip.who);
    const f = trip.fail!.step;
    for (let i = 0; i <= f; i++) await doStep(page, i);
    if (trip === FAIL_TRIPS[0]) {
      await undo(page, 0);
      await expect(page.locator('#toast')).toContainText('newest first');
    }
    for (let i = f - 1; i >= 0; i--) await undo(page, i);
  }
  await expectTasks(page, 3, T);

  // Task 4: save-then-publish loses emails; outbox + dedupe passes.
  await waitTask(page, 4);
  await realClick(page, page.locator('#sg-run'));
  await answerPredict(page);
  await skipReplay(page);
  await expect(page.locator('#sg-lost')).toHaveClass(/bad-pill/);
  await realClick(page, page.locator('[data-design="outbox"]'));
  await realClick(page, page.locator('#sg-run'));
  await answerPredict(page);
  await skipReplay(page);
  await expect(page.locator('#sg-dup')).toHaveClass(/bad-pill/);
  await realClick(page, page.locator('#sg-dedupe'));
  await realClick(page, page.locator('#sg-run'));
  await answerPredict(page);
  await skipReplay(page);

  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'saga', 1);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'saga', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
