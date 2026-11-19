import { expect, test } from '@playwright/test';
import { meta } from '../../src/games/crdt-merge/meta';
import { G_ROUNDS, SET_ROUNDS, WANT_INC, gMerge, naiveMerges, orMerge } from '../../src/games/crdt-merge/sim';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors, waitTask,
} from './helpers';

const T = meta.tasks.length;

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'crdt-merge', 1);
  await expectNoHorizontalScroll(page);
  await realClick(page, page.locator('[data-inc="0"]'));
  await expect(page.locator('#toast')).toContainText('Press Start first');
  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  // Task 2: syncing early is refused; like, sync, then pick the total (the sum is a mistake).
  await waitTask(page, 2);
  await realClick(page, page.locator('#cr-sync'));
  await expect(page.locator('#toast')).toContainText('Finish the likes');
  for (let i = 0; i < WANT_INC[0]; i++) await realClick(page, page.locator('[data-inc="0"]'));
  for (let i = 0; i < WANT_INC[1]; i++) await realClick(page, page.locator('[data-inc="1"]'));
  await realClick(page, page.locator('#cr-sync'));
  const n = naiveMerges(WANT_INC);
  await realClick(page, page.locator(`[data-total="${n.sum}"]`));
  await expect(page.locator('#toast')).toContainText('twice');
  await realClick(page, page.locator(`[data-total="${n.correct}"]`));
  await expectTasks(page, 2, T);

  // Task 3: G-counter merges, max per entry; the sum on the first slot is a mistake.
  await waitTask(page, 3);
  for (const r of G_ROUNDS) {
    const m = gMerge(r.va, r.vb);
    if (r === G_ROUNDS[0]) {
      await realClick(page, page.locator(`[data-slot="0"][data-val="${r.va[0] + r.vb[0]}"]`));
      await expect(page.locator('#toast')).toContainText('twice');
    }
    for (let k = 0; k < 3; k++) await realClick(page, page.locator(`[data-slot="${k}"][data-val="${m[k]}"]`));
  }
  await expectTasks(page, 3, T);

  // Task 4: OR-set lists.
  await waitTask(page, 4);
  for (const r of SET_ROUNDS) {
    await expect(page.locator('#cr-logs')).toContainText(r.before[0].item);
    for (const it of orMerge(r)) await realClick(page, page.locator(`[data-item="${it}"]`));
    await realClick(page, page.locator('#cr-merge'));
  }

  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'crdt-merge', 1);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'crdt-merge', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
