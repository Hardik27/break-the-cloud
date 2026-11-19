/** Play page: HUD (timer, moves, tasks), coach bar, stage, side panel, lessons, result card, Learn more. */
import type { GameEntry } from '../games/registry';
import type { Coach, GameApi, GameMeta, LegendItem } from '../games/types';
import { esc, fmtTime } from '../lib/dom';
import { randomSeed } from '../lib/rng';
import { getBest, saveBest } from '../lib/storage';
import { footer, toast, topbar } from './chrome';
import { createCoach } from './coach';

const titleHtml = (t: string) => {
  const i = t.lastIndexOf(' ');
  return i < 0 ? `<span>${esc(t)}</span>` : `${esc(t.slice(0, i))} <span>${esc(t.slice(i + 1))}</span>`;
};

const legendHtml = (items: LegendItem[]) =>
  `<ul class="legend">${items
    .map((l) => `<li><span class="sw ${l.shape}" style="background:${l.color};--c:${l.color}"></span><span>${l.label}</span></li>`)
    .join('')}</ul>`;

function bestHtml(id: string): string {
  const b = getBest(id);
  return (
    `<p class="eyebrow">Your best in this browser</p>` +
    (b ? `<p style="margin:0"><b>${fmtTime(b.ms)}</b> <span class="small">· ${b.moves} moves</span></p>` : `<p class="small" style="margin:0">No time yet. Finish every task to set one.</p>`) +
    `<p class="small" style="margin:6px 0 0">The shared leaderboard arrives in the next update.</p>`
  );
}

export interface PlayHandle {
  unmount(): void;
}

export async function renderPlay(app: HTMLElement, entry: GameEntry, seedParam: number | null, onReplay: () => void): Promise<PlayHandle> {
  const mod = await entry.load!();
  const meta: GameMeta = mod.meta;
  const nTasks = meta.tasks.length;

  app.innerHTML =
    topbar() +
    `<div class="playhead"><div><p class="eyebrow"><a href="#/">← All games</a> · Level ${meta.level} · ${esc(meta.concept)}</p><h1>${titleHtml(meta.title)}</h1></div>
      <div class="hud" aria-label="Run status"><span id="hud-time-wrap" class="paused">time<b id="hud-time">0:00.0</b></span><span>moves<b id="hud-moves">0</b></span><span>tasks<b id="hud-tasks">0/${nTasks}</b></span></div></div>
    <div class="bench">
      <div class="stagecol"><div id="coach-slot"></div><section class="card stage" id="stage" aria-label="${esc(meta.title)} game"></section></div>
      <aside>
        <div class="card result" id="result" hidden aria-live="polite"></div>
        <div class="card brief" id="brief"><details id="brief-details" open><summary class="eyebrow" style="cursor:pointer;margin:0 0 8px">Brief</summary>
          <h2>${esc(meta.concept)}</h2><p>${meta.intro}</p>
          <p class="eyebrow">On screen</p>${legendHtml(meta.legend)}
          <p class="eyebrow">How to play</p><ul>${meta.howTo.map((x) => `<li>${x}</li>`).join('')}</ul></details>
          <div class="row" id="start-row"><button class="btn go" id="start-btn" type="button">Start</button><span class="small">A short tutorial comes first. The clock starts after it.</span></div>
        </div>
        <div class="card" id="side"></div>
        <div class="card" id="lesson-card" hidden aria-live="polite"><p class="eyebrow" id="lesson-title">Lesson</p><div class="lesson" id="lesson"></div></div>
        <div class="card"><p class="eyebrow">Tasks</p><ol class="tasks" id="tasks"></ol></div>
        <div class="card" id="best">${bestHtml(meta.id)}</div>
      </aside>
    </div>
    <section class="card" id="learn" hidden></section>` +
    footer();

  const $ = <T extends HTMLElement = HTMLElement>(id: string) => app.querySelector<T>('#' + id)!;
  const stage = $('stage');
  const coach = createCoach($('coach-slot'), toast);

  // ---------- run state ----------
  const run = { begun: false, t0: null as number | null, elapsed: 0, moves: 0, done: new Set<number>(), taskTimes: [] as number[], finished: false };
  const seed = seedParam ?? randomSeed();
  const beginCbs: (() => void)[] = [];
  const running = () => run.t0 !== null && !run.finished;

  function renderTasks() {
    const cur = [...Array(nTasks).keys()].find((i) => !run.done.has(i));
    $('tasks').innerHTML = meta.tasks
      .map((t, i) => {
        const cls = run.done.has(i) ? 'ok' : i === cur && run.begun ? 'cur' : '';
        return `<li class="${cls}" data-task="${i}"><span class="box">${run.done.has(i) ? '✓' : i + 1}</span><span>${esc(t)}</span></li>`;
      })
      .join('');
    $('hud-tasks').textContent = `${run.done.size}/${nTasks}`;
  }
  renderTasks();

  const timer = window.setInterval(() => {
    if (running()) {
      run.elapsed = performance.now() - run.t0!;
      $('hud-time').textContent = fmtTime(run.elapsed);
    }
  }, 100);

  function startClock() {
    if (run.t0 === null && !run.finished) {
      run.t0 = performance.now();
      $('hud-time-wrap').classList.remove('paused');
    }
  }

  function showLesson(i: number) {
    const card = $('lesson-card');
    card.hidden = false;
    $('lesson-title').textContent = `Lesson · task ${i + 1} done`;
    $('lesson').innerHTML = `<p><b>${esc(meta.tasks[i])}</b></p><p>${meta.lessons[i]}</p>`;
  }

  function finish() {
    run.finished = true;
    run.elapsed = run.t0 === null ? 0 : performance.now() - run.t0;
    $('hud-time').textContent = fmtTime(run.elapsed);
    const pb = saveBest(meta.id, run.elapsed, run.moves);
    const res = $('result');
    res.hidden = false;
    res.innerHTML = `<p class="eyebrow">Run complete</p><div class="big" id="result-time">${fmtTime(run.elapsed)}</div>
      <p class="small">${run.moves} moves${pb ? ' · new personal best' : ''}</p>
      <div class="row" style="margin-top:8px"><button class="btn" id="again" type="button">Play again</button><a class="btn ghost" href="#/" style="text-decoration:none">All games</a><button class="btn ghost" id="to-learn" type="button">Learn more ↓</button></div>`;
    $('again').addEventListener('click', onReplay);
    $('to-learn').addEventListener('click', () => $('learn').scrollIntoView({ behavior: 'smooth', block: 'start' }));
    $('best').innerHTML = bestHtml(meta.id);
    const lm = meta.learnMore;
    const learn = $('learn');
    learn.hidden = false;
    learn.innerHTML = `<div class="learn"><div><p class="eyebrow">Learn more</p><h2>${esc(meta.concept)} in depth</h2>${lm.paragraphs
      .map((p) => `<p>${p}</p>`)
      .join('')}<p class="eyebrow" style="margin-top:14px">Primary sources</p><ul>${lm.links
      .map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a></li>`)
      .join('')}</ul></div><figure>${lm.diagram}<figcaption>${lm.caption}</figcaption></figure></div>`;
    coach.shellSay('All tasks done. Read the last lesson, then scroll to <b>Learn more</b>.', 'watch');
    res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

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
      if (!running()) return;
      run.moves += n;
      $('hud-moves').textContent = String(run.moves);
    },
    task(i) {
      if (run.finished || run.done.has(i) || i < 0 || i >= nTasks) return;
      run.done.add(i);
      run.taskTimes[i] = run.t0 === null ? 0 : Math.round(performance.now() - run.t0);
      renderTasks();
      showLesson(i);
      if (i === 0) startClock();
      if (run.done.size >= nTasks) finish();
    },
    penalty(ms) {
      if (running()) run.t0! -= ms;
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
  coach.shellSay('Read the brief, then press <b>Start</b>.', 'act');

  function begin() {
    if (run.begun) return;
    run.begun = true;
    $('start-row').remove();
    coachStart.remove();
    ($('brief-details') as HTMLDetailsElement).open = false;
    renderTasks();
    coach.shellSay('Get ready…', 'watch');
    beginCbs.forEach((cb) => cb());
  }
  $('start-btn').addEventListener('click', begin);
  coachStart.addEventListener('click', begin);

  const unmountGame = mod.game.mount(stage, api);

  return {
    unmount() {
      clearInterval(timer);
      coach.destroy();
      unmountGame();
    },
  };
}
