import { rankFor } from '../../supabase/functions/_shared/scoring.ts';
import { GAMES, LEVELS, builtGames } from '../games/registry';
import { esc } from '../lib/dom';
import { getBackend, withTimeout } from '../lib/leaderboard';
import { allBest, careerPoints, careerStars } from '../lib/storage';
import { bindTopbar, fmtPts, footer, topbar } from './chrome';

const starsHtml = (n: number, of = 3) => `<span class="stars" aria-label="${n} of ${of} stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(of - n)}</span></span>`;

export function renderHome(app: HTMLElement): () => void {
  let alive = true;
  const best = allBest();
  const built = builtGames();
  const pts = careerPoints();
  const rank = rankFor(pts);
  const stars = careerStars();
  const firstGame = built.find((g) => !best[g.id]) ?? built[0];
  const fresh = !Object.keys(best).length;

  let h =
    topbar() +
    `<section class="hero"><div><h1>Break the <span>Cloud</span></h1>
     <p class="lede">Learn how the cloud really works by <b>breaking it on purpose</b>. Two-minute games, from your first load balancer to Raft consensus. Rack up points, earn stars, climb from <b>Intern</b> to <b>Principal Chaos Engineer</b>.</p>
     <div class="row" style="margin-top:16px"><a class="btn go big" id="cta" href="#/play/${firstGame.id}">${fresh ? 'Play your first game' : `Next up: ${esc(firstGame.title)}`} →</a>
     <span class="small" id="home-stats"></span></div></div>
     <div class="card career" id="career"><p class="eyebrow">Your career</p>
      <div class="career-title">${rank.title}</div>
      <p class="career-pts"><b>${fmtPts(pts)}</b> points · <b>${stars}</b> / ${built.length * 3} ★</p>
      <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(rank.progress * 100)}"><i style="width:${(rank.progress * 100).toFixed(1)}%"></i></div>
      <p class="small" style="margin:6px 0 0">${rank.next ? `${fmtPts(rank.next.min - pts)} points to <b>${rank.next.title}</b>. Your best score in each game counts.` : 'Top rank. The cloud fears you.'}</p>
      <div class="howto" style="margin-top:12px">
       <div><b>01</b><span>A short tutorial shows you every click.</span></div>
       <div><b>02</b><span>Break the system, task by task. Fast and clean = more points.</span></div>
       <div><b>03</b><span>Chain good moves for combos. Mistakes cost points.</span></div>
       <div><b>04</b><span>Post your score, then send it to your friends.</span></div>
      </div></div></section>`;
  for (const L of LEVELS) {
    h += `<section class="level" aria-labelledby="lv${L.n}"><div class="lv" id="lv${L.n}">Level ${L.n}<b>${esc(L.name)}</b>${esc(L.sub)}</div><div class="games">`;
    for (const g of GAMES.filter((x) => x.level === L.n)) {
      const b = best[g.id];
      if (g.load) {
        h += `<a class="game" href="#/play/${g.id}" data-game="${g.id}"><span class="tag ${b ? 'done' : 'live'}">${b ? 'completed' : 'play · 2 min'}</span><h3>${esc(g.title)}</h3><p>${esc(g.blurb)}</p><div class="meta"><span>${esc(g.concept)}</span><span>${b ? `${starsHtml(b.stars ?? 1)} ${fmtPts(b.points ?? 0)}` : 'not played'}</span></div></a>`;
      } else {
        h += `<div class="game soon" aria-disabled="true" data-game="${g.id}"><span class="tag">coming soon</span><h3>${esc(g.title)}</h3><p>${esc(g.blurb)}</p><div class="meta"><span>${esc(g.concept)}</span></div></div>`;
      }
    }
    h += `</div></section>`;
  }
  h += footer();
  app.innerHTML = h;
  bindTopbar(app);

  // Public stats line (shared leaderboard only).
  void (async () => {
    const be = await getBackend();
    const s = await withTimeout(be.stats(), 4000, null);
    const line = app.querySelector('#home-stats');
    if (alive && line && s && s.finished > 0) line.textContent = `${fmtPts(s.started)} runs started · ${fmtPts(s.finished)} finished by players so far`;
  })();
  return () => {
    alive = false;
  };
}
