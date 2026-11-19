import { expect, test } from '@playwright/test';
import { meta } from '../../src/games/retry-storm/meta';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks, hudTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors, waitTask,
} from './helpers';

const T = meta.tasks.length;

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'retry-storm', 1);
  await expectNoHorizontalScroll(page);
  await realClick(page, page.locator('#rs-send'));
  await expect(page.locator('#toast')).toContainText('Press Start first');
  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  // Task 2: send only when the meter shows room.
  await waitTask(page, 2);
  const end = Date.now() + 60_000;
  while ((await hudTasks(page)) !== `2/${T}`) {
    if (Date.now() > end) throw new Error('pacing took too long');
    const m = /(\d+) \/ ([\d.]+)/.exec((await page.locator('#rs-load').textContent()) ?? '');
    if (m && Number(m[1]) + 1 <= Number(m[2]) - 0.15) await realClick(page, page.locator('#rs-send'));
    else await page.waitForTimeout(100);
  }

  // Task 3: immediate retries pile on; exponential backoff does not.
  await waitTask(page, 3);
  await realClick(page, page.locator('#rs-run'));
  await expect(page.locator('#rs-ol')).toHaveClass(/bad-pill/);
  await realClick(page, page.locator('[data-policy="exponential"]'));
  await realClick(page, page.locator('#rs-run'));
  await expectTasks(page, 3, T);

  // Task 4: backoff alone leaves synchronized spikes; add jitter.
  await waitTask(page, 4);
  await realClick(page, page.locator('#rs-run'));
  await expect(page.locator('#rs-peak')).toHaveClass(/bad-pill/);
  await realClick(page, page.locator('#rs-jitter'));
  await realClick(page, page.locator('#rs-run'));

  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'retry-storm', 1);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'retry-storm', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
