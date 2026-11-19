import { expect, test } from '@playwright/test';
import { meta } from '../../src/games/rate-limiter/meta';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks, hudTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors, waitTask, answerPredict, skipReplay,
} from './helpers';

const T = meta.tasks.length;

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'rate-limiter', 4);
  await expectNoHorizontalScroll(page);
  await realClick(page, page.locator('[data-chip-slot="0"]'));
  await expect(page.locator('#toast')).toContainText('Press Start first');
  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  // Task 2: tap moving bot requests with a real mouse.
  await waitTask(page, 2);
  const end = Date.now() + 60_000;
  while ((await hudTasks(page)) !== `2/${T}`) {
    if (Date.now() > end) throw new Error('bouncing took too long');
    const bot = page.locator('.rl-chip[data-kind="bot"][data-state="flying"]').first();
    if ((await bot.count()) === 0) {
      await page.waitForTimeout(60);
      continue;
    }
    await realClick(page, bot).catch(() => {});
  }

  // Task 3, step 1: Ana alone. The strict starting bucket (1/s, burst 1) bounces her page loads; the replay shows it.
  await waitTask(page, 3);
  await realClick(page, page.locator('#rl-run'));
  await expect(page.locator('#rl-viz')).toBeVisible();
  await expect(page.locator('#hud-time-wrap')).toHaveClass(/held/);
  await expect(page.locator('#rl-viz .rl-reqs i.no').first()).toBeVisible();
  await skipReplay(page);
  await expect(page.locator('#toast')).toContainText('6 at once');
  // Too generous passes step 1 but lets the bot flood in step 2 (with a prediction first).
  await realClick(page, page.locator('[data-rate="20"]'));
  await realClick(page, page.locator('[data-burst="20"]'));
  await realClick(page, page.locator('#rl-run'));
  await skipReplay(page);
  await expect(page.locator('#rl-s1')).toContainText('step 2');
  await realClick(page, page.locator('#rl-run'));
  await answerPredict(page);
  await skipReplay(page);
  await expect(page.locator('#rl-bars .full').first()).toBeVisible();
  await expect(page.locator('#replay-verdict')).toBeVisible();
  // A burst of 6 at 2 per second passes.
  await realClick(page, page.locator('[data-rate="2"]'));
  await realClick(page, page.locator('[data-burst="6"]'));
  await realClick(page, page.locator('#rl-run'));
  await answerPredict(page, true);
  await skipReplay(page);
  await expectTasks(page, 3, T);

  // Task 4: a shared limit fails; per-tenant with paid 5/s and free 2/s passes.
  await waitTask(page, 4);
  await realClick(page, page.locator('[data-free="2"]'));
  await expect(page.locator('#toast')).toContainText('no tiers');
  await realClick(page, page.locator('#rl-run'));
  await answerPredict(page);
  await skipReplay(page);
  await expect(page.locator('#toast')).toContainText('shared bucket');
  await realClick(page, page.locator('[data-scope="client"]'));
  await realClick(page, page.locator('[data-paid="5"]'));
  await realClick(page, page.locator('[data-free="2"]'));
  await realClick(page, page.locator('#rl-run'));
  await answerPredict(page);
  await skipReplay(page);

  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'rate-limiter', 1);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'rate-limiter', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
