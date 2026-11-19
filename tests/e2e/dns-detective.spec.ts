import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/dns-detective/meta';
import { DOMAINS } from '../../src/games/dns-detective/sim';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks, hudTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors, waitTask,
} from './helpers';

const T = meta.tasks.length;
const node = (page: Page, id: string) => page.locator(`[data-node="${id}"]`);

/** Resolve one lookup the way a careful student would: cache if fresh, else walk the tree. */
async function resolveOne(page: Page, useCache: boolean) {
  const name = ((await page.locator('#dns-name').textContent()) ?? '').trim();
  const d = DOMAINS.find((x) => x.name === name);
  if (!d) throw new Error(`unknown name ${name}`);
  await realClick(page, node(page, 'resolver'));
  const fresh = useCache && (await page.locator('#dns-cache li:not(.stale) b', { hasText: name }).count()) > 0;
  if (fresh) return realClick(page, node(page, 'cache'));
  for (const id of ['root', d.tld, d.auth]) await realClick(page, node(page, id));
}

async function solveLookups(page: Page, untilTasks: string, useCache: boolean) {
  const end = Date.now() + 60_000;
  while ((await hudTasks(page)) !== untilTasks) {
    if (Date.now() > end) throw new Error(`timed out before ${untilTasks}`);
    await resolveOne(page, useCache);
  }
}

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'dns-detective', 3);
  await expectNoHorizontalScroll(page);
  await realClick(page, node(page, 'root'));
  await expect(page.locator('#toast')).toContainText('Press Start first');

  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  await waitTask(page, 2);
  // A wrong hop is a mistake with an explanation.
  await realClick(page, node(page, 'root'));
  await expect(page.locator('#toast')).toContainText('resolver');
  await expect(page.locator('.pop.bad')).toBeVisible();
  await solveLookups(page, `2/${T}`, false);

  await waitTask(page, 3);
  await solveLookups(page, `3/${T}`, true);

  await waitTask(page, 4);
  await expect(page.locator('#dns-notice')).toBeVisible();
  await solveLookups(page, `4/${T}`, true);

  await waitTask(page, 5);
  // Too short a TTL fails, then the right answers for each scenario.
  await realClick(page, page.locator('[data-ttl="60"]'));
  await realClick(page, page.locator('#dns-run'));
  await expect(page.locator('#dns-result .bad-pill')).toBeVisible();
  await realClick(page, page.locator('[data-ttl="300"]'));
  await realClick(page, page.locator('#dns-run'));
  await expect(page.locator('#dns-sc-title')).toContainText('Record 2', { timeout: 5000 });
  await realClick(page, page.locator('[data-ttl="3600"]'));
  await realClick(page, page.locator('#dns-run'));

  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'dns-detective', 1);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'dns-detective', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
