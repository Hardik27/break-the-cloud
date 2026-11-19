import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/quorum/meta';
import { ROUNDS } from '../../src/games/quorum/sim';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors, waitTask, answerPredict, skipReplay,
} from './helpers';

const T = meta.tasks.length;
const rep = (page: Page, i: number) => page.locator(`[data-rep="${i}"]`);

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'quorum', 1);
  await expectNoHorizontalScroll(page);
  await realClick(page, rep(page, 1));
  await expect(page.locator('#toast')).toContainText('Press Start first');
  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  // Task 2: write to A and B, then read from two replicas that are up (the newest value is on one of them).
  await waitTask(page, 2);
  await realClick(page, page.locator('#qr-send'));
  await expect(page.locator('#toast')).toContainText('Pick at least one replica');
  for (let round = 0; round < ROUNDS; round++) {
    await expect(page.locator('#qr-send')).toContainText('Send write');
    await realClick(page, rep(page, 0));
    await realClick(page, rep(page, 1));
    await realClick(page, page.locator('#qr-send'));
    await expect(page.locator('#qr-send')).toHaveText('Read');
    let picked = 0;
    for (let i = 0; i < 3 && picked < 2; i++) {
      if (await rep(page, i).evaluate((e) => e.classList.contains('down'))) {
        await realClick(page, rep(page, i));
        await expect(page.locator('#toast')).toContainText('crashed');
        continue;
      }
      await realClick(page, rep(page, i));
      picked++;
    }
    await realClick(page, page.locator('#qr-send'));
  }
  await expectTasks(page, 2, T);

  // Task 3: R=1, W=1 gives stale reads (mistake); R=2, W=2 passes.
  await waitTask(page, 3);
  await realClick(page, page.locator('#qr-run'));
  await answerPredict(page);
  await skipReplay(page);
  await expect(page.locator('#qr-stale')).toHaveClass(/bad-pill/);
  await realClick(page, page.locator('[data-r="2"]'));
  await realClick(page, page.locator('[data-w="2"]'));
  await expect(page.locator('#qr-sum')).toContainText('R + W = 4');
  await realClick(page, page.locator('#qr-run'));
  await answerPredict(page);
  await skipReplay(page);
  await expectTasks(page, 3, T);

  // Task 4: the default W=3 fails writes while C is down; R=2, W=2 survives.
  await waitTask(page, 4);
  await realClick(page, page.locator('#qr-run'));
  await answerPredict(page);
  await skipReplay(page);
  await expect(page.locator('#qr-wf')).toHaveClass(/bad-pill/);
  await realClick(page, page.locator('[data-r="2"]'));
  await realClick(page, page.locator('[data-w="2"]'));
  await realClick(page, page.locator('#qr-run'));
  await answerPredict(page);
  await skipReplay(page);

  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'quorum', 1);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'quorum', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
