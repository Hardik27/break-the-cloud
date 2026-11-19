/** Heartbeat view. Server rows and their timeline ticks are created once; each frame only moves ticks and updates text. */
import { el, onPress, setAttr, setText, svgEl } from '../../lib/dom';
import { mulberry32 } from '../../lib/rng';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

type Phase = 'pre' | 'tutorial' | 'play' | 'between' | 'done';
const WINDOW = 6000;
const TICKS = 16;

const INFO = [
  { h: 'Tutorial: evict and replace', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'You are the failure detector', p: `Watch the heartbeat timelines. When a server <b>crashes</b>, evict it (click it). Some servers only <b>pause</b> for a moment and then carry on: evicting those is a mistake. Catch <b>${sim.CRASHES_TO_CATCH} crashes</b>. Put replacements back when they are ready.` },
  { h: 'Too eager', p: 'An automatic detector now evicts any server that misses heartbeats. It is set to evict after 1 missed beat at 0.5 s: it keeps evicting healthy servers during GC pauses. Change the settings and press <b>Run 30 s</b> until there are <b>no false evictions</b>.' },
  { h: 'Fast and safe', p: `Now it is too slow: it takes far too long to notice a real crash. Find settings that catch the crash within <b>${sim.DETECT_GOAL_MS / 1000} s</b>, still with <b>no false evictions</b>.` },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    const rng = mulberry32(api.seed);
    let task = 0;
    let phase: Phase = 'pre';
    let s = sim.create(0, rng);
    const cfg = { interval: 500, threshold: 1 };
    let alive = true;
    let betweenT = 0;

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="hb-s1"></span><span id="hb-s2"></span>`);
    const live = el('div', { class: 'hb-panel' });
    const rows = s.servers.map((srv, i) => {
      const b = el('button', { class: 'hb-row', type: 'button', 'data-hb': i }, `<span class="nm">${srv.name}</span><span class="tl"></span><span class="st"></span><span class="pool"></span>`);
      const tl = svgEl('svg', { viewBox: '0 0 300 22', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
      svgEl('line', { x1: 0, y1: 11, x2: 300, y2: 11, stroke: 'var(--grid)', 'stroke-width': 2 }, tl);
      const ticks = Array.from({ length: TICKS }, () => svgEl('line', { y1: 2, y2: 20, stroke: 'var(--ok)', 'stroke-width': 3, opacity: 0 }, tl));
      b.querySelector('.tl')!.appendChild(tl);
      onPress(b, () => clickServer(i));
      live.appendChild(b);
      return { b, ticks, st: b.querySelector<HTMLElement>('.st')!, pool: b.querySelector<HTMLElement>('.pool')! };
    });
    live.appendChild(el('p', { class: 'small', style: 'margin:6px 0 0' }, 'Timelines show the last 6 seconds. Newest beats on the right.'));
    const tune = el('div', { class: 'hb-panel', hidden: true });
    const intRow = el('div', { class: 'row', role: 'group', 'aria-label': 'Heartbeat interval' }, '<span class="small hb-lbl">Heartbeat every</span>');
    const intBtns = sim.INTERVALS.map((v) => {
      const b = el('button', { class: 'chip', type: 'button', 'data-int': v }, `${v / 1000} s`);
      b.addEventListener('click', () => setCfg('interval', v));
      intRow.appendChild(b);
      return b;
    });
    const thrRow = el('div', { class: 'row', role: 'group', 'aria-label': 'Missed beats before eviction', style: 'margin-top:8px' }, '<span class="small hb-lbl">Evict after</span>');
    const thrBtns = sim.THRESHOLDS.map((v) => {
      const b = el('button', { class: 'chip', type: 'button', 'data-thr': v }, `${v} missed`);
      b.addEventListener('click', () => setCfg('threshold', v));
      thrRow.appendChild(b);
      return b;
    });
    const runRow = el('div', { class: 'row', style: 'margin-top:12px' });
    const timeoutTxt = el('span', { class: 'small', id: 'hb-timeout' });
    const run = el('button', { class: 'btn go', type: 'button', id: 'hb-run' }, 'Run 30 s');
    run.addEventListener('click', runIt);
    runRow.append(run, timeoutTxt);
    const result = el('div', { class: 'hb-result', id: 'hb-result' });
    tune.append(intRow, thrRow, runRow, result);
    stage.append(status, live, tune);

    // ---------- render ----------
    function frameRender() {
      if (task > 1) return;
      s.servers.forEach((srv, i) => {
        const r = rows[i];
        const recent = srv.beats.filter((t) => s.now - t < WINDOW);
        r.ticks.forEach((tk, k) => {
          const t = recent[recent.length - 1 - k];
          if (t === undefined) return setAttr(tk, 'opacity', 0);
          const x = (300 * (WINDOW - (s.now - t))) / WINDOW;
          tk.setAttribute('x1', x.toFixed(1));
          tk.setAttribute('x2', x.toFixed(1));
          setAttr(tk, 'opacity', 1);
          setAttr(tk, 'stroke', srv.inPool ? 'var(--ok)' : 'var(--muted)');
        });
        const sil = sim.silence(s, i);
        const booting = !srv.inPool && srv.replaceAt !== null;
        const ready = !srv.inPool && srv.replaceAt === null && srv.state !== 'dead';
        setText(r.st, booting ? 'replacement booting…' : sil < 900 ? `beat ${(sil / 1000).toFixed(1)} s ago` : `silent ${(sil / 1000).toFixed(1)} s`);
        setText(r.pool, srv.inPool ? 'in pool' : booting ? 'evicted' : ready ? 'ready: click to add' : 'evicted');
        r.b.classList.toggle('warn', srv.inPool && sil >= 900 && sil < 2500);
        r.b.classList.toggle('alarm', srv.inPool && sil >= 2500);
        r.b.classList.toggle('out', !srv.inPool);
        r.b.classList.toggle('ready', ready);
        setAttr(r.b, 'data-pool', srv.inPool ? '1' : ready ? 'ready' : '0');
        setAttr(r.b, 'aria-label', `${srv.name}: ${r.st.textContent}, ${r.pool.textContent}. Activate to ${srv.inPool ? 'evict it' : 'return it to the pool'}.`);
      });
    }

    function render() {
      live.hidden = task > 1;
      tune.hidden = task < 2;
      const s1 = stage.querySelector('#hb-s1')!, s2 = stage.querySelector('#hb-s2')!;
      if (task <= 1) {
        s1.innerHTML = `in pool <b>${s.servers.filter((x) => x.inPool).length}/${sim.N}</b>`;
        s2.innerHTML = task === 1 ? `crashes caught <b>${s.evictedDead}/${sim.CRASHES_TO_CATCH}</b>` : `heartbeat every <b>0.5 s</b>`;
      } else {
        s1.innerHTML = `timeout <b>${((cfg.interval * cfg.threshold) / 1000).toFixed(1)} s</b>`;
        s2.innerHTML = task === 3 ? `goal: catch the crash in <b>≤ ${sim.DETECT_GOAL_MS / 1000} s</b>` : 'goal: <b>no false evictions</b>';
        intBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.int) === cfg.interval)));
        thrBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.thr) === cfg.threshold)));
        timeoutTxt.textContent = `Evicts after ${((cfg.interval * cfg.threshold) / 1000).toFixed(1)} s of silence · ${(1000 / cfg.interval).toFixed(1)} heartbeats per second per server`;
      }
      const prog = api.side.querySelector('#hb-prog');
      if (prog) prog.textContent = task === 1 ? `Crashes caught: ${s.evictedDead} / ${sim.CRASHES_TO_CATCH}` : task >= 2 ? 'Run the 30 s test when ready.' : '';
      if (phase === 'between') api.coach.say('Task clear! Read the lesson; the next task starts in a moment.', 'watch');
      else if (phase === 'play') api.coach.say(...coachLine());
      frameRender();
    }

    function coachLine(): [string, 'act' | 'watch'] {
      if (task === 1) {
        const ready = s.servers.find((x) => !x.inPool && x.replaceAt === null && x.state !== 'dead');
        if (ready) return [`${ready.name}’s replacement is ready. Click it to <b>add it back</b>.`, 'act'];
        const quiet = s.servers.map((x, i) => ({ x, i, sil: sim.silence(s, i) })).filter((o) => o.x.inPool && o.sil > 1000).sort((a, b) => b.sil - a.sil)[0];
        if (quiet) return [`<b>${quiet.x.name}</b> has been silent for ${(quiet.sil / 1000).toFixed(1)} s. Crashed, or just pausing? Evict it when you are sure.`, 'act'];
        return ['Watch the timelines. Evict a server that stays silent, but not one that is only pausing.', 'watch'];
      }
      if (task >= 2) return ['Pick a heartbeat interval and how many missed beats to allow, then press <b>Run 30 s</b>.', 'act'];
      return ['', 'watch'];
    }

    function renderSide() {
      const t = INFO[task];
      api.side.innerHTML = `<p class="eyebrow">${task === 0 ? 'Tutorial' : `Task ${task + 1} of ${meta.tasks.length}`}</p><h2>${t.h}</h2><p style="margin:0">${t.p}</p><div class="progress" id="hb-prog"></div>`;
    }

    // ---------- flow ----------
    function startTask(t: number) {
      task = t;
      phase = t === 0 ? 'tutorial' : 'play';
      if (t <= 1) s = sim.create(t, rng);
      if (t >= 2) {
        Object.assign(cfg, sim.START_CONFIG[t]);
        result.innerHTML = '';
      }
      renderSide();
      render();
    }
    function taskDone() {
      api.task(task);
      if (task >= meta.tasks.length - 1) { phase = 'done'; render(); return; }
      phase = 'between';
      render();
      betweenT = window.setTimeout(() => startTask(task + 1), 2400);
    }
    function guard(): boolean {
      if (phase === 'pre') { api.toast('Press Start first. It is in the brief, and above the game.'); return true; }
      if (phase === 'done') { api.toast('All tasks done. Press Play again to start a new run.'); return true; }
      if (phase === 'between') { api.toast('Task done. The next task starts in a moment.'); return true; }
      return false;
    }

    function clickServer(i: number) {
      if (guard()) return;
      if (task > 1) return api.toast('The detector is automatic now. Change its settings below.');
      const srv = s.servers[i];
      const b = rows[i].b;
      if (phase === 'tutorial') {
        if (i !== 2) return api.toast('Tutorial: click web-3 (highlighted).');
        if (api.coach.step === 'return' && srv.replaceAt !== null) return api.toast('The replacement is still booting. Wait until it says ready.');
      }
      api.move();
      const r = sim.toggle(s, i);
      if (r.kind === 'evicted-dead') {
        api.hit(`caught in ${(r.detectMs / 1000).toFixed(1)} s`, b);
        api.toast(`${srv.name} was dead. Evicted after ${(r.detectMs / 1000).toFixed(1)} s. A replacement is booting.`);
        if (phase === 'tutorial') api.coach.did('evict');
      } else if (r.kind === 'evicted-paused') {
        api.mistake('false eviction', b);
        api.toast(`${srv.name} was only in a GC pause. It is healthy, but now out of the pool. Click it again to return it.`);
      } else if (r.kind === 'evicted-healthy') {
        api.mistake('it was healthy', b);
        api.toast(`${srv.name} was healthy and beating fine. Click it again to return it.`);
      } else if (r.kind === 'returned') {
        api.hit('back in pool', b);
        if (phase === 'tutorial') api.coach.did('return');
      } else {
        api.toast(`${srv.name}’s replacement is still booting.`);
      }
      render();
      if (task === 1 && sim.byHandDone(s)) taskDone();
    }

    function setCfg(k: 'interval' | 'threshold', v: number) {
      if (guard()) return;
      if (task < 2) return api.toast('Detector settings unlock in the next task.');
      cfg[k] = v;
      render();
    }

    function runIt() {
      if (guard()) return;
      if (task < 2) return api.toast('The automatic detector unlocks in the next task.');
      api.move();
      const r = sim.runDetector(cfg.interval, cfg.threshold);
      drawResult(r);
      if (sim.detectorOk(task, r)) {
        api.hit(r.detectMs !== null ? `caught in ${r.detectMs / 1000} s` : 'clean', run);
        taskDone();
        return;
      }
      if (r.falseEvictions.length) {
        api.mistake('false eviction', run);
        api.toast(`${r.falseEvictions.map((i) => sim.NAMES[i]).join(' and ')} ${r.falseEvictions.length > 1 ? 'were' : 'was'} evicted during a GC pause. The timeout (${r.timeout / 1000} s) is shorter than a normal pause.`);
      } else {
        api.mistake('too slow', run);
        api.toast(`No false evictions, but the crash took ${(r.detectMs ?? 0) / 1000} s to catch. Users saw errors all that time. Aim for ${sim.DETECT_GOAL_MS / 1000} s or less.`);
      }
      render();
    }

    function drawResult(r: sim.RunResult) {
      const W = 600, rowH = 22;
      const x = (t: number) => (W * t) / sim.SCENARIO.end;
      let svg = `<svg viewBox="0 0 ${W + 70} ${sim.N * rowH + 24}" class="hb-run" role="img" aria-label="30 second test run">`;
      for (let i = 0; i < sim.N; i++) {
        const y = 10 + i * rowH;
        svg += `<text x="0" y="${y + 5}" font-family="IBM Plex Mono, monospace" font-size="11" fill="var(--ink)">${sim.NAMES[i]}</text>`;
        r.beats[i].forEach((t) => (svg += `<line x1="${70 + x(t)}" y1="${y - 6}" x2="${70 + x(t)}" y2="${y + 6}" stroke="var(--ok)" stroke-width="1.5"/>`));
        const p = sim.SCENARIO.pauses.find((q) => q.server === i);
        if (p) svg += `<rect x="${70 + x(p.at)}" y="${y - 8}" width="${x(p.ms)}" height="16" fill="var(--vote)" opacity=".25"/>`;
        if (i === sim.SCENARIO.crash.server) svg += `<line x1="${70 + x(sim.SCENARIO.crash.at)}" y1="${y - 9}" x2="${70 + x(sim.SCENARIO.crash.at)}" y2="${y + 9}" stroke="var(--bad)" stroke-width="2"/>`;
        r.evictions.filter((e) => e.server === i).forEach((e) => (svg += `<text x="${70 + x(e.at)}" y="${y + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="${e.false ? 'var(--bad)' : 'var(--ok)'}">✕</text>`));
      }
      svg += `<text x="70" y="${sim.N * rowH + 20}" font-family="IBM Plex Mono, monospace" font-size="10" fill="var(--muted)">0 s</text><text x="${W + 70}" y="${sim.N * rowH + 20}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="10" fill="var(--muted)">30 s</text></svg>`;
      result.innerHTML = `${svg}<div class="mrow"><span>False evictions (healthy servers removed)</span><span class="${r.falseEvictions.length ? 'bad-pill' : 'ok-pill'}" id="hb-false">${r.falseEvictions.length}</span></div>
        <div class="mrow"><span>Time to catch the crash</span><span class="${r.detectMs !== null && (task === 2 || r.detectMs <= sim.DETECT_GOAL_MS) ? 'ok-pill' : 'bad-pill'}" id="hb-detect">${r.detectMs === null ? 'missed' : (r.detectMs / 1000).toFixed(1) + ' s'}</span></div>
        <p class="small" style="margin:4px 0 0">Amber band: GC pause. Red line: the crash. ✕: eviction (red = false, green = correct).</p>`;
    }

    // ---------- loop (tasks 0–1 only) ----------
    let last = performance.now();
    let raf = 0;
    let lastPanel = 0;
    function frame(t: number) {
      if (!alive) return;
      const dt = Math.min(100, t - last);
      last = t;
      if ((phase === 'tutorial' || phase === 'play') && task <= 1) {
        for (const e of sim.step(s, dt)) {
          if (e.type === 'overdue' && phase === 'play') {
            api.mistake('users saw errors', rows[e.server].b);
            api.toast(`${s.servers[e.server].name} has been dead for ${sim.UNHANDLED_MS / 1000} s and is still in the pool. Users are getting errors!`);
          } else if (e.type === 'replaced') api.toast(`${s.servers[e.server].name}’s replacement is ready. Click it to add it back.`);
        }
        frameRender();
        if (t - lastPanel > 200) {
          lastPanel = t;
          render();
        }
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    api.onBegin(() => {
      startTask(0);
      api.coach.tutorial(meta.walkthrough, () => {
        api.task(0);
        phase = 'between';
        render();
        betweenT = window.setTimeout(() => startTask(1), 1800);
      });
    });

    render();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(betweenT);
    };
  },
};
