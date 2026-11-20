import { expect, test } from '@playwright/test';
import { meta } from '../../src/games/cache-hit/meta';
import { expectNoHorizontalScroll, playTutorial, realClick, watchErrors } from './helpers';

test('an instructor creates a class, a learner joins and plays, and the report shows it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    localStorage.setItem('btc:noticeOk', 'true');
    localStorage.setItem('btc:muted', 'true');
    (window as unknown as { __BTC_LB__?: string }).__BTC_LB__ = 'mock';
  });
  await page.goto('./#/');
  await realClick(page, page.locator('footer a[href="#/classes/new"]'));
  await expect(page.locator('#class-form')).toBeVisible();
  // Validation, then a real class.
  await realClick(page, page.locator('#cf-create'));
  await expect(page.locator('#cf-msg')).toContainText('name');
  await page.fill('#cf-name', 'Jetking Nashik');
  await page.fill('#cf-city', 'Nashik');
  await page.fill('#cf-course', 'Cloud Computing');
  await realClick(page, page.locator('#cf-create'));
  const code = (await page.locator('#made-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  const adminLink = await page.locator('#made-admin').inputValue();
  expect(adminLink).toContain(`#/class/${code}?key=`);
  await expectNoHorizontalScroll(page);

  // The learner joins (same browser here, same in-memory backend).
  await page.evaluate((c) => (location.hash = `#/join/${c}`), code);
  await expect(page.locator('#join-name')).toHaveText('Jetking Nashik');
  // A name is required so the instructor can tell learners apart.
  await realClick(page, page.locator('#join-btn'));
  await expect(page.locator('#join-msg')).toContainText('Type your name');
  await page.fill('#join-nick', 'riya_k');
  await realClick(page, page.locator('#join-btn'));
  await expect(page.locator('#classchip')).toContainText('Jetking Nashik');

  // Play a game far enough to start a run (the clock starts after the tutorial).
  await page.evaluate(() => (location.hash = '#/play/cache-hit?seed=1'));
  await realClick(page, page.locator('#start-btn'));
  await playTutorial(page, meta.walkthrough);
  await expect(page.locator('#hud-tasks')).toHaveText('1/4');
  // The leaderboard opens on the class tab.
  await expect(page.locator('[data-range="class"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#board-body')).toContainText('Jetking Nashik');

  // The instructor report counts the learner and the game.
  await page.evaluate((h) => (location.hash = h.slice(h.indexOf('#'))), adminLink);
  await expect(page.locator('#rep-name')).toHaveText('Jetking Nashik');
  await expect(page.locator('#rep-learners')).toHaveText('1');
  await expect(page.locator('#report')).toContainText('riya_k');
  await expect(page.locator('[data-rep-game="cache-hit"] td').nth(2)).toHaveText('1');
  await expectNoHorizontalScroll(page);

  // A wrong key shows an error, not the report.
  await page.evaluate((c) => (location.hash = `#/class/${c}?key=WRONG`), code);
  await expect(page.locator('#report')).toContainText('wrong class code or instructor key');
  expect(errors).toEqual([]);
});
