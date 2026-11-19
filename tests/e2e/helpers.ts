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

export async function openGame(page: Page, id: string, seed: number): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('btc:noticeOk', 'true');
    } catch {
      /* ignore */
    }
  });
  await page.goto(`./#/play/${id}?seed=${seed}`);
  await expect(page.locator('#start-btn')).toBeVisible();
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
  let prev = 'Read the brief, then press Start.'; // the shell's message before Start
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
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#learn')).toBeVisible();
  await expect(page.locator('#learn a[href^="https://"]')).toHaveCount(3);
}
