import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/heartbeat/meta';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks, hudTasks,
  keyboardStart, openGame, realClick, watchErrors,
} from './helpers';

const T = meta.tasks.length;
const row = (page: Page, i: number) => page.locator(`[data-hb="${i}"]`);

/** Patient failure detector: evict after 2.6 s of silence; add replacements back when ready. */
async function detectByHand(page: Page) {
  const end = Date.now() + 60_000;
  while ((await hudTasks(page)) !== `2/${T}`) {
    if (Date.now() > end) throw new Error('catching crashes took too long');
    const rows = await page.locator('[data-hb]').evaluateAll((els) =>
      els.map((e) => ({ pool: e.getAttribute('data-pool'), st: e.querySelector('.st')?.textContent ?? '' })),
    );
    const i = rows.findIndex((r) => r.pool === 'ready' || (r.pool === '1' && /silent (\d+\.\d)/.test(r.st) && Number(/silent (\d+\.\d)/.exec(r.st)![1]) >= 2.6));
    if (i < 0) {
      await page.waitForTimeout(100);
      continue;
    }
    await realClick(page, row(page, i));
    await page.waitForTimeout(150);
  }
}

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'heartbeat', 2);
  await expectNoHorizontalScroll(page);
  await realClick(page, row(page, 0));
  await expect(page.locator('#toast')).toContainText('Press Start first');
  await realClick(page, page.locator('#start-btn'));

  // Tutorial: evict web-3, wait for its replacement, add it back. The coach text changes at each step.
  await expect(page.locator('#coach-text')).toHaveText(meta.walkthrough[0].text);
  await realClick(page, row(page, 2));
  await expect(page.locator('#coach-text')).toHaveText(meta.walkthrough[1].text);
  await expect(row(page, 2)).toHaveAttribute('data-pool', 'ready', { timeout: 6000 });
  await realClick(page, row(page, 2));
  await expectTasks(page, 1, T);

  await expect(page.locator('#side .eyebrow')).toHaveText(`Task 2 of ${T}`, { timeout: 10_000 });
  await detectByHand(page);

  // Task 3: the starting setting falsely evicts; a 1 s × 5 detector does not.
  await expect(page.locator('#side .eyebrow')).toHaveText(`Task 3 of ${T}`, { timeout: 10_000 });
  await realClick(page, page.locator('#hb-run'));
  await expect(page.locator('#hb-false')).toHaveText('2');
  await realClick(page, page.locator('[data-int="1000"]'));
  await realClick(page, page.locator('[data-thr="5"]'));
  await realClick(page, page.locator('#hb-run'));
  await expectTasks(page, 3, T);

  // Task 4: starts too slow (2 s × 5); 2 s × 3 is fast and safe.
  await expect(page.locator('#side .eyebrow')).toHaveText(`Task 4 of ${T}`, { timeout: 10_000 });
  await realClick(page, page.locator('#hb-run'));
  await expect(page.locator('#hb-detect')).toHaveText('9.0 s');
  await realClick(page, page.locator('[data-thr="3"]'));
  await realClick(page, page.locator('#hb-run'));

  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'heartbeat', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await expect(page.locator('#coach-text')).toHaveText(meta.walkthrough[0].text);
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-hb'))).toBe('2');
  await page.keyboard.press('Enter');
  await expect(page.locator('#coach-text')).toHaveText(meta.walkthrough[1].text);
  await expect(row(page, 2)).toHaveAttribute('data-pool', 'ready', { timeout: 6000 });
  await row(page, 2).focus();
  await page.keyboard.press('Enter');
  await expectTasks(page, 1, T);
});
