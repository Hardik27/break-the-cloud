/**
 * Classes for training centres and colleges:
 *   #/classes/new             an instructor creates a class: join code + secret instructor link
 *   #/join/<CODE>             a learner joins; their runs are tagged with the code from then on
 *   #/class/<CODE>?key=<KEY>  the instructor report: learners, per-game progress, CSV export
 */
import { GAMES, builtGames } from '../games/registry';
import { esc } from '../lib/dom';
import { getBackend, withTimeout, type ClassReport } from '../lib/leaderboard';
import { joinClass, leaveClass, myClass } from '../lib/storage';
import { bindTopbar, footer, toast, topbar } from './chrome';

const siteUrl = () => location.href.split('#')[0];
const page = (inner: string) => topbar() + `<section class="classpage">${inner}</section>` + footer();
const copyBtn = (id: string, label = 'Copy') => `<button class="btn ghost" type="button" data-copy="${id}">${label}</button>`;

function bindCopy(app: HTMLElement) {
  app.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((b) =>
    b.addEventListener('click', () => {
      const v = (app.querySelector<HTMLInputElement>('#' + b.dataset.copy)?.value ?? '').trim();
      navigator.clipboard?.writeText(v).then(() => toast('Copied.')).catch(() => toast(v));
      if (!navigator.clipboard) toast(v);
    }),
  );
}

// ---------- join ----------
export function renderJoin(app: HTMLElement, code: string): () => void {
  let alive = true;
  app.innerHTML = page(`<p class="eyebrow"><a href="#/">← All games</a></p><h1>Join a <span>class</span></h1><div class="card" id="join-card"><p class="small">Looking up class ${esc(code)}…</p></div>`);
  bindTopbar(app);
  void (async () => {
    const b = await getBackend();
    const info = await withTimeout(b.classInfo(code), 6000, null);
    if (!alive) return;
    const card = app.querySelector<HTMLElement>('#join-card')!;
    if (!info) {
      card.innerHTML = b.kind === 'offline'
        ? '<p>Classes need the shared leaderboard, which is not set up on this site yet.</p>'
        : `<p>No class with the code <b>${esc(code)}</b>. Check the code with your instructor.</p>`;
      return;
    }
    const joined = myClass()?.code === info.code;
    card.innerHTML = `<p class="eyebrow">Class ${esc(info.code)}</p><h2 id="join-name">${esc(info.name)}</h2><p class="small">${esc(info.city)}${info.course ? ` · ${esc(info.course)}` : ''}</p>
      <p>Joining means your game results (points, stars, time, and your nickname if you set one) are shared with this class’s instructor. Nothing else.</p>
      <div class="row">${joined ? `<span class="ok-pill">You are in this class</span><button class="btn ghost" type="button" id="leave-btn">Leave class</button>` : `<button class="btn go" type="button" id="join-btn">Join ${esc(info.name)}</button>`}<a class="btn ghost" href="#/" style="text-decoration:none">Go to the games →</a></div>`;
    card.querySelector('#join-btn')?.addEventListener('click', () => {
      joinClass({ code: info.code, name: info.name, city: info.city });
      toast(`Joined ${info.name}. Your runs now count for this class.`);
      location.hash = '#/';
    });
    card.querySelector('#leave-btn')?.addEventListener('click', () => {
      leaveClass();
      toast('You left the class. Future runs are not shared with it.');
      location.hash = '#/';
    });
  })();
  return () => {
    alive = false;
  };
}

// ---------- create ----------
export function renderNewClass(app: HTMLElement): () => void {
  let alive = true;
  app.innerHTML = page(`<p class="eyebrow"><a href="#/">← All games</a> · for instructors</p><h1>Create a <span>class</span></h1>
    <p class="lede">For training centres and colleges. Your learners join with a short code; you get a live report of who played what, how far they got and how well they did. Free.</p>
    <form class="card classform" id="class-form" novalidate>
      <label for="cf-name">Centre or class name</label><input id="cf-name" maxlength="80" placeholder="e.g. Jetking Nashik, Cloud batch 3" autocomplete="organization">
      <label for="cf-city">City</label><input id="cf-city" maxlength="60" placeholder="e.g. Nashik" autocomplete="address-level2">
      <label for="cf-course">Course (optional)</label><input id="cf-course" maxlength="80" placeholder="e.g. Cloud Computing & DevOps">
      <div class="row"><button class="btn go" type="submit" id="cf-create">Create class</button><span class="small" id="cf-msg" role="status"></span></div>
    </form><div id="class-made"></div>`);
  bindTopbar(app);
  const form = app.querySelector<HTMLFormElement>('#class-form')!;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (id: string) => app.querySelector<HTMLInputElement>('#' + id)!.value.trim();
    const msg = app.querySelector('#cf-msg')!;
    if (v('cf-name').length < 3 || v('cf-city').length < 2) {
      msg.textContent = 'Give the class a name (3+ characters) and a city.';
      return;
    }
    msg.textContent = 'Creating…';
    const b = await getBackend();
    const r = await withTimeout(b.createClass(v('cf-name'), v('cf-city'), v('cf-course')), 8000, { ok: false as const, reason: 'The server did not answer. Try again.' });
    if (!alive) return;
    if (!r.ok) {
      msg.textContent = r.reason;
      return;
    }
    msg.textContent = '';
    form.hidden = true;
    const join = `${siteUrl()}#/join/${r.code}`;
    const admin = `${siteUrl()}#/class/${r.code}?key=${r.key}`;
    app.querySelector('#class-made')!.innerHTML = `<div class="card classmade">
      <p class="eyebrow">Class created</p><div class="bigcode" id="made-code">${r.code}</div>
      <label for="made-join">Learners: share this link (or the code)</label><div class="row"><input id="made-join" readonly value="${esc(join)}">${copyBtn('made-join')}</div>
      <label for="made-admin">You: your instructor link. <b>Save it now: it is shown only once</b> and is the only way to see the report.</label>
      <div class="row"><input id="made-admin" readonly value="${esc(admin)}">${copyBtn('made-admin')}</div>
      <div class="row"><a class="btn go" href="#/class/${r.code}?key=${r.key}" id="made-open" style="text-decoration:none">Open the report →</a><button class="btn ghost" type="button" id="made-print">Print a poster for the lab</button></div></div>
      <div class="poster" id="poster"><p>Labs powered by</p><h2>Break the <span>Cloud</span></h2><p>Join our class:</p><div class="bigcode">${r.code}</div><p>${esc(join)}</p></div>`;
    bindCopy(app);
    app.querySelector('#made-print')!.addEventListener('click', () => {
      document.body.classList.add('print-poster');
      window.print();
      setTimeout(() => document.body.classList.remove('print-poster'), 500);
    });
  });
  return () => {
    alive = false;
  };
}

// ---------- report ----------
export function renderClassReport(app: HTMLElement, code: string, key: string | undefined): () => void {
  let alive = true;
  app.innerHTML = page(`<p class="eyebrow"><a href="#/">← All games</a> · instructor report</p><h1>Class <span>${esc(code)}</span></h1><div id="report"><p class="small">Loading…</p></div>`);
  bindTopbar(app);
  const box = app.querySelector<HTMLElement>('#report')!;
  if (!key) {
    box.innerHTML = `<form class="card classform" id="key-form"><label for="key-in">Instructor key (from your instructor link)</label><input id="key-in" maxlength="40" autocomplete="off"><div class="row"><button class="btn go" type="submit">Open report</button></div></form>`;
    box.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      const k = box.querySelector<HTMLInputElement>('#key-in')!.value.trim();
      if (k) location.hash = `#/class/${code}?key=${encodeURIComponent(k)}`;
    });
    return () => {};
  }
  void (async () => {
    const b = await getBackend();
    const r = await withTimeout(b.classReport(code, key), 8000, { ok: false as const, reason: 'The server did not answer. Try again.' });
    if (!alive) return;
    if (!r.ok) {
      box.innerHTML = `<div class="card"><p>${esc(r.reason)}</p></div>`;
      return;
    }
    draw(box, r.report);
  })();
  return () => {
    alive = false;
  };
}

const titleOf = (id: string) => GAMES.find((g) => g.id === id)?.title ?? id;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');

function draw(box: HTMLElement, rep: ClassReport) {
  const s = rep.summary;
  const built = builtGames();
  const byGame = new Map(rep.games.map((g) => [g.game_id, g]));
  const completion = s.learners ? Math.round((100 * rep.learners.reduce((a, l) => a + l.games_finished, 0)) / (s.learners * built.length)) : 0;
  box.innerHTML = `<div class="card"><h2 id="rep-name">${esc(rep.class.name)}</h2><p class="small">${esc(rep.class.city)}${rep.class.course ? ` · ${esc(rep.class.course)}` : ''} · created ${day(rep.class.created_at)} · join code <b>${esc(rep.class.code)}</b></p>
      <div class="tiles"><div><b id="rep-learners">${s.learners}</b><span>learners</span></div><div><b>${s.runs_started}</b><span>games started</span></div><div><b id="rep-finished">${s.runs_finished}</b><span>games finished</span></div><div><b>${completion}%</b><span>of the course completed</span></div><div><b>${day(s.last_activity)}</b><span>last activity</span></div></div>
      <div class="row"><button class="btn" type="button" id="rep-csv">Download CSV</button><button class="btn ghost" type="button" id="rep-print">Print</button><span class="small">Labs powered by Break the Cloud</span></div></div>
    <div class="card"><p class="eyebrow">Progress per game</p><div class="tablewrap"><table class="rep"><thead><tr><th>Level</th><th>Game</th><th>Started</th><th>Finished</th><th>Avg points</th><th>Avg ★</th></tr></thead><tbody>${built
      .map((g) => {
        const x = byGame.get(g.id);
        return `<tr data-rep-game="${g.id}"><td>${g.level}</td><td>${esc(g.title)}</td><td>${x?.learners_started ?? 0}</td><td>${x?.learners_finished ?? 0}</td><td>${x?.avg_points ?? '–'}</td><td>${x?.avg_stars ?? '–'}</td></tr>`;
      })
      .join('')}</tbody></table></div></div>
    <div class="card"><p class="eyebrow">Learners</p>${rep.learners.length ? `<div class="tablewrap"><table class="rep"><thead><tr><th>Learner</th><th>Games finished</th><th>Points</th><th>Last active</th></tr></thead><tbody>${rep.learners
      .map((l) => `<tr><td>${esc(l.name)}</td><td>${l.games_finished} / ${built.length}</td><td>${l.points}</td><td>${day(l.last_active)}</td></tr>`)
      .join('')}</tbody></table></div>` : `<p class="small">Nobody has joined yet. Share the join link: <b>${esc(siteUrl())}#/join/${esc(rep.class.code)}</b></p>`}</div>`;
  box.querySelector('#rep-print')!.addEventListener('click', () => window.print());
  box.querySelector('#rep-csv')!.addEventListener('click', () => {
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['learner', 'games_finished', 'points', 'last_active'], ...rep.learners.map((l) => [l.name, l.games_finished, l.points, l.last_active])];
    rows.push([], ['game', 'learners_started', 'learners_finished', 'avg_points', 'avg_stars']);
    built.forEach((g) => {
      const x = byGame.get(g.id);
      rows.push([titleOf(g.id), x?.learners_started ?? 0, x?.learners_finished ?? 0, x?.avg_points ?? '', x?.avg_stars ?? '']);
    });
    const blob = new Blob([rows.map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `break-the-cloud-${rep.class.code}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}
