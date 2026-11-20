import { rankFor } from '../../supabase/functions/_shared/scoring.ts';
import { GAMES, LEVELS, builtGames } from '../games/registry';
import { esc } from '../lib/dom';
import { getBackend, withTimeout } from '../lib/leaderboard';
import type { GameMeta } from '../games/types';
import { allBest, careerPoints, careerStars, dailyDone, deckCount, saveStandup, standup, streak, today } from '../lib/storage';
import { compStatus } from './competition';
import { dailyGameId } from './daily';
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
  const st = streak();
  const daily = built.find((g) => g.id === dailyGameId())!;
  const cards = deckCount();

  let h =
    topbar() +
    `<section class="hero"><div><h1>Break the <span>Cloud</span></h1>
     <p class="lede">Learn how the cloud really works by <b>breaking it on purpose</b>. Five-minute games, from your first load balancer to Raft consensus: learn the idea, break it, watch the replay. Rack up points, earn stars, climb from <b>Intern</b> to <b>Principal Chaos Engineer</b>.</p>
     <div class="row" style="margin-top:16px"><a class="btn go big" id="cta" href="#/play/${firstGame.id}">${fresh ? 'Play your first game' : `Next up: ${esc(firstGame.title)}`} →</a>
     <span class="small" id="home-stats"></span></div></div>
     <div class="card career" id="career"><p class="eyebrow">Your career</p>
      <div class="career-title">${rank.title}</div>
      <p class="career-pts"><b>${fmtPts(pts)}</b> points · <b>${stars}</b> / ${built.length * 3} ★</p>
      <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(rank.progress * 100)}"><i style="width:${(rank.progress * 100).toFixed(1)}%"></i></div>
      <p class="small" style="margin:6px 0 0">${rank.next ? `${fmtPts(rank.next.min - pts)} points to <b>${rank.next.title}</b>. Your best score in each game counts.` : 'Top rank. The cloud fears you.'}</p>
      <div class="career-row"><span class="chip-stat" id="streak">🔥 ${st.days ? `${st.days}-day streak` : 'start a streak today'}</span><a class="chip-stat" href="#/deck" id="deck-link">🃏 ${cards} concept card${cards === 1 ? '' : 's'}</a></div>
      <div class="howto" style="margin-top:12px">
       <div><b>01</b><span>A one-minute explainer, then a tutorial that shows every click.</span></div>
       <div><b>02</b><span>Break the system, task by task. Predict, then watch the replay.</span></div>
       <div><b>03</b><span>Stuck? Hints. The clock pauses whenever you read or watch.</span></div>
       <div><b>04</b><span>Every task adds a card to your concept deck.</span></div>
      </div></div></section>
    <section class="compbanner" id="comp-banner" hidden></section>
    <section class="today"><div class="card daily" id="daily"><p class="eyebrow">📟 Today’s incident · ${today()}</p><h2><a href="#/play/${daily.id}">${esc(daily.title)}</a></h2><p class="pager" id="daily-pager">…</p>
      <div class="row"><a class="btn go" href="#/play/${daily.id}">${dailyDone() ? 'Solved today ✓ · play again' : 'Take the incident →'}</a><span class="small">The same incident for everyone today. Keep your streak alive.</span></div></div>
      <div class="card standupc" id="standup" hidden></div></section>`;
  for (const L of LEVELS) {
    h += `<section class="level" aria-labelledby="lv${L.n}"><div class="lv" id="lv${L.n}">Level ${L.n}<b>${esc(L.name)}</b>${esc(L.sub)}</div><div class="games">`;
    const inLevel = GAMES.filter((x) => x.level === L.n);
    const doneN = inLevel.filter((g) => best[g.id]).length;
    h = h.replace(`<div class="lv" id="lv${L.n}">`, `<div class="lv ${doneN === inLevel.length ? 'cleared' : doneN ? 'started' : ''}" id="lv${L.n}"><span class="station" aria-hidden="true"></span>`);
    h = h.replace(`${esc(L.sub)}</div><div class="games">`, `${esc(L.sub)}<span class="lvprog">${doneN}/${inLevel.length} cleared</span></div><div class="games">`);
    for (const g of inLevel) {
      const b = best[g.id];
      if (g.load) {
        const next = g.id === firstGame.id && !b;
        h += `<a class="game${next ? ' next' : ''}" href="#/play/${g.id}" data-game="${g.id}"><span class="tag ${b ? 'done' : 'live'}">${b ? 'completed' : next ? 'next up · 5 min' : 'play · 5 min'}</span><h3>${esc(g.title)}</h3><p>${esc(g.blurb)}</p><div class="meta"><span>${esc(g.concept)}</span><span>${b ? `${starsHtml(b.stars ?? 1)} ${fmtPts(b.points ?? 0)}` : 'not played'}</span></div></a>`;
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
  // A competition running now (or about to start): banner.
  void (async () => {
    const be = await getBackend();
    const list = await withTimeout(be.activeCompetitions(), 4000, []);
    const ban = app.querySelector<HTMLElement>('#comp-banner');
    if (!alive || !ban || !list.length) return;
    const c = list[0];
    const st = compStatus(c);
    ban.hidden = false;
    ban.innerHTML = `<a class="card compban ${st.phase}" href="#/c/${esc(c.id)}" id="comp-ban-link"><span class="eyebrow" style="margin:0">🏆 Competition</span><b>${esc(c.name)}</b><span class="small">${esc(st.text)}</span><span class="btn go">Leaderboard →</span></a>`;
  })();
  // Today's incident pager line, and the stand-up recall question (from a game you have finished).
  void (async () => {
    const dm = (await daily.load!()).meta as GameMeta;
    const pl = app.querySelector('#daily-pager');
    if (alive && pl) pl.textContent = `📟 ${dm.pager ?? dm.concept}`;
    const played = built.filter((g) => best[g.id]);
    const box = app.querySelector<HTMLElement>('#standup');
    if (!played.length || !box) return;
    const metas = await Promise.all(played.map(async (g) => (await g.load!()).meta as GameMeta));
    if (!alive) return;
    const qs = metas.flatMap((m) => (m.learn ?? []).filter((c) => c?.check).map((c) => ({ m, c: c! })));
    if (!qs.length) return;
    let hsh = 0;
    for (const ch of today()) hsh = (hsh * 33 + ch.charCodeAt(0)) >>> 0;
    const { m, c } = qs[hsh % qs.length];
    const q = c.check!;
    const prev = standup();
    box.hidden = false;
    box.innerHTML = `<p class="eyebrow">☕ Stand-up · one question from ${esc(m.title)}</p><p class="tp-q">${q.q}</p><div class="tp-opts">${q.options.map((o, i) => `<button class="tp-opt" type="button" data-su="${i}">${o}</button>`).join('')}</div><div class="tp-why" hidden></div>${prev?.date === today() ? `<p class="small" style="margin:6px 0 0">Answered today${prev.ok ? ' ✓' : ''}. A new one tomorrow.</p>` : ''}`;
    box.querySelectorAll<HTMLButtonElement>('[data-su]').forEach((b) =>
      b.addEventListener('click', () => {
        const ok = Number(b.dataset.su) === q.answer;
        box.querySelectorAll<HTMLButtonElement>('[data-su]').forEach((x) => {
          x.disabled = true;
          x.classList.toggle('right', Number(x.dataset.su) === q.answer);
          x.classList.toggle('wrong', x === b && !ok);
        });
        const why = box.querySelector<HTMLElement>('.tp-why')!;
        why.hidden = false;
        why.innerHTML = `<b>${ok ? 'You remembered.' : 'Not quite.'}</b> ${q.why}`;
        saveStandup(ok);
      }),
    );
  })();
  return () => {
    alive = false;
  };
}
