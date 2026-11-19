import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/split-brain/meta';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks, hudTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors,
} from './helpers';

const T = meta.tasks.length;
const node = (page: Page, i: number) => page.locator(`[data-node="${i}"]`);
const link = (page: Page, a: number, b: number) => page.locator(`[data-link="${Math.min(a, b)}-${Math.max(a, b)}"]`);
const roleIndex = (page: Page, role: string) =>
  page.evaluate((r) => {
    const g = document.querySelector(`[data-role="${r}"]`);
    return g ? Number(g.getAttribute('data-node')) : -1;
  }, role);

async function waitTask(page: Page, n: number) {
  await expect(page.locator('#side .eyebrow')).toHaveText(`Task ${n} of ${T}`, { timeout: 10_000 });
}

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
  await expect.poll(() => roleIndex(page, 'leader')).toBeGreaterThanOrEqual(0);
  const L = await roleIndex(page, 'leader');
  const others = [0, 1, 2, 3, 4].filter((i) => i !== L);
  for (const j of others) await toggleLink(page, L, j, true);
  await expect(page.locator('[data-role="leader"]')).toHaveCount(2, { timeout: 15_000 });
  await toggleLink(page, L, others[0], false);
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
