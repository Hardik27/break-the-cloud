import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/split-brain/meta';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks, hudTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors, waitTask,
} from './helpers';

const T = meta.tasks.length;
const node = (page: Page, i: number) => page.locator(`[data-node="${i}"]`);
const link = (page: Page, a: number, b: number) => page.locator(`[data-link="${Math.min(a, b)}-${Math.max(a, b)}"]`);
const roleIndex = (page: Page, role: string) =>
  page.evaluate((r) => {
    const g = document.querySelector(`[data-role="${r}"]`);
    return g ? Number(g.getAttribute('data-node')) : -1;
  }, role);

async function toggleLink(page: Page, a: number, b: number, cut: boolean) {
  const l = link(page, a, b);
  await realClick(page, l);
  await expect(l).toHaveAttribute('data-cut', cut ? '1' : '0');
}

/** Restart any crashed server; otherwise crash the leader. Repeat until the task completes. */
async function knockOutLeaders(page: Page, untilTasks: string, timeoutMs: number) {
  const end = Date.now() + timeoutMs;
  while ((await hudTasks(page)) !== untilTasks) {
    if (Date.now() > end) throw new Error('knocking out leaders took too long');
    const down = await roleIndex(page, 'down');
    if (down >= 0) {
      await realClick(page, node(page, down));
      continue;
    }
    const lead = await roleIndex(page, 'leader');
    if (lead >= 0) await realClick(page, node(page, lead));
    else await page.waitForTimeout(150);
  }
}

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'split-brain', 4);
  await expectNoHorizontalScroll(page);

  await realClick(page, node(page, 0));
  await expect(page.locator('#toast')).toContainText('Press Start first');

  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  // Depose: two new leaders.
  await waitTask(page, 2);
  await knockOutLeaders(page, `2/${T}`, 40_000);

  // Two crowns: isolate the leader, wait for a second crown, then reconnect it.
  await waitTask(page, 3);
  // The leader can change while we work, so re-read it until the old one is stranded with a second crown.
  let L = -1;
  const end = Date.now() + 40_000;
  while ((await page.locator('[data-role="leader"]').count()) < 2) {
    if (Date.now() > end) throw new Error('never saw two crowns');
    const cur = await roleIndex(page, 'leader');
    if (cur < 0) {
      await page.waitForTimeout(150);
      continue;
    }
    L = cur;
    for (const j of [0, 1, 2, 3, 4].filter((i) => i !== L)) {
      if ((await link(page, L, j).getAttribute('data-cut')) === '0') await toggleLink(page, L, j, true);
    }
    await page.waitForTimeout(300);
  }
  // Reconnect the stranded leader (the one in the older term) so it steps down.
  const stale = await page.evaluate(() => {
    const ls = [...document.querySelectorAll('[data-role="leader"]')].map((g) => ({ i: Number(g.getAttribute('data-node')), term: Number((g.querySelector('text:nth-of-type(2)')?.textContent ?? '').replace(/\D/g, '')) }));
    return ls.sort((a, b) => a.term - b.term)[0].i;
  });
  const back = [0, 1, 2, 3, 4].find((j) => j !== stale)!;
  if ((await link(page, stale, back).getAttribute('data-cut')) === '1') await toggleLink(page, stale, back, false);
  await expectTasks(page, 3, T, 15_000);

  // Silence: 8 cuts, links only (crashing is refused with a toast).
  await waitTask(page, 4);
  await realClick(page, node(page, 0));
  await expect(page.locator('#toast')).toContainText('Links only');
  const keep = new Set(['0-1', '2-3']);
  for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) if (!keep.has(`${a}-${b}`)) await toggleLink(page, a, b, true);
  await expectTasks(page, 4, T, 25_000);

  // Storm: keep knocking out leaders.
  await waitTask(page, 5);
  await knockOutLeaders(page, `5/${T}`, 60_000);

  await expectFinished(page, T);
  await expect(page.locator('.bad-pill')).toHaveCount(0); // the safety monitor never broke
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'split-brain', 2);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'split-brain', 2);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
