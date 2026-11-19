/** Light and dark screenshots of every page, saved to tests/e2e/__screenshots__/ for review. */
import { expect, test } from '@playwright/test';
import { builtGames } from '../../src/games/registry';
import { passLearn, realClick } from './helpers';

const dir = 'tests/e2e/__screenshots__';
const pages = [
  { name: 'home', url: './#/' },
  { name: 'privacy', url: './#/privacy' },
  ...builtGames().map((g) => ({ name: `game-${g.id}`, url: `./#/play/${g.id}?seed=1` })),
];

for (const scheme of ['light', 'dark'] as const) {
  test(`screenshots in ${scheme} mode`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('btc:noticeOk', 'true'));
    for (const p of pages) {
      await page.goto(p.url);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      const shot = `${dir}/${info.project.name}-${scheme}-${p.name}.png`;
      await page.screenshot({ path: shot, fullPage: p.name !== 'home' });
      if (p.name.startsWith('game-')) {
        // Mid-tutorial, with the spotlight on.
        await realClick(page, page.locator('#coach-start'));
        // The concept card that opens every game.
        await expect(page.locator('#learn-ov')).toBeVisible();
        await page.screenshot({ path: `${dir}/${info.project.name}-${scheme}-${p.name}-learn.png` });
        await passLearn(page);
        await expect(page.locator('.spot-ring')).toBeVisible();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${dir}/${info.project.name}-${scheme}-${p.name}-tutorial.png` });
      }
    }
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe(scheme === 'dark' ? 'rgb(13, 20, 30)' : 'rgb(233, 237, 241)');
  });
}
