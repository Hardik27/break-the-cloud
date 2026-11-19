import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/circuit-breaker/meta';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks, hudTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors,
} from './helpers';

const T = meta.tasks.length;
const waitTask = (page: Page, n: number) => expect(page.locator('#side .eyebrow')).toHaveText(`Task ${n} of ${T}`, { timeout: 10_000 });

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'circuit-breaker', 1);
  await expectNoHorizontalScroll(page);
  await realClick(page, page.locator('#cb-switch'));
  await expect(page.locator('#toast')).toContainText('Press Start first');
  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  // Task 2: open when threads climb, probe while open, close after a good probe.
  await waitTask(page, 2);
  const end = Date.now() + 60_000;
  let lastProbe = 0;
  while ((await hudTasks(page)) !== `2/${T}`) {
    if (Date.now() > end) throw new Error('breaker task took too long');
    const open = (await page.locator('#cb-switch').getAttribute('aria-pressed')) === 'true';
    const busy = Number(((await page.locator('#cb-tn').textContent()) ?? '0/20').split('/')[0]);
    const probeOk = ((await page.locator('#cb-probe-res').textContent()) ?? '').startsWith('✓');
    if (!open && busy >= 6) await realClick(page, page.locator('#cb-switch'));
    else if (open && probeOk) await realClick(page, page.locator('#cb-switch'));
    else if (open && Date.now() - lastProbe > 1200) {
      lastProbe = Date.now();
      await realClick(page, page.locator('#cb-probe'));
    } else await page.waitForTimeout(100);
  }

  // Task 3: tripping on 1 failure opens on blips; 5 is right.
  await waitTask(page, 3);
  await realClick(page, page.locator('#cb-run'));
  await expect(page.locator('#cb-false')).toHaveClass(/bad-pill/);
  await realClick(page, page.locator('[data-th="5"]'));
  await realClick(page, page.locator('#cb-run'));
  await expectTasks(page, 3, T);

  // Task 4: probing every second hammers the service; every 5 s is right.
  await waitTask(page, 4);
  await realClick(page, page.locator('#cb-run'));
  await expect(page.locator('#cb-probes')).toHaveClass(/bad-pill/);
  await realClick(page, page.locator('[data-probe="5"]'));
  await realClick(page, page.locator('#cb-run'));

  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'circuit-breaker', 1);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'circuit-breaker', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
