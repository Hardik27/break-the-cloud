import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/cache-hit/meta';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks, hudTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors,
} from './helpers';

const T = meta.tasks.length;
const waitTask = (page: Page, n: number) => expect(page.locator('#side .eyebrow')).toHaveText(`Task ${n} of ${T}`, { timeout: 10_000 });

/** On each miss, evict the cached page seen least often (or skip if the new page is even rarer). */
async function beTheCache(page: Page) {
  const end = Date.now() + 90_000;
  while ((await hudTasks(page)) !== `2/${T}`) {
    if (Date.now() > end) throw new Error('never reached the hit rate');
    if (!(await page.locator('#ch-skip').isVisible())) {
      await page.waitForTimeout(60);
      continue;
    }
    const st = await page.evaluate(() => {
      const seen: Record<string, number> = {};
      document.querySelectorAll('.ch-key').forEach((r) => (seen[r.querySelector('.nm')!.textContent!] = Number(r.querySelector('.c')!.textContent)));
      const slots = [...document.querySelectorAll('.ch-slot')].map((b) => (b.classList.contains('empty') ? null : b.querySelector('.k')!.textContent!));
      const pending = document.querySelector('#ch-req b')?.textContent ?? '';
      return { seen, slots, pending };
    });
    let i = st.slots.indexOf(null);
    if (i < 0) {
      i = 0;
      st.slots.forEach((k, j) => st.seen[k!] < st.seen[st.slots[i]!] && (i = j));
      if (st.seen[st.slots[i]!] > st.seen[st.pending]) {
        await realClick(page, page.locator('#ch-skip'));
        continue;
      }
    }
    await realClick(page, page.locator(`[data-slot="${i}"]`));
  }
}

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'cache-hit', 3);
  await expectNoHorizontalScroll(page);
  await realClick(page, page.locator('[data-slot="0"]'));
  await expect(page.locator('#toast')).toContainText('Press Start first');
  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  await waitTask(page, 2);
  await beTheCache(page);

  // Task 3: try the wrong policy once, then the right ones.
  await waitTask(page, 3);
  await realClick(page, page.locator('[data-pat="0"][data-pol="lru"]'));
  await realClick(page, page.locator('[data-run="0"]'));
  await expect(page.locator('[data-out="0"]')).toContainText('only');
  await realClick(page, page.locator('[data-pat="0"][data-pol="lfu"]'));
  await realClick(page, page.locator('[data-run="0"]'));
  await realClick(page, page.locator('[data-pat="1"][data-pol="lru"]'));
  await realClick(page, page.locator('[data-run="1"]'));
  await expectTasks(page, 3, T);

  // Task 4: invalidate whenever the cached price is stale.
  await waitTask(page, 4);
  const end = Date.now() + 40_000;
  while ((await hudTasks(page)) !== `4/${T}`) {
    if (Date.now() > end) throw new Error('stale task took too long');
    if (await page.locator('.ch-stbox.stale').count()) await realClick(page, page.locator('#ch-inv'));
    else await page.waitForTimeout(80);
  }
  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'cache-hit', 1);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'cache-hit', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
