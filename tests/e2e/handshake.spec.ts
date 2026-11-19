import { expect, test, type Page } from '@playwright/test';
import { meta } from '../../src/games/handshake/meta';
import {
  expectFinished, expectNoHorizontalScroll, expectStageControlsFocusable, expectTasks, hudTasks,
  keyboardStart, keyboardTutorial, openGame, playTutorial, realClick, watchErrors,
} from './helpers';

const T = meta.tasks.length;
const waitTask = (page: Page, n: number) => expect(page.locator('#side .eyebrow')).toHaveText(`Task ${n} of ${T}`, { timeout: 10_000 });

/** What a student would send, given their role and the last packet on the ladder. */
async function nextPacket(page: Page): Promise<string> {
  const role = ((await page.locator('#hs-role').textContent()) ?? '').trim();
  const note = ((await page.locator('#hs-note').textContent()) ?? '').trim();
  if (role.includes('server')) return 'SYN-ACK';
  if (note.startsWith('SYN-ACK')) return 'ACK';
  return 'SYN';
}

test('solver completes every task with real mouse clicks, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'handshake', 6);
  await expectNoHorizontalScroll(page);
  await realClick(page, page.locator('[data-pkt="SYN"]'));
  await expect(page.locator('#toast')).toContainText('Press Start first');
  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);

  // Task 2: open 4 connections from either side. A wrong packet first: it is reset and explained.
  await waitTask(page, 2);
  await realClick(page, page.locator('[data-pkt="DATA"]'));
  await expect(page.locator('#toast')).toContainText('No data before the handshake');
  const end = Date.now() + 60_000;
  while ((await hudTasks(page)) !== `2/${T}`) {
    if (Date.now() > end) throw new Error('handshakes took too long');
    await realClick(page, page.locator(`[data-pkt="${await nextPacket(page)}"]`));
  }

  // Task 3: resend whichever segment is marked lost (3 rounds).
  await waitTask(page, 3);
  for (let i = 0; i < 3; i++) {
    const lost = page.locator('.hs-seg.lost');
    await expect(lost).toHaveCount(1);
    const idx = await lost.getAttribute('data-seg');
    await realClick(page, lost);
    if (i < 2) await expect(page.locator('.hs-seg.lost')).not.toHaveAttribute('data-seg', idx!, { timeout: 3000 }).catch(() => {});
  }
  await expectTasks(page, 3, T);

  // Task 4: deliver segments in sequence order (2 rounds).
  await waitTask(page, 4);
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 5; i++) {
      const seq = 1 + i * 1000;
      await realClick(page, page.locator('[data-arr]', { hasText: `seq ${seq}` }).first());
    }
  }
  await expectTasks(page, 4, T);

  // Task 5: try more connections alone (too slow), then keep-alive, then HTTP/2.
  await waitTask(page, 5);
  await realClick(page, page.locator('[data-par="6"]'));
  await realClick(page, page.locator('#hs-load'));
  await expect(page.locator('#hs-ms')).toHaveText('1200 ms');
  await realClick(page, page.locator('#hs-ka'));
  await realClick(page, page.locator('#hs-load'));
  await expect(page.locator('#hs-ms')).toHaveText('600 ms');
  await realClick(page, page.locator('#hs-h2'));
  await realClick(page, page.locator('#hs-load'));

  await expectFinished(page, T);
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('coach bar text changes for each tutorial step', async ({ page }) => {
  await openGame(page, 'handshake', 1);
  await realClick(page, page.locator('#coach-start'));
  await playTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});

test('keyboard only: Tab to Start, Enter through the tutorial', async ({ page }) => {
  await openGame(page, 'handshake', 1);
  await expectStageControlsFocusable(page);
  await keyboardStart(page);
  await keyboardTutorial(page, meta.walkthrough);
  await expectTasks(page, 1, T);
});
