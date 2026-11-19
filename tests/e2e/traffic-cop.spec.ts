import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/traffic-cop/meta';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks, hudTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors, waitTask,
} from './helpers';

const T = meta.tasks.length;

interface Srv { load: number; up: boolean; rot: boolean }
const servers = (page: Page) =>
  page.locator('[data-srv]').evaluateAll((els) =>
    els.map((e) => ({ load: Number(e.getAttribute('data-load')), up: e.getAttribute('data-up') === '1', rot: e.getAttribute('data-rot') === '1' })),
  ) as Promise<Srv[]>;

function bestFit(list: Srv[], size: number): number {
  let best = 0, bf = -1;
  list.forEach((s, i) => {
    const f = s.up ? 4 - s.load : -1;
    if (f >= size && f > bf) { bf = f; best = i; }
  });
  return best;
}

/** Loops `act` until the HUD shows `untilTasks` done. */
async function until(page: Page, untilTasks: string, act: () => Promise<void>, ms = 60_000) {
  const end = Date.now() + ms;
  while ((await hudTasks(page)) !== untilTasks) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${untilTasks}`);
    await act();
  }
}

/** Route each waiting request (or only heavy ones) to the server with the most room. */
const routeRequests = (page: Page, onlyHeavy = false) => async () => {
  const k = await page.locator('#tc-rq').getAttribute('data-k');
  if (!k || (onlyHeavy && k !== 'heavy')) return void (await page.waitForTimeout(40));
  const size = Number(await page.locator('#tc-rq').getAttribute('data-size'));
  await realClick(page, page.locator(`[data-srv="${bestFit(await servers(page), size)}"]`));
};

/** Pull dead servers out of rotation and put recovered ones back. */
const keepRotation = (page: Page) => async () => {
  const list = await servers(page);
  const i = list.findIndex((s) => s.up !== s.rot);
  if (i < 0) return void (await page.waitForTimeout(80));
  await realClick(page, page.locator(`[data-srv="${i}"]`));
  await page.waitForTimeout(150); // the loop re-reads state; between tasks a click only shows a toast
};

test('solver completes every task with real mouse clicks; scores, posts and shares', async ({ page }, info) => {
  const errors = watchErrors(page);
  await openGame(page, 'traffic-cop', 11, { lb: 'mock' });
  await expectNoHorizontalScroll(page);

  // A click before Start is not silent: it explains what to do.
  await realClick(page, page.locator('[data-srv="0"]'));
  await expect(page.locator('#toast')).toContainText('Press Start first');

  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
  await waitTask(page, 2);
  await expect(page.locator('#hud-points')).toHaveText('100'); // tutorial bonus
  await expect(page.locator('#hud-time')).not.toHaveText('0:00.0'); // clock starts after the tutorial

  // Task 2: rush hour by hand.
  await waitTask(page, 2);
  await until(page, `2/${T}`, routeRequests(page));
  await expect(page.locator('#tasks [data-task="1"] .grade')).toBeVisible();

  // Task 3: round robin autopilot; pull crashed servers and return them.
  await waitTask(page, 3);
  await realClick(page, page.locator('[data-s="rr"]'));
  await expect(page.locator('[data-s="rr"]')).toHaveAttribute('aria-pressed', 'true');
  await until(page, `3/${T}`, keepRotation(page));

  // Task 4: override round robin on heavy requests.
  await waitTask(page, 4);
  await until(page, `4/${T}`, routeRequests(page, true));

  // Task 5: boss wave: least loaded, and pull the dead server.
  await waitTask(page, 5);
  await realClick(page, page.locator('[data-s="least"]'));
  await until(page, `5/${T}`, keepRotation(page));

  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);

  // The run is validated and posted to the (mock) leaderboard, then the player picks a nickname.
  await expect(page.locator('#post-status')).toContainText('Posted', { timeout: 10_000 });
  const nick = page.locator('#result-nick input');
  await nick.fill('ab');
  await nick.press('Enter');
  await expect(page.locator('#result-nick .nickmsg')).toContainText('at least 3');
  await nick.fill('packet_pusher'); // taken by a rival on the mock board
  await nick.press('Enter');
  await expect(page.locator('#result-nick .nickmsg')).toContainText('taken');
  await nick.fill('test_cop');
  await nick.press('Enter');
  await expect(page.locator('#board-body')).toContainText('test_cop (you)');
  await expect(page.locator('#board-me')).toContainText('Your rank');
  await realClick(page, page.locator('[data-range="week"]'));
  await expect(page.locator('[data-range="week"]')).toHaveAttribute('aria-selected', 'true');
  await page.locator('#result').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500); // let the count-up and confetti finish
  await page.screenshot({ path: `tests/e2e/__screenshots__/${info.project.name}-light-traffic-cop-result.png`, fullPage: true });

  // Share copies a Wordle-style result (or shows it when the clipboard is unavailable).
  await realClick(page, page.locator('#share-btn'));
  await expect(page.locator('#toast')).toContainText(/Copied|Break the Cloud/);

  // Best score, stars and rank show on the home page.
  await page.goto('./#/');
  await expect(page.locator('[data-game="traffic-cop"] .tag')).toHaveText('completed');
  await expect(page.locator('[data-game="traffic-cop"] .stars')).toBeVisible();
  await expect(page.locator('#rankchip')).toHaveText(/· [1-9][\d,]* pts$/);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'traffic-cop', 5);
  await expect(page.locator('#coach-text')).toContainText('Press Start');
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  // The task-clear debrief shows the lesson on the stage.
  await expect(page.locator('#debrief')).toContainText(meta.tasks[0]);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'traffic-cop', 5);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('skip tutorial starts the clock; mistakes cost points and show feedback', async ({ page }) => {
  await openGame(page, 'traffic-cop', 5);
  await realClick(page, page.locator('#start-btn'));
  await expect(page.locator('.spot-ring')).toBeVisible();
  // Clicks on the dimmed area explain themselves (wait for the coach to finish scrolling the target into view).
  await page.waitForTimeout(400);
  // Find a point whose top element really is the dim layer (not the callout or the raised coach bar).
  const big = await page.evaluate(() => {
    for (const b of document.querySelectorAll('.spot-block')) {
      const r = b.getBoundingClientRect();
      for (const [fx, fy] of [[0.5, 0.5], [0.1, 0.1], [0.9, 0.9], [0.1, 0.9], [0.9, 0.1]]) {
        const x = r.x + r.width * fx, y = r.y + r.height * fy;
        if (r.width > 4 && r.height > 4 && document.elementFromPoint(x, y) === b) return { x, y };
      }
    }
    return null;
  });
  if (!big) throw new Error('no visible dim area');
  await page.mouse.click(big.x, big.y);
  await expect(page.locator('#toast')).toContainText('Tutorial');
  await realClick(page, page.locator('.coach-skip'));
  await expectTasks(page, 1, T);
  await waitTask(page, 2);
  // Let a request time out: that is a mistake, shown as a red popup.
  await expect(page.locator('.pop.bad')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#tc-drops')).not.toHaveText('0');
});
