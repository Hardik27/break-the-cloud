/**
 * Play page: HUD (time, points, combo, tasks), coach bar, stage, side panel, lessons, task-clear banners,
 * result card with stars/points/share, leaderboard, Learn more.
 */
import { COMBO_CAP_PER_TASK, MISTAKE_POINTS, TUTORIAL_POINTS, comboPointsFor, rankFor, scoreRun, scoreTask, type Grade, type TaskScore } from '../../supabase/functions/_shared/scoring.ts';
import { builtGames, type GameEntry } from '../games/registry';
import type { Coach, GameApi, GameMeta, LegendItem } from '../games/types';
import { confetti } from '../lib/confetti';
import { esc, fmtTime } from '../lib/dom';
import { getBackend, withTimeout, type Backend, type Range } from '../lib/leaderboard';
import { randomSeed } from '../lib/rng';
import { sfx } from '../lib/sfx';
import { careerPoints, getBest, markDailyDone, markPlayedToday, myClass, saveBest, unlockLesson } from '../lib/storage';
import { dailyGameId } from './daily';
import { finishHeadline, GRADE_EMOJI, gradeWord } from './cheer';
import { bindTopbar, fmtPts, footer, refreshRankChip, toast, topbar } from './chrome';
import { createCoach } from './coach';
import { createHints, createStageUi } from './stageui';
import { gateSkippedToday, nicknameGate, showWelcomeDialog } from './identity';
import { setGameContext, setTaskContext, track } from '../lib/telemetry';

const titleHtml = (t: string) => {
  const i = t.lastIndexOf(' ');
  return i < 0 ? `<span>${esc(t)}</span>` : `${esc(t.slice(0, i))} <span>${esc(t.slice(i + 1))}</span>`;
};

const legendHtml = (items: LegendItem[]) =>
  `<ul class="legend">${items.map((l) => `<li><span class="sw ${l.shape}" style="background:${l.color};--c:${l.color}"></span><span>${l.label}</span></li>`).join('')}</ul>`;

const starsHtml = (n: number) => `<span class="stars big" aria-label="${n} of 3 stars">${[1, 2, 3].map((i) => `<span class="${i <= n ? 'on' : 'off'}" style="animation-delay:${i * 0.18}s">★</span>`).join('')}</span>`;

const STUCK_MS = 20_000;

export interface PlayHandle {
  unmount(): void;
}

export async function renderPlay(app: HTMLElement, entry: GameEntry, seedParam: number | null, onReplay: () => void): Promise<PlayHandle> {
  const mod = await entry.load!();
  const meta: GameMeta = mod.meta;
  const nTasks = meta.tasks.length;
  const games = builtGames();
  const nextGame = games[(games.findIndex((g) => g.id === meta.id) + 1) % games.length];

  app.innerHTML =
    topbar() +
    `<div class="playhead"><div><p class="eyebrow"><a href="#/">← All games</a> · Level ${meta.level} · ${esc(meta.concept)}</p><h1>${titleHtml(meta.title)}</h1></div>
      <div class="hud" aria-label="Run status"><span id="hud-time-wrap" class="paused">time<b id="hud-time">0:00.0</b></span>
      <span class="hud-pts">points<b id="hud-points">0</b><em id="hud-combo" class="combo" hidden></em></span>
      <span>tasks<b id="hud-tasks">0/${nTasks}</b></span></div></div>
    <div class="bench">
      <div class="stagecol" id="stagecol"><div id="coach-slot"></div><div id="teach-slot"></div><section class="card stage" id="stage" aria-label="${esc(meta.title)} game"></section>
        <div class="fx-layer" id="fx" aria-hidden="true"></div><div class="banner" id="banner" role="status" aria-live="polite"></div></div>
      <aside>
        <div class="card result" id="result" hidden></div>
        <div class="card brief" id="brief"><details id="brief-details" open><summary class="eyebrow" style="cursor:pointer;margin:0 0 8px">Brief</summary>
          ${meta.pager ? `<p class="pager">📟 ${meta.pager}</p>` : ''}<h2>${esc(meta.concept)}</h2><p>${meta.intro}</p>
          <p class="eyebrow">On screen</p>${legendHtml(meta.legend)}
          <p class="eyebrow">How to play</p><ul>${meta.howTo.map((x) => `<li>${x}</li>`).join('')}</ul>
          <p class="eyebrow">How you score</p><p class="small" style="margin:0 0 12px">Each task: 200 for clearing it, up to 300 for speed, 100 if flawless, plus combo points for good moves in a row. Each mistake costs ${MISTAKE_POINTS}. Clean, fast runs earn ★★★.</p></details>
          <div class="row" id="start-row"><button class="btn go" id="start-btn" type="button">Start</button><span class="small">A short explainer and a guided tutorial come first. The clock starts after them.</span></div>
        </div>
        <div class="card" id="side"></div>
        <div class="card hints" id="hints" hidden></div>
        <div class="card"><p class="eyebrow">Tasks</p><ol class="tasks" id="tasks"></ol></div>
        <div class="card" id="board"><div class="boardhead"><p class="eyebrow" style="margin:0">Leaderboard</p>
          <div class="tabs" role="tablist">${myClass() ? `<button class="chip" type="button" role="tab" data-range="class" aria-selected="true">My class</button>` : ''}<button class="chip" type="button" role="tab" data-range="all" aria-selected="${myClass() ? 'false' : 'true'}">All time</button><button class="chip" type="button" role="tab" data-range="week" aria-selected="false">This week</button></div></div>
          <div id="board-body" class="small">Loading…</div><p class="small" id="board-me" style="margin:8px 0 0"></p><div id="board-nick"></div></div>
      </aside>
    </div>
    <section class="card" id="learn" hidden></section>` +
    footer();
  bindTopbar(app);

  const $ = <T extends HTMLElement = HTMLElement>(id: string) => app.querySelector<T>('#' + id)!;
  const stage = $('stage');
  const coach = createCoach($('coach-slot'), toast);
  let alive = true;

  // ---------- run state ----------
  const run = { begun: false, t0: null as number | null, elapsed: 0, moves: 0, done: new Set<number>(), finished: false };
  const sc = {
    taskMs: Array<number>(nTasks).fill(0),
    mistakes: Array<number>(nTasks).fill(0),
    comboPts: Array<number>(nTasks).fill(0),
    scores: Array<TaskScore | null>(nTasks).fill(null),
    tutorialPts: 0,
    combo: 0,
    bestCombo: 0,
    penaltyMs: 0,
  };
  const seed = seedParam ?? randomSeed();
  const beginCbs: (() => void)[] = [];
  const running = () => run.t0 !== null && !run.finished;
  const curTask = () => {
    for (let i = 0; i < nTasks; i++) if (!run.done.has(i)) return i;
    return nTasks - 1;
  };
  const clk = { depth: 0, pausedAt: null as number | null, pausedTotal: 0 };
  const clock = () => (run.t0 === null ? 0 : (clk.pausedAt ?? performance.now()) - run.t0);
  /** The clock counts decision time only: explainers, predictions, replays and debriefs pause it. */
  function pauseClock() {
    if (clk.depth++ === 0 && run.t0 !== null && !run.finished) clk.pausedAt = performance.now();
    app.querySelector('#hud-time-wrap')?.classList.add('held');
  }
  function resumeClock() {
    if (clk.depth === 0) return;
    if (--clk.depth === 0) {
      if (clk.pausedAt !== null && run.t0 !== null) {
        const d = performance.now() - clk.pausedAt;
        run.t0 += d;
        clk.pausedTotal += d;
      }
      clk.pausedAt = null;
      app.querySelector('#hud-time-wrap')?.classList.remove('held');
    }
  }
  let lastActivity = performance.now();

  // ---------- backend ----------
  let runId: Promise<string | null> = Promise.resolve(null);
  const backendReady: Promise<Backend> = getBackend();

  // ---------- HUD ----------
  let shownPts = 0;
  let ptsRaf = 0;
  function livePoints(): number {
    let t = sc.tutorialPts;
    sc.scores.forEach((s) => s && (t += s.total));
    const i = curTask();
    if (running() && !sc.scores[i] && i > 0) t += Math.max(0, sc.comboPts[i] - MISTAKE_POINTS * sc.mistakes[i]);
    return t;
  }
  function renderPoints() {
    const target = livePoints();
    cancelAnimationFrame(ptsRaf);
    const from = shownPts;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 450);
      shownPts = Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3)));
      $('hud-points').textContent = fmtPts(shownPts);
      if (k < 1 && alive) ptsRaf = requestAnimationFrame(tick);
    };
    ptsRaf = requestAnimationFrame(tick);
    const c = $('hud-combo');
    c.hidden = sc.combo < 2;
    c.textContent = `×${sc.combo} combo`;
    c.classList.remove('bump');
    void c.offsetWidth;
    c.classList.add('bump');
  }

  function renderTasks() {
    const cur = curTask();
    $('tasks').innerHTML = meta.tasks
      .map((t, i) => {
        const done = run.done.has(i);
        const cls = done ? 'ok' : i === cur && run.begun ? 'cur' : '';
        const s = sc.scores[i];
        const tail = done && s ? `<span class="grade g${s.grade}" title="Grade ${s.grade}, +${s.total} points">${s.grade}</span>` : done && i === 0 ? `<span class="grade gS">✓</span>` : '';
        return `<li class="${cls}" data-task="${i}"><span class="box">${done ? '✓' : i + 1}</span><span class="tt">${esc(t)}</span>${tail}</li>`;
      })
      .join('');
    $('hud-tasks').textContent = `${run.done.size}/${nTasks}`;
  }
  renderTasks();

  const timer = window.setInterval(() => {
    if (running()) {
      run.elapsed = clock();
      $('hud-time').textContent = fmtTime(run.elapsed);
      if (clk.depth === 0 && performance.now() - lastActivity > STUCK_MS) {
        lastActivity = performance.now();
        hints.nudge();
      }
    } else lastActivity = performance.now();
  }, 100);

  function startClock() {
    if (run.t0 === null && !run.finished) {
      run.t0 = performance.now();
      if (clk.depth > 0) clk.pausedAt = run.t0;
      $('hud-time-wrap').classList.remove('paused');
      runId = backendReady.then((b) => withTimeout(b.startRun(meta.id, myClass()?.code ?? null), 6000, null));
    }
  }

  // ---------- juice ----------
  function popup(text: string, kind: 'good' | 'bad', at?: Element | null) {
    const layer = $('fx');
    const base = $('stagecol').getBoundingClientRect();
    const r = (at && at.isConnected ? at : stage).getBoundingClientRect();
    const p = document.createElement('div');
    p.className = `pop ${kind}`;
    p.textContent = text;
    const x = r.left - base.left + r.width / 2;
    const y = r.top - base.top + Math.min(r.height / 2, 60);
    p.style.left = `${Math.max(40, Math.min(base.width - 40, x))}px`;
    p.style.top = `${Math.max(10, y)}px`;
    layer.appendChild(p);
    setTimeout(() => p.remove(), 1000);
    while (layer.childElementCount > 12) layer.firstElementChild?.remove();
  }

  function shake() {
    stage.classList.remove('shake');
    void stage.offsetWidth;
    stage.classList.add('shake');
  }

  // ---------- teaching layer ----------
  const ui = createStageUi({ slot: $('teach-slot'), stage, pause: pauseClock, resume: resumeClock });
  const hints = createHints({
    card: $('hints'),
    toast,
    charge(n) {
      if (!n || !running()) return;
      const i = curTask();
      sc.mistakes[i] += n;
      sc.combo = 0;
      popup(`−${n * MISTAKE_POINTS} hint`, 'bad', $('hints'));
      renderPoints();
    },
  });
  let hintsUsed = 0;

  // ---------- finish ----------
  function finish() {
    run.finished = true;
    run.elapsed = clock();
    $('hud-time').textContent = fmtTime(run.elapsed);
    const inputs = sc.taskMs.map((t, i) => ({ ms: i === 0 ? 0 : t - sc.taskMs[i - 1], mistakes: sc.mistakes[i], comboPoints: sc.comboPts[i] }));
    const rs = scoreRun(inputs, meta.parMs);
    track('game_finish', { points: rs.total, stars: rs.stars, ms: Math.round(run.elapsed) }, { task: null });
    const streakNow = markPlayedToday();
    if (meta.id === dailyGameId()) markDailyDone();
    const careerBefore = careerPoints();
    const { pb, prev } = saveBest(meta.id, { ms: run.elapsed, moves: run.moves, points: rs.total, stars: rs.stars });
    const careerAfter = careerPoints();
    const rankBefore = rankFor(careerBefore).title;
    const rank = rankFor(careerAfter);
    const head = finishHeadline(rs.stars, seed);
    const totalMistakes = sc.mistakes.reduce((a, b) => a + b, 0);
    const sum = (k: keyof TaskScore) => rs.tasks.reduce((a, t) => a + (t[k] as number), 0);
    // Best moment: the task done fastest relative to its par.
    let bestI = 1;
    for (let i = 1; i < nTasks; i++) if (inputs[i].ms / meta.parMs[i] < inputs[bestI].ms / meta.parMs[bestI]) bestI = i;

    const res = $('result');
    res.hidden = false;
    res.innerHTML = `<p class="eyebrow">Run complete</p>${starsHtml(rs.stars)}
      <div class="big" id="result-points">0</div><p class="small" style="margin:0">points · ${fmtTime(run.elapsed)} · ${totalMistakes} mistake${totalMistakes === 1 ? '' : 's'} · best combo ×${sc.bestCombo}</p>
      <h2 class="cheer" id="result-cheer">${esc(head.title)}</h2><p style="margin:0 0 10px">${esc(head.sub)}</p>
      ${pb ? `<p class="pb">${prev ? `New personal best! +${fmtPts(rs.total - (prev.points ?? 0))} over your last best.` : 'First clear. That is now your score to beat.'}</p>` : `<p class="small">Your best is still ${fmtPts(prev?.points ?? 0)}. So close.</p>`}
      <div class="grades" id="result-grades">${rs.grades.map((g: Grade, i: number) => `<span class="gchip g${g}" title="${esc(meta.tasks[i + 1])}">${GRADE_EMOJI[g]} ${g}</span>`).join('')}</div>
      <table class="breakdown"><tbody>
        <tr><td>Tutorial</td><td>+${TUTORIAL_POINTS}</td></tr>
        <tr><td>Tasks cleared</td><td>+${fmtPts(sum('base'))}</td></tr>
        <tr><td>Speed bonus</td><td>+${fmtPts(sum('speed'))}</td></tr>
        <tr><td>Flawless bonus</td><td>+${fmtPts(sum('flawless'))}</td></tr>
        <tr><td>Combos</td><td>+${fmtPts(sum('combo'))}</td></tr>
        <tr><td>Mistakes</td><td>−${fmtPts(sum('penalty'))}</td></tr>
      </tbody></table>
      ${ui.stats.predictions ? `<p class="small">🔮 Predictions called: <b>${ui.stats.called}/${ui.stats.predictions}</b>${hintsUsed ? ` · hints used: ${hintsUsed}` : ''}</p>` : hintsUsed ? `<p class="small">Hints used: ${hintsUsed}</p>` : ''}
      <p class="small">🔥 ${streakNow.days}-day streak · <a href="#/deck">${esc(meta.title)}: ${nTasks} cards added to your concept deck</a></p>
      <p class="small">Best moment: <b>${esc(meta.tasks[bestI])}</b> in ${(inputs[bestI].ms / 1000).toFixed(1)} s (par ${(meta.parMs[bestI] / 1000).toFixed(0)} s).</p>
      <p class="small">${rank.title !== rankBefore ? `<b class="pb">Promoted to ${rank.title}!</b> ` : `Rank: <b>${rank.title}</b>. `}${rank.next ? `${fmtPts(rank.next.min - careerAfter)} pts to ${rank.next.title}.` : ''}</p>
      <div class="row" style="margin-top:10px"><button class="btn go" id="share-btn" type="button">Share score</button><button class="btn" id="again" type="button">Play again</button>
        <a class="btn ghost" id="next-game" href="#/play/${nextGame.id}" style="text-decoration:none">Next: ${esc(nextGame.title)} →</a></div>
      <button class="btn learnjump" type="button" id="learn-jump"><span>📖 Learn more: <b>${esc(meta.concept)}</b> in depth</span><span class="lj-arrow" aria-hidden="true">↓</span></button>
      <div id="post-status" class="small" style="margin-top:10px" role="status"></div><div id="result-nick"></div>`;
    // count-up
    const t0 = performance.now();
    const target = rs.total;
    const up = (t: number) => {
      const k = Math.min(1, (t - t0) / 1200);
      const el = app.querySelector('#result-points');
      if (!el) return;
      el.textContent = fmtPts(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1 && alive) requestAnimationFrame(up);
    };
    requestAnimationFrame(up);
    $('again').addEventListener('click', onReplay);
    $('share-btn').addEventListener('click', () => share(rs.total, rs.stars, rs.grades));
    sfx.finish(rs.stars);
    if (rs.stars === 3 || pb) confetti();
    refreshRankChip();

    const lm = meta.learnMore;
    const learn = $('learn');
    learn.hidden = false;
    learn.tabIndex = -1;
    learn.innerHTML = `<div class="learn"><div><p class="eyebrow">Learn more</p><h2>${esc(meta.concept)} in depth</h2>${lm.paragraphs.map((p) => `<p>${p}</p>`).join('')}<p class="eyebrow" style="margin-top:14px">Primary sources</p><ul>${lm.links
      .map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a></li>`)
      .join('')}</ul></div><figure>${lm.diagram}<figcaption>${lm.caption}</figcaption></figure></div>`;
    coach.shellSay(`${rs.stars === 3 ? 'Three stars!' : 'All tasks done.'} Now go deeper: press <b>Learn more</b>.`, 'act');
    // Learn more sits at the bottom of the page: two buttons jump there and highlight it.
    const jumpToLearn = () => {
      learn.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      learn.classList.remove('flash');
      void learn.offsetWidth;
      learn.classList.add('flash');
      learn.focus({ preventScroll: true });
    };
    const coachJump = document.createElement('button');
    coachJump.className = 'btn go';
    coachJump.type = 'button';
    coachJump.id = 'coach-learn';
    coachJump.textContent = 'Learn more ↓';
    coachJump.addEventListener('click', jumpToLearn);
    coach.actions.prepend(coachJump);
    $('learn-jump').addEventListener('click', jumpToLearn);
    res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    void postRun(sc.taskMs.map((t, i) => (i === 0 ? 0 : Math.round(t))));
  }

  async function postRun(taskMs: number[]) {
    const status = () => app.querySelector<HTMLElement>('#post-status');
    const b = await backendReady;
    const id = await runId;
    if (!alive) return;
    if (b.kind === 'offline' || !id) {
      const s = status();
      if (s) s.textContent = 'The shared leaderboard is offline, so this score is saved in this browser only.';
      return;
    }
    status()!.textContent = 'Posting your score…';
    const r = await withTimeout(
      b.finishRun(id, { taskMs, mistakes: sc.mistakes, comboPoints: sc.comboPts.map((x) => Math.min(COMBO_CAP_PER_TASK, Math.round(x))), penaltyMs: Math.round(sc.penaltyMs), pausedMs: Math.round(clk.pausedTotal), moves: run.moves }),
      8000,
      { ok: false, reason: 'the leaderboard did not answer in time' },
    );
    if (!alive) return;
    const rank = r.ok ? await withTimeout(b.myRank(meta.id, cls ? 'class' : 'all', cls), 5000, null) : null;
    const s = status();
    if (s) s.innerHTML = r.ok ? `Posted: <b>${fmtPts(r.points ?? 0)}</b> points.${rank ? ` You are <b>#${rank.rank}</b> of ${rank.of} ${cls ? 'in your class' : 'all time'}.` : ''}` : `Not posted: ${esc(r.reason ?? 'unknown error')}. Your best is saved in this browser.`;
    await renderNickForm(app.querySelector('#result-nick'));
    void loadBoard();
  }

  function share(points: number, stars: number, grades: Grade[]) {
    const url = `${location.href.split('#')[0]}#/play/${meta.id}`;
    const text = `Break the Cloud · ${meta.title}\n${'⭐'.repeat(stars)} ${fmtPts(points)} pts · ${fmtTime(run.elapsed)}\n${grades.map((g) => GRADE_EMOJI[g]).join('')}\nCan you keep the cloud up? ${url}`;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share && matchMedia('(pointer: coarse)').matches) {
      nav.share({ text }).catch(() => {});
      return;
    }
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast('Copied! Paste it in your group chat.'))
      .catch(() => toast(text));
    if (!navigator.clipboard) toast(text);
  }

  // ---------- leaderboard ----------
  let range: Range = myClass() ? 'class' : 'all';
  const cls = myClass()?.code ?? null;
  async function loadBoard() {
    const b = await backendReady;
    const body = app.querySelector<HTMLElement>('#board-body');
    const meLine = app.querySelector<HTMLElement>('#board-me');
    if (!body || !meLine || !alive) return;
    const local = getBest(meta.id);
    const localLine = local ? `Your best in this browser: <b>${fmtPts(local.points ?? 0)}</b> pts${local.stars ? ` · ${'★'.repeat(local.stars)}` : ''} · ${fmtTime(local.ms)}` : 'No score yet. Finish every task to set one.';
    if (b.kind === 'offline') {
      body.innerHTML = `<p style="margin:0">The shared leaderboard is offline right now.</p>`;
      meLine.innerHTML = localLine;
      return;
    }
    const rows = await withTimeout(b.top(meta.id, range, cls), 6000, null);
    if (!alive) return;
    if (!rows) {
      body.innerHTML = `<p style="margin:0">Could not load the leaderboard.</p>`;
    } else if (!rows.length) {
      body.innerHTML = `<p style="margin:0">${range === 'week' ? 'No scores this week yet.' : range === 'class' ? `Nobody in ${esc(myClass()?.name ?? 'your class')} has finished this game yet.` : 'No scores yet.'} Be the first!</p>`;
    } else {
      body.innerHTML = `<table class="lb"><tbody>${rows
        .map((r) => `<tr class="${r.me ? 'me' : ''}"><td>${r.rank}.</td><td>${esc(r.nickname)}${r.me ? ' (you)' : ''}</td><td>${'★'.repeat(r.stars)}</td><td>${fmtPts(r.points)}</td><td>${fmtTime(r.ms)}</td></tr>`)
        .join('')}</tbody></table>`;
    }
    const mine = await withTimeout(b.myRank(meta.id, range, cls), 5000, null);
    if (!alive) return;
    meLine.innerHTML = mine ? `Your rank: <b>#${mine.rank}</b> of ${mine.of} · ${fmtPts(mine.points)} pts` : localLine;
    await renderNickForm(app.querySelector('#board-nick'));
  }
  app.querySelectorAll<HTMLButtonElement>('[data-range]').forEach((btn) =>
    btn.addEventListener('click', () => {
      range = btn.dataset.range as Range;
      app.querySelectorAll('[data-range]').forEach((x) => x.setAttribute('aria-selected', String(x === btn)));
      void loadBoard();
    }),
  );

  async function renderNickForm(slot: Element | null) {
    const b = await backendReady;
    if (!slot || !alive || b.kind === 'offline') return;
    const nick = await withTimeout(b.nickname(), 4000, null);
    if (!alive) return;
    if (nick) {
      slot.innerHTML = `<p class="small" style="margin:6px 0 0">Playing as <b>${esc(nick)}</b>.</p>`;
      return;
    }
    slot.innerHTML = `<form class="nickform" novalidate><label class="small" for="${slot.id}-in">Pick a nickname to show on the board</label>
      <div class="row"><input id="${slot.id}-in" maxlength="20" autocomplete="off" placeholder="3–20 characters"><button class="btn" type="submit">Save</button></div><p class="small nickmsg" role="status"></p></form>`;
    const form = slot.querySelector('form')!;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.querySelector('input')!;
      const msg = form.querySelector('.nickmsg')!;
      msg.textContent = 'Saving…';
      const r = await b.setNickname(input.value);
      if (!alive) return;
      if (r.ok) {
        toast('Nickname saved. You are on the board!');
        const nick = input.value.trim();
        document.querySelectorAll('#board-nick, #result-nick').forEach((s) => (s.innerHTML = `<p class="small" style="margin:6px 0 0">Playing as <b>${esc(nick)}</b>.</p>`));
        // The welcome window sits above the page: the board reload below cannot wipe it.
        void loadBoard();
        await showWelcomeDialog(nick);
      } else msg.textContent = r.reason ?? 'Could not save.';
    });
  }
  void loadBoard();

  // The coach the game sees: silent before Start and after the end, so the shell's message stays.
  const gameCoach: Coach = {
    say: (html, mode) => {
      if (run.begun && !run.finished) coach.say(html, mode);
    },
    tutorial: (steps, cb) => coach.tutorial(steps, cb),
    did: (id) => coach.did(id),
    get step() {
      return coach.step;
    },
    get inTutorial() {
      return coach.inTutorial;
    },
  };

  const api: GameApi = {
    start: startClock,
    move(n = 1) {
      lastActivity = performance.now();
      if (!running()) return;
      run.moves += n;
    },
    task(i) {
      if (run.finished || run.done.has(i) || i < 0 || i >= nTasks) return;
      run.done.add(i);
      unlockLesson(meta.id, i);
      lastActivity = performance.now();
      hintsUsed += hints.used;
      hints.set(null);
      track(i === 0 ? 'tutorial_done' : 'task_done', {}, { task: i });
      let title: string, pts: string, detail: string;
      if (i === 0) {
        sc.tutorialPts = TUTORIAL_POINTS;
        startClock();
        title = 'Ready for real';
        pts = `+${TUTORIAL_POINTS}`;
        detail = 'The clock starts when you press Next. It pauses for explainers and replays.';
      } else {
        sc.taskMs[i] = Math.round(clock());
        const ms = sc.taskMs[i] - sc.taskMs[i - 1];
        const s = scoreTask({ ms, mistakes: sc.mistakes[i], comboPoints: sc.comboPts[i] }, meta.parMs[i]);
        sc.scores[i] = s;
        title = `${gradeWord(s.grade, seed + i)} Grade ${s.grade}`;
        pts = `+${fmtPts(s.total)}`;
        detail = [`${(ms / 1000).toFixed(1)} s`, s.speed ? `speed +${s.speed}` : '', s.flawless ? `flawless +${s.flawless}` : '', s.combo ? `combo +${s.combo}` : '', s.penalty ? `mistakes −${s.penalty}` : ''].filter(Boolean).join(' · ');
      }
      sfx.task();
      renderTasks();
      renderPoints();
      const last = run.done.size >= nTasks;
      const nextI = i + 1;
      ui.debrief({
        kicker: i === 0 ? 'Tutorial done' : `Task ${i + 1} of ${nTasks} clear`,
        title,
        pts,
        detail,
        lesson: `<p><b>${esc(meta.tasks[i])}</b></p><p>${meta.lessons[i]}</p>`,
        next: last ? 'See your results →' : `Next: ${esc(meta.tasks[nextI])} →`,
      });
      coach.shellSay(last ? 'All tasks done! Press <b>See your results</b>.' : 'Task clear! Read what just happened, then press <b>Next</b>.', 'act');
      if (last) ui.whenClear(() => finish());
    },
    ready(t, go) {
      setTaskContext(t);
      ui.whenClear(() => {
        ui.closeReplay();
        void ui.learn(meta.learn?.[t], t === 0 ? 'Before you play' : `Before task ${t + 1}`).then(() => {
          if (!alive) return;
          hints.set(meta.hints?.[t]);
          lastActivity = performance.now();
          go();
        });
      });
    },
    predict: (q) => ui.predict(q),
    playback: (pb) => ui.playback(pb),
    penalty(ms) {
      if (running()) {
        run.t0! -= ms;
        sc.penaltyMs += ms;
      }
    },
    hit(label, at) {
      lastActivity = performance.now();
      if (run.finished) return;
      if (!running()) {
        popup(label ?? 'Nice!', 'good', at);
        sfx.hit(1);
        return;
      }
      sc.combo++;
      sc.bestCombo = Math.max(sc.bestCombo, sc.combo);
      const i = curTask();
      const pts = comboPointsFor(sc.combo);
      sc.comboPts[i] = Math.min(COMBO_CAP_PER_TASK, sc.comboPts[i] + pts);
      popup(`+${pts}${label ? ' ' + label : ''}`, 'good', at);
      sfx.hit(sc.combo);
      renderPoints();
    },
    mistake(label, at) {
      lastActivity = performance.now();
      if (run.finished) return;
      if (!running()) {
        popup(label ?? 'Oops', 'bad', at);
        return;
      }
      sc.mistakes[curTask()]++;
      sc.combo = 0;
      popup(`−${MISTAKE_POINTS}${label ? ' ' + label : ''}`, 'bad', at);
      sfx.miss();
      shake();
      renderPoints();
    },
    coach: gameCoach,
    toast,
    side: $('side'),
    onBegin(cb) {
      beginCbs.push(cb);
    },
    get seed() {
      return seed;
    },
    get finished() {
      return run.finished;
    },
  };

  // ---------- start ----------
  const coachStart = document.createElement('button');
  coachStart.className = 'btn go';
  coachStart.type = 'button';
  coachStart.id = 'coach-start';
  coachStart.textContent = 'Start';
  coach.actions.prepend(coachStart);
  coach.shellSay('Press <b>Start</b>. A one-minute explainer comes first, then a guided tutorial.', 'act');

  function begin() {
    if (run.begun) return;
    sfx.unlock();
    run.begun = true;
    setTaskContext(0);
    $('start-row').remove();
    coachStart.remove();
    ($('brief-details') as HTMLDetailsElement).open = false;
    renderTasks();
    void (async () => {
      // The nickname card (opened when the page loaded) must be finished or skipped first.
      if (gateOpen) {
        coach.shellSay('First pick a nickname above, or press <b>Play without ranking</b>.', 'act');
        $('nick-gate')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      await gateDone;
      if (!alive) return;
      coach.shellSay('Read the explainer below. Click through it at your own pace.', 'watch');
      await ui.learn(meta.learn?.[0], 'Before you play');
    })().then(() => {
      if (!alive) return;
      coach.shellSay('Get ready…', 'watch');
      beginCbs.forEach((cb) => cb());
    });
  }
  // While the nickname card is open, the stage waits behind it; clicks there say why instead of doing nothing.
  const gateBlock = (e: Event) => {
    if (!gateOpen) return;
    if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type !== 'click') {
      toast('First pick a nickname above, or press “Play without ranking”.');
      $('nick-gate')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };
  for (const t of ['pointerdown', 'click', 'keydown']) stage.addEventListener(t, gateBlock, true);

  // Nickname first, as soon as the page opens, so the run counts on the leaderboard (players may skip and play unranked).
  let gateOpen = false;
  const gateDone = (async () => {
    const b = await backendReady;
    if (b.kind === 'offline' || gateSkippedToday() || !alive) return;
    const nick = await withTimeout(b.nickname(), 3000, null);
    if (nick || !alive) return;
    gateOpen = true;
    if (!run.begun) coach.shellSay('Pick a nickname to get on the leaderboard, or play without ranking.', 'act');
    stage.classList.add('dimmed');
    await nicknameGate($('teach-slot'), b, () => {}, () => {});
    stage.classList.remove('dimmed');
    gateOpen = false;
    if (alive && !run.begun) coach.shellSay('Press <b>Start</b>. A one-minute explainer comes first, then a guided tutorial.', 'act');
    if (alive) void loadBoard();
  })();
  $('start-btn').addEventListener('click', begin);
  coachStart.addEventListener('click', begin);

  const unmountGame = mod.game.mount(stage, api);
  setGameContext(meta.id);
  track('game_open');

  return {
    unmount() {
      if (run.begun && !run.finished) track('abandon', { ms: Math.round(run.t0 === null ? 0 : clock()) }, { task: curTask() });
      setGameContext(null);
      alive = false;
      clearInterval(timer);
      cancelAnimationFrame(ptsRaf);
      coach.destroy();
      unmountGame();
    },
  };
}
