import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/blast-radius/meta';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors, waitTask, answerPredict, skipReplay,
} from './helpers';

const T = meta.tasks.length;
const placeIn = (page: Page, c: string, az: string) => realClick(page, page.locator(`[data-place="${c}-${az}"]`));

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'blast-radius', 1);
  await expectNoHorizontalScroll(page);
  await placeIn(page, 'web-1', 'b');
  await expect(page.locator('#toast')).toContainText('Press Start first');
  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  // Task 2: spread web servers but forget the database replica: the test fails. Then fix it.
  await waitTask(page, 2);
  for (const [c, az] of [['web-2', 'b'], ['web-3', 'c'], ['web-5', 'b'], ['web-6', 'c']]) await placeIn(page, c, az);
  await realClick(page, page.locator('#br-test'));
  await expect(page.locator('[data-test="a"]')).toHaveText('OUTAGE');
  await placeIn(page, 'db-replica', 'b');
  await realClick(page, page.locator('#br-test'));
  await expectTasks(page, 2, T);

  // Task 3: when zone a fails, promote the replica and add a server in zone c.
  await waitTask(page, 3);
  await expect(page.locator('#br-writes')).toHaveText('FAILING', { timeout: 8000 });
  await realClick(page, page.locator('#br-promote'));
  await expect(page.locator('#br-writes')).toHaveText('working');
  await realClick(page, page.locator('[data-add="a"]'));
  await expect(page.locator('#toast')).toContainText('never come up');
  await realClick(page, page.locator('[data-add="c"]'));
  await expectTasks(page, 3, T, 30_000);

  // Task 4: nightly backups lose a day of data; async + warm standby meets everything.
  await waitTask(page, 4);
  await realClick(page, page.locator('#br-run'));
  await answerPredict(page);
  await skipReplay(page);
  await expect(page.locator('#br-rpo')).toHaveClass(/bad-pill/);
  await realClick(page, page.locator('[data-repl="async"]'));
  await realClick(page, page.locator('[data-standby="warm"]'));
  await realClick(page, page.locator('#br-run'));
  await answerPredict(page);
  await skipReplay(page);

  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'blast-radius', 1);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'blast-radius', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
