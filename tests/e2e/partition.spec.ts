import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/partition/meta';
import { MERGE_ROUNDS, PROMPTS, SYSTEMS, correctMerge } from '../../src/games/partition/sim';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors,
} from './helpers';

const T = meta.tasks.length;
const waitTask = (page: Page, n: number) => expect(page.locator('#side .eyebrow')).toHaveText(`Task ${n} of ${T}`, { timeout: 10_000 });

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'partition', 1);
  await expectNoHorizontalScroll(page);
  await realClick(page, page.locator('#pt-accept'));
  await expect(page.locator('#toast')).toContainText('Press Start first');
  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  // Task 2: accepting a London withdrawal is a mistake with an explanation; then decide correctly.
  await waitTask(page, 2);
  for (let i = 0; i < PROMPTS.length; i++) {
    await expect(page.locator('#pt-prompt')).toContainText(PROMPTS[i].text);
    if (i === 0) {
      await realClick(page, page.locator('#pt-accept'));
      await expect(page.locator('#toast')).toContainText('spent twice');
      continue;
    }
    await realClick(page, page.locator(PROMPTS[i].accept ? '#pt-accept' : '#pt-reject'));
  }
  await expectTasks(page, 2, T);

  // Task 3: merge both carts.
  await waitTask(page, 3);
  for (const r of MERGE_ROUNDS) {
    for (const it of correctMerge(r)) await realClick(page, page.locator(`[data-item="${it}"]`));
    await realClick(page, page.locator('#pt-merge'));
  }
  await expectTasks(page, 3, T);

  // Task 4: classify the systems.
  await waitTask(page, 4);
  for (let i = 0; i < SYSTEMS.length; i++) await realClick(page, page.locator(`[data-sys="${i}"][data-pick="${SYSTEMS[i].cp ? 'cp' : 'ap'}"]`));

  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'partition', 1);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'partition', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
