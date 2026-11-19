import { expect, test } from '@playwright/test';
import { meta } from '../../src/games/gossip/meta';
import { DEATHS, MANUAL_N, SUSPECT_AFTER } from '../../src/games/gossip/sim';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors, waitTask,
} from './helpers';

const T = meta.tasks.length;

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'gossip', 1);
  await expectNoHorizontalScroll(page);
  await realClick(page, page.locator('[data-node="1"]'));
  await expect(page.locator('#toast')).toContainText('Press Start first');
  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  // Task 2: telling node 0 again is a mistake; then use every tell each round.
  await waitTask(page, 2);
  await realClick(page, page.locator('[data-node="0"]'));
  await expect(page.locator('#toast')).toContainText('already knows');
  let next = 1;
  for (let round = 0; next < MANUAL_N; round++) {
    const slots = Number((await page.locator('#gs-slots').textContent())!.match(/\d+/)![0]);
    for (let k = 0; k < slots && next < MANUAL_N; k++) await realClick(page, page.locator(`[data-node="${next++}"]`));
    if (next < MANUAL_N) await realClick(page, page.locator('#gs-round'));
  }
  await expectTasks(page, 2, T);

  // Task 3: fanout 1 is too slow; fanout 3 passes after its animation.
  await waitTask(page, 3);
  await realClick(page, page.locator('#gs-run'));
  await expect(page.locator('#gs-within')).toHaveClass(/bad-pill/);
  await expect(page.locator('#gs-anim')).toContainText('50 of 50', { timeout: 15_000 });
  await realClick(page, page.locator('[data-f="3"]'));
  await realClick(page, page.locator('#gs-run'));
  await expectTasks(page, 3, T);

  // Task 4: a false alarm on a fresh counter is a mistake; mark each dead node once it is still for the timeout.
  await waitTask(page, 4);
  await realClick(page, page.locator('[data-mark="A"]'));
  await expect(page.locator('#toast')).toContainText('alive');
  for (const p of Object.keys(DEATHS)) {
    await expect.poll(async () => Number(await page.locator(`[data-peer="${p}"]`).getAttribute('data-age')), { timeout: 25_000 }).toBeGreaterThanOrEqual(SUSPECT_AFTER);
    await realClick(page, page.locator(`[data-mark="${p}"]`));
  }

  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'gossip', 1);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'gossip', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
