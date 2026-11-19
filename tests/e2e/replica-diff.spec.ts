import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/replica-diff/meta';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors,
} from './helpers';

const T = meta.tasks.length;

/** Rows whose source and replica text differ, read from the page like a careful student would. */
const differingRows = (page: Page) =>
  page.evaluate(() => {
    const rows = (side: string) => [...document.querySelectorAll(`#rd-${side} tr`)].map((tr) => tr.textContent);
    const s = rows('src'), d = rows('dst');
    return s.map((t, i) => (t !== d[i] ? i : -1)).filter((i) => i >= 0);
  });

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'replica-diff', 21);
  await expectNoHorizontalScroll(page);

  await realClick(page, page.locator('[data-row="src-0"]'), { offsetX: 40 });
  await expect(page.locator('#toast')).toContainText('Press Start first');

  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  for (let round = 1; round < T; round++) {
    await expect(page.locator('#rd-round')).toHaveText(`${round + 1}/${T}`);
    const diffs = await differingRows(page);
    expect(diffs.length).toBe(round === T - 1 ? 3 : 1);
    if (round === 1) {
      // A wrong flag costs 5 seconds and says so.
      const wrong = [...Array(12).keys()].find((i) => !diffs.includes(i))!;
      await realClick(page, page.locator(`[data-row="src-${wrong}"]`), { offsetX: 40 });
      await expect(page.locator('#toast')).toContainText('+5 s');
      const secs = async () => Number(((await page.locator('#hud-time').textContent()) ?? '0:0').split(':')[1]);
      await expect.poll(secs).toBeGreaterThanOrEqual(5);
    }
    for (const i of diffs) await realClick(page, page.locator(`[data-row="src-${i}"]`), { offsetX: 40 });
    await expectTasks(page, round + 1, T);
    if (round < T - 1) await realClick(page, page.locator('#rd-next'));
  }
  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'replica-diff', 3);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expect(page.locator('#coach-text')).toContainText('etag');
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'replica-diff', 3);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
