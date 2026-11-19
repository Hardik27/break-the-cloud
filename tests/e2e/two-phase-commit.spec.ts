import { expect, test } from '@playwright/test';
import { meta } from '../../src/games/two-phase-commit/meta';
import { BLOCKED, RECOVERIES, TRANSFERS, allYes } from '../../src/games/two-phase-commit/sim';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors, waitTask,
} from './helpers';

const T = meta.tasks.length;

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'two-phase-commit', 1);
  await expectNoHorizontalScroll(page);
  await realClick(page, page.locator('#tp-prepare'));
  await expect(page.locator('#toast')).toContainText('Press Start first');
  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  // Task 2: deciding before Prepare is explained; then prepare, wait for votes, decide.
  await waitTask(page, 2);
  await realClick(page, page.locator('#tp-commit'));
  await expect(page.locator('#toast')).toContainText('Click Prepare first');
  for (const tx of TRANSFERS) {
    await expect(page.locator('#tp-card')).toContainText(tx.text);
    await realClick(page, page.locator('#tp-prepare'));
    await expect(page.locator('#tp-b .tp-st')).not.toHaveText(/voting/);
    await realClick(page, page.locator(allYes(tx) ? '#tp-commit' : '#tp-abort'));
  }
  await expectTasks(page, 2, T);

  // Task 3: recover B from its log; guessing when in doubt is a mistake with an explanation.
  await waitTask(page, 3);
  for (const r of RECOVERIES) {
    await expect(page.locator('#tp-card')).toContainText(r.log[r.log.length - 1]);
    if (r.answer === 'ask' && r === RECOVERIES.find((x) => x.answer === 'ask')) {
      await realClick(page, page.locator('[data-act="commit"]'));
      await expect(page.locator('#toast')).toContainText('Ask the coordinator');
    }
    await realClick(page, page.locator(`[data-act="${r.answer}"]`));
  }
  await expectTasks(page, 3, T);

  // Task 4: ask A, then decide or wait (the wait blocks for a few seconds, locks held).
  await waitTask(page, 4);
  for (const b of BLOCKED) {
    await expect(page.locator('#tp-card')).toContainText(b.tx);
    await realClick(page, page.locator('#tp-askpeer'));
    await expect(page.locator('#tp-peer')).toBeVisible();
    await realClick(page, page.locator(`[data-act3="${b.answer}"]`));
    if (b.answer === 'wait') {
      await expect(page.locator('#tp-queued')).not.toHaveText('0');
      await expect(page.locator('#tp-card')).not.toContainText(b.tx, { timeout: 10_000 });
    }
  }

  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'two-phase-commit', 1);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'two-phase-commit', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
