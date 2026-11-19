import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/the-ring/meta';
import { KEYS, NEW_SERVER, RING_SERVERS, hash100, owner } from '../../src/games/the-ring/sim';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors, waitTask, answerPredict, skipReplay,
} from './helpers';

const T = meta.tasks.length;
const currentKey = async (page: Page) => ((await page.locator('#rg-key b').first().textContent()) ?? '').trim();

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'the-ring', 1);
  await expectNoHorizontalScroll(page);
  await realClick(page, page.locator('[data-srv="0"]'));
  await expect(page.locator('#toast')).toContainText('Press Start first');
  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  // Task 2: add S3, then place every key with hash mod 4 (one wrong click first).
  await waitTask(page, 2);
  await realClick(page, page.locator('#rg-add'));
  const first = await currentKey(page);
  await realClick(page, page.locator(`[data-srv="${(hash100(first) % 4 + 1) % 4}"]`));
  await expect(page.locator('#toast')).toContainText('mod 4');
  for (let i = 0; i < KEYS.length; i++) {
    const k = await currentKey(page);
    await realClick(page, page.locator(`[data-srv="${hash100(k) % 4}"]`));
  }
  await expectTasks(page, 2, T);

  // Task 3: place keys clockwise, then click the keys that move to D.
  await waitTask(page, 3);
  for (let i = 0; i < KEYS.length; i++) {
    const k = await currentKey(page);
    await realClick(page, page.locator(`[data-rsrv="${owner(RING_SERVERS, hash100(k))}"]`));
  }
  const movers = KEYS.filter((k) => owner([...RING_SERVERS, NEW_SERVER], hash100(k)) !== owner(RING_SERVERS, hash100(k)));
  for (const k of movers) await realClick(page, page.locator(`[data-key="${k}"]`));
  await expectTasks(page, 3, T);

  // Task 4: one virtual node is lopsided; 50 balances the ring.
  await waitTask(page, 4);
  await realClick(page, page.locator('#rg-run'));
  await answerPredict(page);
  await skipReplay(page);
  await expect(page.locator('#rg-imb')).toHaveClass(/bad-pill/);
  await realClick(page, page.locator('[data-vn="50"]'));
  await realClick(page, page.locator('#rg-run'));
  await answerPredict(page);
  await skipReplay(page);

  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'the-ring', 1);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'the-ring', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
