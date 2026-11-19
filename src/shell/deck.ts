/**
 * Concept deck (#/deck): every lesson you have unlocked, grouped by level, as a printable cheat sheet.
 * Locked lessons show which game unlocks them.
 */
import { LEVELS, builtGames } from '../games/registry';
import type { GameMeta } from '../games/types';
import { esc } from '../lib/dom';
import { deck } from '../lib/storage';
import { bindTopbar, footer, topbar } from './chrome';

export function renderDeck(app: HTMLElement): () => void {
  let alive = true;
  app.innerHTML = topbar() + `<section class="deckpage"><p class="eyebrow"><a href="#/">← All games</a></p><h1>Your concept <span>deck</span></h1>
    <p class="lede">Every task you clear adds a card: the idea in two or three sentences and a real system that uses it. Revise from it before an exam or an interview.</p>
    <div class="row"><button class="btn" type="button" id="deck-print">Print or save as PDF</button><span class="small" id="deck-count"></span></div>
    <div id="deck-body"><p class="small">Loading…</p></div></section>` + footer();
  bindTopbar(app);
  app.querySelector('#deck-print')!.addEventListener('click', () => window.print());
  void (async () => {
    const games = builtGames();
    const metas = await Promise.all(games.map(async (g) => (await g.load!()).meta as GameMeta));
    if (!alive) return;
    const got = deck();
    let have = 0, total = 0;
    let h = '';
    for (const L of LEVELS) {
      const ms = metas.filter((m) => m.level === L.n);
      if (!ms.length) continue;
      h += `<section class="decklevel"><h2>Level ${L.n} · ${esc(L.name)}</h2>`;
      for (const m of ms) {
        const un = new Set(got[m.id] ?? []);
        h += `<div class="deckgame"><h3><a href="#/play/${m.id}">${esc(m.title)}</a> <span class="small">${esc(m.concept)}</span></h3><div class="deckcards">`;
        m.tasks.forEach((t, i) => {
          total++;
          if (un.has(i)) {
            have++;
            h += `<article class="dcard" data-card="${m.id}-${i}"><p class="eyebrow">${esc(t)}</p><p>${m.lessons[i]}</p></article>`;
          } else h += `<article class="dcard locked"><p class="eyebrow">🔒 ${esc(t)}</p><p class="small">Clear this task in <a href="#/play/${m.id}">${esc(m.title)}</a> to unlock.</p></article>`;
        });
        h += `</div></div>`;
      }
      h += `</section>`;
    }
    app.querySelector('#deck-body')!.innerHTML = h;
    app.querySelector('#deck-count')!.textContent = `${have} of ${total} cards collected`;
  })();
  return () => {
    alive = false;
  };
}
