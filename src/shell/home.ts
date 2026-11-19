import { GAMES, LEVELS, builtGames } from '../games/registry';
import { esc, fmtTime } from '../lib/dom';
import { allBest } from '../lib/storage';
import { footer, topbar } from './chrome';

export function renderHome(app: HTMLElement): () => void {
  const best = allBest();
  const built = builtGames();
  const done = built.filter((g) => best[g.id]).length;
  let h =
    topbar() +
    `<section class="hero"><div><h1>Break the <span>Cloud</span></h1>
     <p class="lede">Learn how cloud systems work by <b>breaking them on purpose</b>. Each game is a few short tasks, from your first load balancer to Raft consensus. A tutorial shows you every click, and every task ends with the lesson it was built to teach.</p></div>
     <div class="card howto"><p class="eyebrow">How it works</p>
      <div><b>01</b><span>Read a short brief: the concept, and what is on screen.</span></div>
      <div><b>02</b><span>Press Start. A guided tutorial shows you the controls. The clock starts after it.</span></div>
      <div><b>03</b><span>Break the system on purpose, task by task. Each task ends with a lesson.</span></div>
      <div><b>04</b><span>Finish every task to set a time. Beat it later.</span></div>
      <p class="small" style="margin:6px 0 0" id="home-progress">${done} of ${built.length} playable games completed in this browser.</p></div></section>`;
  for (const L of LEVELS) {
    h += `<section class="level" aria-labelledby="lv${L.n}"><div class="lv" id="lv${L.n}">Level ${L.n}<b>${esc(L.name)}</b>${esc(L.sub)}</div><div class="games">`;
    for (const g of GAMES.filter((x) => x.level === L.n)) {
      const b = best[g.id];
      if (g.load) {
        h += `<a class="game" href="#/play/${g.id}" data-game="${g.id}"><span class="tag ${b ? 'done' : 'live'}">${b ? 'completed' : 'play'}</span><h3>${esc(g.title)}</h3><p>${esc(g.blurb)}</p><div class="meta"><span>${esc(g.concept)}</span><span>${b ? 'best ' + fmtTime(b.ms) : 'not played'}</span></div></a>`;
      } else {
        h += `<div class="game soon" aria-disabled="true" data-game="${g.id}"><span class="tag">coming soon</span><h3>${esc(g.title)}</h3><p>${esc(g.blurb)}</p><div class="meta"><span>${esc(g.concept)}</span></div></div>`;
      }
    }
    h += `</div></section>`;
  }
  h += footer();
  app.innerHTML = h;
  return () => {};
}
