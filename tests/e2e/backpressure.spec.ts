import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/backpressure/meta';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks, hudTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors,
} from './helpers';

const T = meta.tasks.length;
const waitTask = (page: Page, n: number) => expect(page.locator('#side .eyebrow')).toHaveText(`Task ${n} of ${T}`, { timeout: 10_000 });
const consumers = (page: Page) => page.locator('.bp-c.on').count();

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'backpressure', 1);
  await expectNoHorizontalScroll(page);
  await realClick(page, page.locator('#bp-add'));
  await expect(page.locator('#toast')).toContainText('Press Start first');
  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  // Task 2: scale up to the database limit, wait for the drain, scale back to 4.
  await waitTask(page, 2);
  while ((await consumers(page)) < 8) await realClick(page, page.locator('#bp-add'));
  await expect(page.locator('#side [data-flow-progress]')).toContainText('Drained', { timeout: 30_000 });
  while ((await consumers(page)) > 4) await realClick(page, page.locator('#bp-remove'));
  await expectTasks(page, 2, T);

  // Task 3: dead-letter the message that keeps crashing the consumer. One good order first: a mistake.
  await waitTask(page, 3);
  await realClick(page, page.locator('[data-qrow="3"]'));
  await expect(page.locator('#toast')).toContainText('was fine');
  const end = Date.now() + 90_000;
  while ((await hudTasks(page)) !== `3/${T}`) {
    if (Date.now() > end) throw new Error('poison hunting took too long');
    const bad = page.locator('.bp-row.tried').first();
    if (await bad.count()) await realClick(page, bad);
    else await page.waitForTimeout(100);
  }

  // Task 4: 1 try loses good orders; 3 tries is right.
  await waitTask(page, 4);
  await realClick(page, page.locator('#bp-run'));
  await expect(page.locator('#bp-lost')).toHaveText('6');
  await realClick(page, page.locator('[data-maxr="3"]'));
  await realClick(page, page.locator('#bp-run'));

  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'backpressure', 1);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'backpressure', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
