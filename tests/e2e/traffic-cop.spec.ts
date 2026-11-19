import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/traffic-cop/meta';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks, hudTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors,
} from './helpers';

const T = meta.tasks.length;

/** Route each waiting request to the server with the most free space, until the task completes. */
async function routeByHand(page: Page, untilTasks: string) {
  const end = Date.now() + 60_000;
  while ((await hudTasks(page)) !== untilTasks) {
    if (Date.now() > end) throw new Error('routing by hand took too long');
    const size = Number(await page.locator('#tc-rq').getAttribute('data-size'));
    if (!size) {
      await page.waitForTimeout(40);
      continue;
    }
    const loads = await page.locator('[data-srv]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-load'))));
    let best = 0, bf = -1;
    loads.forEach((l, i) => {
      const f = 4 - l;
      if (f >= size && f > bf) { bf = f; best = i; }
    });
    await realClick(page, page.locator(`[data-srv="${best}"]`));
  }
}

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'traffic-cop', 11);
  await expectNoHorizontalScroll(page);

  // A click before Start is not silent: it explains what to do.
  await realClick(page, page.locator('[data-srv="0"]'));
  await expect(page.locator('#toast')).toContainText('Press Start first');

  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
  await expect(page.locator('#hud-time')).not.toHaveText('0:00.0'); // clock starts after the tutorial

  // Task 2: route by hand while requests animate in.
  await expect(page.locator('#side .eyebrow')).toHaveText(`Task 2 of ${T}`, { timeout: 10_000 });
  await routeByHand(page, `2/${T}`);

  // Task 3: round robin, then health checks after the crash.
  await expect(page.locator('#side .eyebrow')).toHaveText(`Task 3 of ${T}`, { timeout: 10_000 });
  await realClick(page, page.locator('[data-s="rr"]'));
  await expect(page.locator('[data-s="rr"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tc-hc')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#coach-text')).toContainText('Health checks');
  await realClick(page, page.locator('#tc-hc'));
  await expect(page.locator('#tc-hc')).toHaveAttribute('aria-pressed', 'true');
  await expectTasks(page, 3, T, 40_000);

  // Task 4: least loaded.
  await expect(page.locator('#side .eyebrow')).toHaveText(`Task 4 of ${T}`, { timeout: 10_000 });
  await realClick(page, page.locator('[data-s="least"]'));
  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);

  // The best time is saved locally and shown on the home page.
  await page.goto('./#/');
  await expect(page.locator('[data-game="traffic-cop"] .tag')).toHaveText('completed');
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'traffic-cop', 5);
  await expect(page.locator('#coach-text')).toContainText('press Start');
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expect(page.locator('#lesson')).toContainText(meta.tasks[0]);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'traffic-cop', 5);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('skip tutorial starts the clock and the first real task', async ({ page }) => {
  await openGame(page, 'traffic-cop', 5);
  await realClick(page, page.locator('#start-btn'));
  await expect(page.locator('.spot-ring')).toBeVisible();
  // Clicks on the dimmed area explain themselves (wait for the coach to finish scrolling the target into view).
  await page.waitForTimeout(400);
  const blocks = await page.locator('.spot-block').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2, area: r.width * r.height })),
  );
  const big = blocks.sort((a, b) => b.area - a.area)[0];
  await page.mouse.click(big.x, big.y);
  await expect(page.locator('#toast')).toContainText('Tutorial');
  await realClick(page, page.locator('.coach-skip'));
  await expectTasks(page, 1, T);
  await expect(page.locator('#side .eyebrow')).toHaveText(`Task 2 of ${T}`, { timeout: 10_000 });
});
