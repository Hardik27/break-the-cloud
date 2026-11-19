import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/byzantine-generals/meta';
import { MAX_TRAITORS, NEED_FOR_3, ROUNDS1, ROUNDS2, decide2 } from '../../src/games/byzantine-generals/sim';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors,
} from './helpers';

const T = meta.tasks.length;
const waitTask = (page: Page, n: number) => expect(page.locator('#side .eyebrow')).toHaveText(`Task ${n} of ${T}`, { timeout: 10_000 });
const flipV = (v: 'A' | 'R') => (v === 'A' ? 'R' : 'A');

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'byzantine-generals', 1);
  await expectNoHorizontalScroll(page);
  await realClick(page, page.locator('#bz-relay'));
  await expect(page.locator('#toast')).toContainText('Press Start first');
  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  // Task 2: an honest first try is a mistake; then lie so the loyal generals split.
  await waitTask(page, 2);
  await realClick(page, page.locator('[data-to="toL1"][data-v="A"]'));
  await realClick(page, page.locator('[data-to="toL2"][data-v="A"]'));
  await realClick(page, page.locator('#bz-send'));
  await expect(page.locator('#toast')).toContainText('agree');
  for (const r of ROUNDS1) {
    await expect(page.locator('#bz-rule')).toContainText(`Round ${ROUNDS1.indexOf(r) + 1} of`);
    if (r.you === 'C') {
      await realClick(page, page.locator('[data-to="toL1"][data-v="A"]'));
      await realClick(page, page.locator('[data-to="toL2"][data-v="R"]'));
    } else await realClick(page, page.locator(`[data-to="relay"][data-v="${flipV(r.order!)}"]`));
    await realClick(page, page.locator('#bz-send'));
  }
  await expectTasks(page, 2, T);

  // Task 3: deciding before hearing the others is a mistake; then hear and take the majority.
  await waitTask(page, 3);
  await realClick(page, page.locator('[data-decide="A"]'));
  await expect(page.locator('#toast')).toContainText('Hear what L2 and L3');
  for (const r of ROUNDS2) {
    await expect(page.locator('#bz-rule')).toContainText(`Round ${ROUNDS2.indexOf(r) + 1} of`);
    await realClick(page, page.locator('#bz-relay'));
    await realClick(page, page.locator(`[data-decide="${decide2(r, 'L1')}"]`));
  }
  await expectTasks(page, 3, T);

  // Task 4: 2 traitors keep agreement, 3 split it; then answer.
  await waitTask(page, 4);
  for (const i of [0, 3]) await realClick(page, page.locator(`[data-gen="${i}"]`));
  await realClick(page, page.locator('#bz-run'));
  await expect(page.locator('#bz-res')).toContainText('agree');
  await realClick(page, page.locator('[data-gen="5"]'));
  await realClick(page, page.locator('#bz-run'));
  await expect(page.locator('#bz-res')).toContainText('SPLIT');
  await realClick(page, page.locator('[data-max="3"]'));
  await expect(page.locator('#toast')).toContainText('split');
  await realClick(page, page.locator(`[data-max="${MAX_TRAITORS}"]`));
  await realClick(page, page.locator(`[data-need="${NEED_FOR_3}"]`));

  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'byzantine-generals', 1);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'byzantine-generals', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
