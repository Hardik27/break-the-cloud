/**
 * Competitions:
 *   #/competitions/new          organiser creates one (name, link, start, end) → public link + organiser link (shown once)
 *   #/c/<id>[?code=<JOIN>]       public: status, join with the code, rules, live overall and per-level leaderboards, projector mode
 *   #/c/<id>/me                  the player's report card (rank overall and per level, best score per game)
 *   #/c/<id>/admin?key=<KEY>     organiser: join code, final standings + CSV, level winners, verify a claim, disqualify, finalists' runs
 * Only members (who joined with the join code) are ranked. Joining issues a claim code for this competition only.
 */
import { GAMES, LEVELS } from '../games/registry';
import { esc, fmtTime } from '../lib/dom';
import { getBackend, withTimeout, type CompAdmin, type CompInfo, type CompRow } from '../lib/leaderboard';
import { bindTopbar, fmtPts, footer, toast, topbar } from './chrome';
import { bookHtml } from './book';
import { bindNickField, nickFieldHtml, showClaimDialog } from './identity';

const site = () => location.href.split('#')[0];
const page = (inner: string) => topbar() + `<section class="classpage comppage">${inner}</section>` + footer();
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const title = (id: string) => GAMES.find((g) => g.id === id)?.title ?? id;

export function compStatus(c: CompInfo, now = Date.now()): { phase: 'upcoming' | 'live' | 'ended'; text: string } {
  const s = Date.parse(c.starts_at), e = Date.parse(c.ends_at);
  const left = (ms: number) => {
    const h = Math.floor(ms / 3600_000), d = Math.floor(h / 24);
    return d >= 1 ? `${d} day${d > 1 ? 's' : ''} ${h % 24} h` : `${h} h ${Math.floor((ms % 3600_000) / 60_000)} min`;
  };
  if (now < s) return { phase: 'upcoming', text: `Starts ${when(c.starts_at)} (in ${left(s - now)})` };
  if (now <= e) return { phase: 'live', text: `Live · ends ${when(c.ends_at)} (${left(e - now)} left)` };
  return { phase: 'ended', text: `Ended ${when(c.ends_at)} · final results` };
}

const RULES = (c: CompInfo) => `<ol class="rules">
  <li><b>Join with the code</b> from the organiser (on the poster, or already in your link) and a nickname. Only players who joined are ranked. No email or phone is collected.</li>
  <li><b>Save your claim code</b> (screenshot it). It works only for this competition. Prize winners must show their nickname and claim code.</li>
  <li><b>Only games finished between ${when(c.starts_at)} and ${when(c.ends_at)} count.</b> For each game your best score counts; your total is the sum over all 24 games.</li>
  <li><b>Level boards</b> add up the games of one level. <b>Ties:</b> more points, then more stars, then whoever reached the score first.</li>
  <li><b>Play in one browser, not incognito.</b> Progress lives in that browser.</li>
  <li><b>Fair play:</b> scores are checked on the server. Finalists may be asked to replay a game live before prizes are given. One player per person.</li>
</ol>`;

// ---------- public page ----------
export function renderCompetition(app: HTMLElement, id: string, joinCode = ''): () => void {
  let alive = true;
  let level: number | null = null;
  let timer = 0;
  app.innerHTML = page(`<p class="eyebrow"><a href="#/">← All games</a> · competition</p><h1 id="comp-title">…</h1><div id="comp-body"><p class="small">Loading…</p></div>`);
  bindTopbar(app);
  void (async () => {
    const b = await getBackend();
    let c = await withTimeout(b.competitionInfo(id), 6000, null);
    if (!alive) return;
    const body = app.querySelector<HTMLElement>('#comp-body')!;
    if (!c) {
      app.querySelector('#comp-title')!.textContent = 'Competition not found';
      body.innerHTML = `<p>${b.kind === 'offline' ? 'Competitions need the shared leaderboard, which is not set up on this site yet.' : 'Check the link with the organiser.'}</p>`;
      return;
    }
    app.querySelector('#comp-title')!.innerHTML = `🏆 ${esc(c.name)}`;
    const st = compStatus(c);
    body.innerHTML = `<div class="card compstatus ${st.phase}"><b id="comp-status">${esc(st.text)}</b>
        <div class="row"><a class="btn go" href="#/" style="text-decoration:none">${st.phase === 'ended' ? 'Practise the games' : 'Play now'} →</a><a class="btn ghost" href="#/c/${esc(c.id)}/me" style="text-decoration:none" id="comp-me">My report card</a><button class="btn ghost" type="button" id="comp-tv">Projector mode</button></div></div>
      <div id="comp-join"></div>
      <div class="card"><div class="boardhead"><p class="eyebrow" style="margin:0">Leaderboard</p><span class="small" id="comp-upd"></span></div>
        <div class="tabs comptabs" role="tablist"><button class="chip" type="button" role="tab" data-lv="" aria-selected="true">Overall</button>${LEVELS.map((L) => `<button class="chip" type="button" role="tab" data-lv="${L.n}" aria-selected="false" title="${esc(L.name)}">Level ${L.n}</button>`).join('')}</div>
        <div id="comp-board" class="tablewrap"></div></div>
      <details class="card"><summary class="eyebrow" style="cursor:pointer;margin:0">Rules</summary>${RULES(c)}</details>`;
    const load = async () => {
      const rows = await withTimeout(b.competitionBoard(c!.id, level), 6000, null);
      if (!alive) return;
      drawBoard(app.querySelector<HTMLElement>('#comp-board')!, rows, level);
      app.querySelector('#comp-upd')!.textContent = `updated ${new Date().toLocaleTimeString()}`;
      app.querySelector('#comp-status')!.textContent = compStatus(c!).text;
    };
    const drawJoin = async () => {
      const box = app.querySelector<HTMLElement>('#comp-join')!;
      const nick = b.kind === 'offline' ? null : await withTimeout(b.nickname(), 4000, null);
      if (!alive) return;
      if (c!.is_member) {
        box.innerHTML = `<div class="card joined"><span class="ok-pill" id="cj-in">✓ You joined as <b>${esc(nick ?? '')}</b></span>${c!.disqualified ? '<p class="badc" id="cj-dq">The organiser removed you from this competition, so your scores are not ranked. Ask the organiser if you think this is a mistake.</p>' : '<p class="small" style="margin:6px 0 0">Every game you finish before the end counts. Your best score per game adds up.</p>'}</div>`;
        return;
      }
      if (compStatus(c!).phase === 'ended' || b.kind === 'offline') {
        box.innerHTML = '';
        return;
      }
      box.innerHTML = `<form class="card joincard" id="cj-form" novalidate><p class="eyebrow">Join this competition</p>
          <p class="small">Only players who joined with the code are ranked. The code is on the poster, or already in the link you were given.</p>
          ${nick ? `<p class="small">Joining as <b>${esc(nick)}</b>.</p>` : nickFieldHtml('cj-nick')}
          <label class="small" for="cj-code">Join code (6 characters)</label><input id="cj-code" class="joinnick codein" maxlength="6" autocomplete="off" spellcheck="false" value="${esc(joinCode.toUpperCase())}" placeholder="e.g. K7Q2XM">
          <p class="small" id="cj-msg" role="status"></p>
          <div class="row"><button class="btn go" type="submit" id="cj-go">Join the competition</button></div></form>
        <details class="card restore" id="cr"><summary>Joined before on another phone or browser? Get your progress back</summary>
          <form class="classform" id="cr-form" novalidate><label class="small" for="cr-nick">Your nickname</label><input id="cr-nick" class="joinnick" maxlength="20" autocomplete="off">
          <label class="small" for="cr-code">Your claim code for this competition</label><input id="cr-code" class="joinnick codein" maxlength="13" autocomplete="off" spellcheck="false" placeholder="BTC-XXXX-XXXX">
          <p class="small" id="cr-msg" role="status"></p><div class="row"><button class="btn" type="submit" id="cr-go">Restore my progress</button></div></form></details>`;
      bindNickField(box);
      box.querySelector('#cj-form')!.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = box.querySelector('#cj-msg')!;
        const code = box.querySelector<HTMLInputElement>('#cj-code')!.value.trim();
        if (code.length !== 6) return void (msg.textContent = 'Type the 6-character join code from the organiser.');
        let name = nick;
        if (!name) {
          name = box.querySelector<HTMLInputElement>('#cj-nick')!.value.trim();
          msg.textContent = 'Saving your nickname…';
          const r = await b.setNickname(name);
          if (!r.ok) return void (msg.textContent = r.reason ?? 'Could not save that nickname.');
        }
        msg.textContent = 'Joining…';
        const r = await withTimeout(b.joinCompetition(c!.id, code), 8000, { ok: false as const, reason: 'The server did not answer. Try again.' });
        if (!alive) return;
        if (!r.ok) return void (msg.textContent = r.reason);
        await showClaimDialog(name, r.claim, { kind: 'competition', name: c!.name });
        await refresh();
      });
      box.querySelector('#cr-form')!.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = box.querySelector('#cr-msg')!;
        msg.textContent = 'Checking…';
        const r = await b.restoreProgress('competition', c!.id, box.querySelector<HTMLInputElement>('#cr-nick')!.value, box.querySelector<HTMLInputElement>('#cr-code')!.value);
        if (!alive) return;
        if (!r.ok) return void (msg.textContent = r.reason);
        toast(`Welcome back, ${r.nickname}. Your progress is in this browser now.`);
        await refresh();
      });
    };
    const refresh = async () => {
      c = (await withTimeout(b.competitionInfo(id), 6000, null)) ?? c;
      if (!alive) return;
      await drawJoin();
      await load();
    };
    app.querySelectorAll<HTMLButtonElement>('[data-lv]').forEach((t) =>
      t.addEventListener('click', () => {
        level = t.dataset.lv ? Number(t.dataset.lv) : null;
        app.querySelectorAll('[data-lv]').forEach((x) => x.setAttribute('aria-selected', String(x === t)));
        void load();
      }),
    );
    app.querySelector('#comp-tv')!.addEventListener('click', () => {
      document.body.classList.toggle('tv');
      if (document.body.classList.contains('tv')) document.documentElement.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen?.().catch(() => {});
    });
    await drawJoin();
    await load();
    timer = window.setInterval(() => void load(), 30_000);
  })();
  return () => {
    alive = false;
    clearInterval(timer);
    document.body.classList.remove('tv');
  };
}

function drawBoard(box: HTMLElement, rows: CompRow[] | null, level: number | null) {
  if (!rows) {
    box.innerHTML = '<p class="small">Could not load the leaderboard.</p>';
    return;
  }
  if (!rows.length) {
    box.innerHTML = `<p class="small">No scores ${level ? `in level ${level} ` : ''}yet. Finish a game to get on the board.</p>`;
    return;
  }
  const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `${r}.`);
  box.innerHTML = `<table class="rep compboard"><thead><tr><th>#</th><th>Player</th><th>Points</th><th>Games</th><th>★</th></tr></thead><tbody>${rows
    .map((r) => `<tr class="${r.me ? 'me' : ''}" data-crank="${r.rank}"><td>${medal(r.rank)}</td><td>${esc(r.nickname)}${r.me ? ' (you)' : ''}</td><td><b>${fmtPts(r.points)}</b></td><td>${r.games}</td><td>${r.stars}</td></tr>`)
    .join('')}</tbody></table>`;
}

// ---------- report card ----------
export function renderCompetitionMe(app: HTMLElement, id: string): () => void {
  let alive = true;
  app.innerHTML = page(`<p class="eyebrow"><a href="#/c/${esc(id)}">← Competition</a> · report card</p><h1>Report <span>card</span></h1><div id="me-body"><p class="small">Loading…</p></div>`);
  bindTopbar(app);
  void (async () => {
    const b = await getBackend();
    const [c, me] = await Promise.all([withTimeout(b.competitionInfo(id), 6000, null), withTimeout(b.competitionMe(id), 6000, null)]);
    if (!alive) return;
    const box = app.querySelector<HTMLElement>('#me-body')!;
    if (!c || !me) {
      box.innerHTML = '<p>Could not load your report card.</p>';
      return;
    }
    if (!me.nickname || !me.member) {
      box.innerHTML = `<div class="card" id="rc-notjoined"><p>You have not joined ${esc(c.name)} yet, so you are not ranked. Join with the code from the organiser.</p><a class="btn go" href="#/c/${esc(c.id)}" style="text-decoration:none">Join the competition →</a></div>`;
      return;
    }
    const byGame = new Map(me.per_game.map((g) => [g.game_id, g]));
    box.innerHTML = `<div class="card reportcard" id="report-card"><p class="eyebrow">${esc(c.name)} · ${esc(compStatus(c).text)}</p>
        ${me.disqualified ? '<p class="badc">The organiser removed you from this competition, so your scores are not ranked.</p>' : ''}
        <div class="rc-head"><div><div class="rc-nick" id="rc-nick">${esc(me.nickname)}</div><p class="small" style="margin:0">${me.games} of ${GAMES.length} games · ${me.stars} ★</p></div>
          <div class="rc-rank"><b id="rc-rank">${me.rank ? `#${me.rank}` : '–'}</b><span>of ${me.of} · ${fmtPts(me.points)} pts</span></div></div>
        <table class="rep"><thead><tr><th>Level</th><th>Points</th><th>Level rank</th><th>Games</th></tr></thead><tbody>${LEVELS.map((L) => {
          const l = me.per_level.find((x) => x.level === L.n);
          const games = GAMES.filter((g) => g.level === L.n);
          return `<tr><td>${L.n} · ${esc(L.name)}</td><td>${l ? fmtPts(l.points) : '–'}</td><td>${l?.rank ? `#${l.rank}` : '–'}</td><td>${games.map((g) => { const x = byGame.get(g.id); return `<span class="rc-game ${x ? 'done' : ''}" title="${esc(g.title)}${x ? `: ${x.points} pts` : ''}">${esc(g.title)}${x ? ` ${'★'.repeat(x.stars)}` : ''}</span>`; }).join('')}</td></tr>`;
        }).join('')}</tbody></table>
        <p class="small" style="margin:8px 0 0">📸 Screenshot this card. Labs powered by Break the Cloud · ${esc(site())}</p>
        ${bookHtml('rc-book')}</div>
      <div class="card"><p class="eyebrow">Claim code</p><p class="small">Your claim code for this competition was shown when you joined. Lost it? Get a new one: the old one stops working.</p><button class="btn ghost" type="button" id="rc-reissue">Get a new claim code</button><div id="rc-claim"></div></div>`;
    box.querySelector('#rc-reissue')!.addEventListener('click', async () => {
      if (!confirm('Get a new claim code? Your old code will stop working.')) return;
      const code = await b.competitionNewClaim(id);
      const slot = box.querySelector<HTMLElement>('#rc-claim')!;
      if (!code) {
        slot.innerHTML = '<p class="small">Could not create a code. Try again.</p>';
        return;
      }
      slot.innerHTML = '';
      await showClaimDialog(me.nickname!, code, { kind: 'competition', name: c.name });
    });
  })();
  return () => {
    alive = false;
  };
}

// ---------- create ----------
export function renderNewCompetition(app: HTMLElement): () => void {
  let alive = true;
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 7 * 24 * 3600_000);
  app.innerHTML = page(`<p class="eyebrow"><a href="#/">← All games</a> · for organisers</p><h1>Host a <span>competition</span></h1>
    <p class="lede">A leaderboard with a start and an end. Players join with a 6-character code and a nickname; only they are ranked. Winners prove who they are with a claim code, so you collect no personal data until you hand out a prize.</p>
    <form class="card classform" id="comp-form" novalidate>
      <label for="co-name">Name</label><input id="co-name" maxlength="80" placeholder="e.g. VJTI Break the Cloud Cup">
      <label for="co-id">Link: ${esc(site())}#/c/<b>…</b></label><input id="co-id" maxlength="40" placeholder="vjti-2026">
      <label for="co-start">Starts</label><input id="co-start" type="datetime-local" value="${local(start)}">
      <label for="co-end">Ends</label><input id="co-end" type="datetime-local" value="${local(end)}">
      <div class="row"><button class="btn go" type="submit" id="co-create">Create competition</button><span class="small" id="co-msg" role="status"></span></div>
    </form><div id="comp-made"></div>`);
  bindTopbar(app);
  const v = (x: string) => app.querySelector<HTMLInputElement>('#' + x)!.value.trim();
  app.querySelector('#co-name')!.addEventListener('input', () => {
    const idIn = app.querySelector<HTMLInputElement>('#co-id')!;
    if (!idIn.dataset.touched) idIn.value = v('co-name').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  });
  app.querySelector('#co-id')!.addEventListener('input', (e) => ((e.target as HTMLElement).dataset.touched = '1'));
  app.querySelector('#comp-form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = app.querySelector('#co-msg')!;
    const id = v('co-id').toLowerCase();
    if (v('co-name').length < 3) return void (msg.textContent = 'Give it a name (3+ characters).');
    if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(id)) return void (msg.textContent = 'The link may use lowercase letters, digits and dashes (3–40).');
    const s = new Date(v('co-start')), en = new Date(v('co-end'));
    if (!(en > s)) return void (msg.textContent = 'The end must be after the start.');
    msg.textContent = 'Creating…';
    const b = await getBackend();
    const r = await withTimeout(b.createCompetition(id, v('co-name'), s.toISOString(), en.toISOString()), 8000, { ok: false as const, reason: 'The server did not answer. Try again.' });
    if (!alive) return;
    if (!r.ok) return void (msg.textContent = r.reason);
    app.querySelector<HTMLElement>('#comp-form')!.hidden = true;
    const pub = `${site()}#/c/${id}?code=${r.joinCode}`;
    const adm = `${site()}#/c/${id}/admin?key=${r.key}`;
    app.querySelector('#comp-made')!.innerHTML = `<div class="card classmade"><p class="eyebrow">Competition created</p><p class="small" style="margin:0">Join code</p><div class="bigcode" id="cm-code">${esc(r.joinCode)}</div>
      <label for="cm-pub">Players: share this link. It already contains the join code: put it on the poster as a QR code.</label><div class="row"><input id="cm-pub" readonly value="${esc(pub)}"><button class="btn ghost" type="button" data-copy="cm-pub">Copy</button></div>
      <label for="cm-adm">You: organiser link. <b>Save it now: it is shown only once</b>. It shows the final standings and verifies winners.</label><div class="row"><input id="cm-adm" readonly value="${esc(adm)}"><button class="btn ghost" type="button" data-copy="cm-adm">Copy</button></div>
      <div class="row"><a class="btn go" href="#/c/${id}" style="text-decoration:none" id="cm-open">Open the leaderboard →</a><a class="btn ghost" href="#/c/${id}/admin?key=${r.key}" style="text-decoration:none" id="cm-admin">Organiser page</a></div></div>`;
    app.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const val = app.querySelector<HTMLInputElement>('#' + btn.dataset.copy)!.value;
        navigator.clipboard?.writeText(val).then(() => toast('Copied.')).catch(() => toast(val));
      }),
    );
  });
  return () => {
    alive = false;
  };
}

// ---------- organiser ----------
export function renderCompetitionAdmin(app: HTMLElement, id: string, key: string | undefined): () => void {
  let alive = true;
  app.innerHTML = page(`<p class="eyebrow"><a href="#/c/${esc(id)}">← Competition</a> · organiser</p><h1>Organiser <span>desk</span></h1><div id="adm-body"><p class="small">Loading…</p></div>`);
  bindTopbar(app);
  const box = app.querySelector<HTMLElement>('#adm-body')!;
  if (!key) {
    box.innerHTML = '<div class="card"><p>Open this page with your organiser link (it contains the key).</p></div>';
    return () => {};
  }
  const reload = () => {
    if (alive) renderCompetitionAdmin(app, id, key);
  };
  void (async () => {
    const b = await getBackend();
    const r = await withTimeout(b.competitionAdmin(id, key), 8000, { ok: false as const, reason: 'The server did not answer. Try again.' });
    if (!alive) return;
    if (!r.ok) return void (box.innerHTML = `<div class="card"><p>${esc(r.reason)}</p></div>`);
    drawAdmin(box, r.data, id, key, reload);
  })();
  return () => {
    alive = false;
  };
}

function drawAdmin(box: HTMLElement, d: CompAdmin, id: string, key: string, reload: () => void) {
  const st = compStatus(d.competition);
  const joinLink = `${site()}#/c/${id}?code=${d.join_code}`;
  box.innerHTML = `<div class="card"><h2>${esc(d.competition.name)}</h2><p class="small">${esc(st.text)} · ${d.members} member${d.members === 1 ? '' : 's'} · ${d.players} ranked player${d.players === 1 ? '' : 's'}</p>
      <div class="row"><button class="btn" type="button" id="adm-csv">Download standings (CSV)</button><button class="btn ghost" type="button" id="adm-print">Print</button></div></div>
    <div class="card"><p class="eyebrow">Join code</p><div class="bigcode" id="adm-code">${esc(d.join_code)}</div>
      <label class="small" for="adm-link">Players join with this link (it contains the code). Put it on the poster as a QR code.</label>
      <div class="row"><input id="adm-link" readonly value="${esc(joinLink)}"><button class="btn ghost" type="button" id="adm-copy">Copy</button></div></div>
    <div class="card"><p class="eyebrow">Verify a winner</p><p class="small">Ask the winner for their nickname and claim code. A match proves the nickname is theirs. Only then collect what you need to deliver the prize.</p>
      <form class="row" id="vf"><input id="vf-nick" class="joinnick" placeholder="nickname" maxlength="20"><input id="vf-code" class="joinnick" placeholder="BTC-XXXX-XXXX" maxlength="20"><button class="btn go" type="submit">Verify</button></form><p id="vf-out" role="status"></p></div>
    <div class="card"><p class="eyebrow">Final standings</p><div class="tablewrap"><table class="rep"><thead><tr><th>#</th><th>Player</th><th>Points</th><th>Games</th><th>★</th><th>Reached</th><th></th></tr></thead><tbody>${d.standings
      .map((s) => `<tr><td>${s.rank}</td><td>${esc(s.nickname)}</td><td>${fmtPts(s.points)}</td><td>${s.games}</td><td>${s.stars}</td><td>${new Date(s.reached_at).toLocaleString('en-IN')}</td><td><button class="linkbtn" type="button" data-dq="${esc(s.nickname)}">Remove</button></td></tr>`)
      .join('') || '<tr><td colspan="7">No ranked players yet.</td></tr>'}</tbody></table></div></div>
    <div class="card" id="dq-card"><p class="eyebrow">Disqualify a player</p><p class="small">For cheating or an offensive nickname. They disappear from every board of this competition and cannot win; their data is kept and you can undo it. Only you see the reason.</p>
      <form class="row" id="dq-form"><input id="dq-nick" class="joinnick" placeholder="nickname" maxlength="20"><input id="dq-reason" class="joinnick" placeholder="reason (only you see it)" maxlength="200"><button class="btn" type="submit" id="dq-go">Disqualify</button></form><p id="dq-out" role="status"></p>
      ${d.disqualified.length ? `<div class="tablewrap"><table class="rep" id="dq-list"><thead><tr><th>Removed</th><th>Reason</th><th>When</th><th></th></tr></thead><tbody>${d.disqualified
        .map((x) => `<tr><td>${esc(x.nickname)}</td><td>${esc(x.reason ?? '–')}</td><td>${new Date(x.at).toLocaleString('en-IN')}</td><td><button class="linkbtn" type="button" data-rein="${esc(x.nickname)}">Reinstate</button></td></tr>`)
        .join('')}</tbody></table></div>` : ''}</div>
    <div class="card"><p class="eyebrow">Level winners</p><div class="tablewrap"><table class="rep"><tbody>${d.level_winners.map((l) => `<tr><td>Level ${l.level}</td><td>${l.winner ? esc(l.winner) : '–'}</td><td>${l.points ? fmtPts(l.points) : ''}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><p class="eyebrow">Finalists’ runs (fairness check)</p><p class="small">Very short task times, no mistakes at all, or every run finished within seconds of each other can mean a script. Ask that finalist to replay one game live.</p>${d.finalists
      .slice(0, 10)
      .map((f) => `<details class="finalist"><summary>#${f.rank} ${esc(f.nickname)} · ${(f.runs ?? []).length} games</summary><div class="tablewrap"><table class="rep"><thead><tr><th>Game</th><th>Points</th><th>Time</th><th>Mistakes</th><th>Task times (s)</th><th>Finished</th></tr></thead><tbody>${(f.runs ?? [])
        .map((x) => `<tr><td>${esc(title(x.game_id))}</td><td>${x.points}</td><td>${fmtTime(x.ms)}</td><td>${x.mistakes}</td><td>${(x.task_ms ?? []).slice(1).map((t, i) => ((t - (x.task_ms[i] ?? 0)) / 1000).toFixed(1)).join(' · ')}</td><td>${new Date(x.finished_at).toLocaleString('en-IN')}</td></tr>`)
        .join('')}</tbody></table></div></details>`)
      .join('')}</div>`;
  box.querySelector('#adm-print')!.addEventListener('click', () => window.print());
  box.querySelector('#adm-copy')!.addEventListener('click', () => navigator.clipboard?.writeText(joinLink).then(() => toast('Copied.')).catch(() => toast(joinLink)));
  box.querySelector('#adm-csv')!.addEventListener('click', () => {
    const q = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const rows = [['rank', 'nickname', 'points', 'games', 'stars', 'reached_at'], ...d.standings.map((s) => [s.rank, s.nickname, s.points, s.games, s.stars, s.reached_at])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv' }));
    a.download = `${d.competition.id}-standings.csv`;
    a.click();
  });
  box.querySelector('#vf')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = box.querySelector<HTMLElement>('#vf-out')!;
    const nick = box.querySelector<HTMLInputElement>('#vf-nick')!.value.trim();
    const code = box.querySelector<HTMLInputElement>('#vf-code')!.value.trim();
    if (!nick || !code) return void (out.textContent = 'Enter both the nickname and the claim code.');
    out.textContent = 'Checking…';
    const b = await getBackend();
    const r = await b.verifyClaim(id, key, nick, code);
    if (!r.ok) return void (out.textContent = r.reason);
    out.className = r.valid ? 'okc' : 'badc';
    out.innerHTML = r.valid ? `✓ <b>Valid.</b> ${esc(nick)} is rank <b>#${r.rank ?? '–'}</b> with ${fmtPts(r.points ?? 0)} points.` : `✕ <b>Not valid:</b> ${esc(r.reason ?? 'no match')}.`;
  });
  // A Remove button in the standings fills the disqualify form.
  box.querySelectorAll<HTMLButtonElement>('[data-dq]').forEach((btn) =>
    btn.addEventListener('click', () => {
      box.querySelector<HTMLInputElement>('#dq-nick')!.value = btn.dataset.dq!;
      box.querySelector('#dq-card')!.scrollIntoView({ block: 'center', behavior: 'smooth' });
      box.querySelector<HTMLInputElement>('#dq-reason')!.focus({ preventScroll: true });
      toast(`Add a reason, then press Disqualify to remove ${btn.dataset.dq}.`);
    }),
  );
  box.querySelector('#dq-form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = box.querySelector<HTMLElement>('#dq-out')!;
    const nick = box.querySelector<HTMLInputElement>('#dq-nick')!.value.trim();
    if (!nick) return void (out.textContent = 'Type the nickname to remove.');
    out.textContent = 'Removing…';
    const b = await getBackend();
    const r = await b.disqualify(id, key, nick, box.querySelector<HTMLInputElement>('#dq-reason')!.value);
    if (!r.ok) return void (out.textContent = r.reason);
    toast(`${nick} is removed from every board of this competition.`);
    reload();
  });
  box.querySelectorAll<HTMLButtonElement>('[data-rein]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const b = await getBackend();
      const r = await b.reinstate(id, key, btn.dataset.rein!);
      if (!r.ok) return void toast(r.reason);
      toast(`${btn.dataset.rein} is back on the boards.`);
      reload();
    }),
  );
}
