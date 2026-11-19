import { expect, test } from '@playwright/test';
import { meta } from '../../src/games/latency-budget/meta';
import { REQUESTS } from '../../src/games/latency-budget/sim';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors,
} from './helpers';

const T = meta.tasks.length;

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'latency-budget', 1);
  await expectNoHorizontalScroll(page);
  await realClick(page, page.locator('[data-site="eu-west"]'));
  await expect(page.locator('#toast')).toContainText('Press Start first');
  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  // Task 2: try Mumbai, then Ireland.
  await expect(page.locator('#side .eyebrow')).toHaveText(`Task 2 of ${T}`, { timeout: 10_000 });
  await realClick(page, page.locator('[data-site="ap-south"]'));
  await expect(page.locator('#lb-s1')).toContainText('Mumbai');
  await realClick(page, page.locator('[data-site="eu-west"]'));
  await expectTasks(page, 2, T);

  // Task 3: one wasted edge (Oregon) costs points and is removed; then one edge per slow city.
  await expect(page.locator('#side .eyebrow')).toHaveText(`Task 3 of ${T}`, { timeout: 10_000 });
  await realClick(page, page.locator('[data-site="us-west"]'));
  await expect(page.locator('.pop.bad')).toBeVisible();
  await realClick(page, page.locator('[data-site="us-west"]'));
  await expect(page.locator('#lb-s1')).toContainText('0 / 7');
  for (const id of ['sa-east', 'eu-west', 'af-west', 'ap-south', 'ap-southeast', 'ap-northeast', 'ap-sydney']) {
    await realClick(page, page.locator(`[data-site="${id}"]`));
  }
  await expectTasks(page, 3, T);

  // Task 4: sort requests.
  await expect(page.locator('#side .eyebrow')).toHaveText(`Task 4 of ${T}`, { timeout: 10_000 });
  for (let i = 0; i < REQUESTS.length; i++) {
    await realClick(page, page.locator(`button[data-req="${i}"][data-choice="${REQUESTS[i].edge ? 'edge' : 'origin'}"]`));
  }
  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'latency-budget', 1);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'latency-budget', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
