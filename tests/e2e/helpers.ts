import { expect, type Locator, type Page } from '@playwright/test';
import type { CoachStep } from '../../src/games/types';

/**
 * Click like a person: move the real mouse to the element, press, hold 120 ms, release.
 * This proves clicks land while the game is animating (the v1 bug: buttons rebuilt every frame ate clicks).
 * offsetX clicks that many px from the element's left edge instead of its centre (for wide table rows).
 */
export async function realClick(page: Page, target: Locator, opts: { offsetX?: number } = {}): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(60); // let the spotlight follow a scroll
  const box = await target.boundingBox();
  if (!box) throw new Error('element has no box: ' + target.toString());
  const x = opts.offsetX !== undefined ? box.x + Math.min(opts.offsetX, box.width / 2) : box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.up();
}

/** Collects console errors and uncaught exceptions. */
export function watchErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text());
  });
  page.on('pageerror', (e) => errs.push(e.message));
  return errs;
}

/** Opens a game. lb: which leaderboard backend the page uses ('offline' by default, 'mock' for an in-memory board). */
export async function openGame(page: Page, id: string, seed: number, opts: { lb?: 'mock' | 'offline' } = {}): Promise<void> {
  await page.addInitScript((lb) => {
    try {
      localStorage.setItem('btc:noticeOk', 'true');
      localStorage.setItem('btc:muted', 'true');
    } catch {
      /* ignore */
    }
    (window as unknown as { __BTC_LB__?: string }).__BTC_LB__ = lb;
  }, opts.lb ?? 'offline');
  await page.goto(`./#/play/${id}?seed=${seed}`);
  await expect(page.locator('#start-btn')).toBeVisible();
  // Web fonts swapping in reflow the page; wait so clicks land where we measured.
  await page.evaluate(() => document.fonts.ready);
}

export const coachText = (page: Page) => page.locator('#coach-text');
export const hudTasks = async (page: Page) => (await page.locator('#hud-tasks').textContent()) ?? '';

export async function expectTasks(page: Page, done: number, total: number, timeout = 10_000): Promise<void> {
  await expect(page.locator('#hud-tasks')).toHaveText(`${done}/${total}`, { timeout });
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(r.sw, 'page must not scroll sideways').toBeLessThanOrEqual(r.cw);
}

/**
 * Plays the spotlight tutorial with real clicks on each highlighted target.
 * Asserts the coach bar shows each step's text, and that the text changes at every step.
 */
export async function playTutorial(page: Page, steps: CoachStep[]): Promise<void> {
  await passLearn(page);
  let prev = '';
  for (const st of steps) {
    await expect(coachText(page)).toHaveText(st.text);
    const now = (await coachText(page).textContent()) ?? '';
    expect(now, 'coach text must change at each step').not.toBe(prev);
    prev = now;
    await expect(page.locator('.spot-ring')).toBeVisible();
    // Wide table rows: click near the left edge so the point is inside the scroll box on phones.
    await realClick(page, page.locator(st.target).first(), st.target.startsWith('[data-row') ? { offsetX: 40 } : {});
  }
  await expect(page.locator('.spot-ring')).toHaveCount(0);
  await expect(coachText(page)).not.toHaveText(steps[steps.length - 1].text);
}

/** Presses Tab until the Start button has focus, then Enter. */
export async function keyboardStart(page: Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => document.activeElement?.id ?? '');
    if (id === 'coach-start' || id === 'start-btn') {
      await page.keyboard.press('Enter');
      await keyboardLearn(page);
      return;
    }
  }
  throw new Error('Start button not reachable with Tab');
}

/** Every control in the stage must be keyboard focusable. */
export async function expectStageControlsFocusable(page: Page): Promise<void> {
  const bad = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#stage button, #stage [role="button"], #stage tr[data-row]')]
      .filter((e) => e.tabIndex < 0 || e.hasAttribute('disabled'))
      .map((e) => e.outerHTML.slice(0, 80)),
  );
  expect(bad).toEqual([]);
}

/** Completes the tutorial with the keyboard only: the coach focuses each target, Enter performs the step. */
export async function keyboardTutorial(page: Page, steps: CoachStep[]): Promise<void> {
  for (const st of steps) {
    await expect(coachText(page)).toHaveText(st.text);
    await expect
      .poll(() => page.evaluate((sel) => document.activeElement === document.querySelector(sel), st.target), { message: `focus on ${st.target}` })
      .toBe(true);
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('.spot-ring')).toHaveCount(0);
}

export async function expectFinished(page: Page, total: number, timeout = 40_000): Promise<void> {
  await expectTasks(page, total, total, timeout);
  // The last task's debrief: the student opens the results.
  await expect(page.locator('#debrief-next')).toBeVisible({ timeout: 10_000 });
  await realClick(page, page.locator('#debrief-next'));
  await expect(page.locator('#result')).toBeVisible();
  // Points, stars, grades and encouragement are shown.
  await expect(page.locator('#result .stars .on').first()).toBeVisible();
  await expect.poll(async () => Number(((await page.locator('#result-points').textContent()) ?? '0').replace(/,/g, ''))).toBeGreaterThan(500);
  await expect(page.locator('#result-grades .gchip')).toHaveCount(total - 1);
  await expect(page.locator('#result-cheer')).not.toBeEmpty();
  await expect(page.locator('#learn')).toBeVisible();
  await expect(page.locator('#learn a[href^="https://"]')).toHaveCount(3);
}

/** Clicks through a concept card (frames, then the quick check) if one is open or about to open. */
export async function passLearn(page: Page): Promise<void> {
  const ov = page.locator('#learn-ov');
  try {
    await ov.waitFor({ state: 'visible', timeout: 1500 });
  } catch {
    return;
  }
  for (let k = 0; k < 30 && (await ov.isVisible()); k++) {
    const next = page.locator('#learn-next');
    const opt = page.locator('#learn-ov .tp-opt[data-ok]');
    const go = page.locator('#learn-go');
    if (await next.isVisible()) await realClick(page, next);
    else if (await go.isVisible()) await realClick(page, go);
    else if ((await opt.isVisible()) && (await opt.isEnabled())) await realClick(page, opt);
    else await page.waitForTimeout(100);
  }
  await expect(ov).toHaveCount(0);
}

/** Keyboard only: Enter through a concept card; the right answer of the check is focused and chosen with Enter. */
export async function keyboardLearn(page: Page): Promise<void> {
  const ov = page.locator('#learn-ov');
  try {
    await ov.waitFor({ state: 'visible', timeout: 1500 });
  } catch {
    return;
  }
  for (let k = 0; k < 30 && (await ov.isVisible()); k++) {
    if (await page.locator('#learn-next').isVisible()) {
      await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('learn-next');
      await page.keyboard.press('Enter');
    } else if (await page.locator('#learn-go').isVisible()) {
      await page.locator('#learn-go').focus();
      await page.keyboard.press('Enter');
    } else {
      await page.locator('#learn-ov .tp-opt[data-ok]').focus();
      await page.keyboard.press('Enter');
    }
  }
  await expect(ov).toHaveCount(0);
}

/** Answers a prediction prompt (the right answer, unless `wrong`). */
export async function answerPredict(page: Page, wrong = false): Promise<void> {
  const ov = page.locator('#predict-ov');
  await expect(ov).toBeVisible({ timeout: 10_000 });
  await realClick(page, page.locator(wrong ? '#predict-ov .tp-opt:not([data-ok])' : '#predict-ov .tp-opt[data-ok]').first());
}

/** Skips to the end of the replay that is playing. */
export async function skipReplay(page: Page): Promise<void> {
  await expect(page.locator('#replay-skip')).toBeVisible({ timeout: 10_000 });
  await realClick(page, page.locator('#replay-skip'));
}

/**
 * Moves on to task n (1-based, as shown in the side card): presses Next on the task-clear debrief,
 * clicks through the concept card, then waits for the side card to show the task.
 */
export async function waitTask(page: Page, n: number): Promise<void> {
  const total = Number(((await page.locator('#hud-tasks').textContent()) ?? '0/0').split('/')[1]);
  const want = `Task ${n} of ${total}`;
  const eyebrow = page.locator('#side .eyebrow');
  for (let k = 0; k < 80; k++) {
    if ((await eyebrow.textContent()) === want && !(await page.locator('#learn-ov').isVisible())) return;
    if (await page.locator('#debrief-next').isVisible()) await realClick(page, page.locator('#debrief-next'));
    else if (await page.locator('#learn-ov').isVisible()) await passLearn(page);
    else await page.waitForTimeout(150);
  }
  await expect(eyebrow).toHaveText(want);
}
