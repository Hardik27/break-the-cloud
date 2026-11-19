import { expect, test } from '@playwright/test';
import { meta } from '../../src/games/thundering-herd/meta';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks, hudTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors, waitTask, answerPredict, skipReplay,
} from './helpers';

const T = meta.tasks.length;

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'thundering-herd', 1);
  await expectNoHorizontalScroll(page);
  await realClick(page, page.locator('#th-refresh'));
  await expect(page.locator('#toast')).toContainText('Press Start first');
  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  // Task 2: wait for the amber zone (≤ 1.6 s left of 6 s), then refresh. One early click first: a mistake.
  await waitTask(page, 2);
  await realClick(page, page.locator('#th-refresh'));
  await expect(page.locator('#toast')).toContainText('Too early');
  const end = Date.now() + 60_000;
  while ((await hudTasks(page)) !== `2/${T}`) {
    if (Date.now() > end) throw new Error('refresh timing took too long');
    const left = Number(/([\d.]+) s/.exec((await page.locator('#th-left').textContent()) ?? '')?.[1] ?? 9);
    if (left <= 1.5 && left >= 0.4) {
      await realClick(page, page.locator('#th-refresh'));
      await page.waitForTimeout(300);
    } else await page.waitForTimeout(80);
  }

  // Task 3: coalescing alone keeps users waiting; stale-while-revalidate fixes it.
  await waitTask(page, 3);
  await realClick(page, page.locator('#th-run2'));
  await answerPredict(page);
  await skipReplay(page);
  await expect(page.locator('#th-q')).toHaveText('300');
  await realClick(page, page.locator('#th-coal'));
  await realClick(page, page.locator('#th-run2'));
  await answerPredict(page);
  await skipReplay(page);
  await expect(page.locator('#th-p99')).toHaveText('300 ms');
  await realClick(page, page.locator('#th-swr'));
  await realClick(page, page.locator('#th-run2'));
  await answerPredict(page);
  await skipReplay(page);
  await expectTasks(page, 3, T);

  // Task 4: ±5% is not enough; ±20% is.
  await waitTask(page, 4);
  await realClick(page, page.locator('[data-jitter="5"]'));
  await realClick(page, page.locator('#th-run3'));
  await answerPredict(page);
  await skipReplay(page);
  await expect(page.locator('#th-peak')).toHaveText('45');
  await realClick(page, page.locator('[data-jitter="20"]'));
  await realClick(page, page.locator('#th-run3'));
  await answerPredict(page);
  await skipReplay(page);

  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'thundering-herd', 1);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'thundering-herd', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
