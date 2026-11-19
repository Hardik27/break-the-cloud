import { expect, test } from '@playwright/test';
import { meta } from '../../src/games/latency-budget/meta';
import { REQUESTS } from '../../src/games/latency-budget/sim';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors, waitTask,
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
  await waitTask(page, 2);
  await realClick(page, page.locator('[data-site="ap-south"]'));
  await expect(page.locator('#lb-s1')).toContainText('Mumbai');
  await realClick(page, page.locator('[data-site="eu-west"]'));
  await expectTasks(page, 2, T);

  // Task 3: one wasted edge (Oregon) costs points and is removed; then the three biggest slow cities.
  await waitTask(page, 3);
  await realClick(page, page.locator('[data-site="us-west"]'));
  await expect(page.locator('.pop.bad')).toBeVisible();
  await realClick(page, page.locator('[data-site="us-west"]'));
  await expect(page.locator('#lb-s1')).toContainText('0 / 3');
  for (const id of ['eu-west', 'ap-south', 'ap-northeast']) await realClick(page, page.locator(`[data-site="${id}"]`));
  await expect(page.locator('.lb-ring[visibility="visible"]')).toHaveCount(3);
  // Round 2: São Paulo triples. Move the Tokyo edge to São Paulo.
  await expect(page.locator('#lb-s1')).toContainText('Brazil');
  await realClick(page, page.locator('[data-site="ap-northeast"]'));
  await realClick(page, page.locator('[data-site="sa-east"]'));
  await expectTasks(page, 3, T);

  // Task 4: sort requests.
  await waitTask(page, 4);
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
