import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/autoscaler/meta';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks, hudTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors,
} from './helpers';

const T = meta.tasks.length;
const waitTask = (page: Page, n: number) => expect(page.locator('#side .eyebrow')).toHaveText(`Task ${n} of ${T}`, { timeout: 10_000 });

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'autoscaler', 1);
  await expectNoHorizontalScroll(page);
  await realClick(page, page.locator('#as-add'));
  await expect(page.locator('#toast')).toContainText('Press Start first');
  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  // Task 2: watch traffic and boot instances ahead of it (traffic grows ~25 req/s per second of play).
  await waitTask(page, 2);
  const end = Date.now() + 60_000;
  while ((await hudTasks(page)) !== `2/${T}`) {
    if (Date.now() > end) throw new Error('the ramp took too long');
    const load = (await page.locator('#as-load').textContent()) ?? '';
    const demand = Number(/^(\d+)/.exec(load)?.[1] ?? 0);
    const fleet = await page.locator('.as-inst.on, .as-inst.boot').count();
    if (demand + 25 * 3.5 > 0.82 * fleet * 100 && fleet < 16) await realClick(page, page.locator('#as-add'));
    else await page.waitForTimeout(120);
  }

  // Task 3: 95% (the start) overloads; 60% is safe and affordable.
  await waitTask(page, 3);
  await realClick(page, page.locator('#as-run'));
  await expect(page.locator('#as-over')).not.toHaveText('0');
  await realClick(page, page.locator('[data-target="60"]'));
  await realClick(page, page.locator('#as-run'));
  await expectTasks(page, 3, T);

  // Task 4: without pre-warm the sale overloads; with it, it doesn't.
  await waitTask(page, 4);
  await realClick(page, page.locator('#as-run'));
  await expect(page.locator('#toast')).toContainText('tripled');
  await realClick(page, page.locator('#as-pre'));
  await realClick(page, page.locator('#as-run'));

  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'autoscaler', 1);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'autoscaler', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
