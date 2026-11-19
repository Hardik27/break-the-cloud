/** Autoscaler view. Instance boxes (a fixed pool), gauges and controls are built once; frames update text and classes. */
import { el, onPress, setText } from '../../lib/dom';
import { makeFlow } from '../flow';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

const POOL = 16;
const INFO = [
  { h: 'Tutorial: add and remove', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'The morning ramp', p: `Traffic grows from 150 to 900 requests per second over the morning (sped up: 1 s here is ${sim.SPEEDUP} s). Keep CPU under 100% (users get errors) and above 35% (you pay for idle machines). New instances take ${sim.BOOT_REAL_S} s to boot, so add them <b>before</b> you need them.` },
  { h: 'Target tracking', p: `An autoscaler now adds instances to keep average CPU near a <b>target</b>. Pick the target and press <b>Run day</b> (08:00–16:00). Goal: no overloaded minutes, and the day costs at most $${sim.BUDGET_DAY.toFixed(2)}.` },
  { h: 'Flash sale', p: `Marketing announced a flash sale at 12:00: traffic triples in one minute. Pick the settings and press <b>Run day</b>. Goal: no overloaded minutes, and at most $${sim.BUDGET_SALE.toFixed(2)} for the day.` },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    let m = sim.createManual(0);
    const opts: sim.AutoOpts = { target: 95, min: 2, prewarm: false };
    let alive = true;

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="as-s1"></span><span id="as-s2"></span>`);
    const p1 = el('div', { class: 'as-panel' });
    const gauge = el('div', { class: 'as-gauge', id: 'as-gauge' }, `<span class="eyebrow">CPU</span><b id="as-cpu"></b><span class="as-bar"><i id="as-cpubar"></i><span class="lo"></span></span><span class="small" id="as-load"></span>`);
    const fleet = el('div', { class: 'as-fleet', 'aria-label': 'Instances' });
    const boxes = Array.from({ length: POOL }, () => fleet.appendChild(el('span', { class: 'as-inst' })));
    const ctl = el('div', { class: 'row' });
    const add = el('button', { class: 'btn go as-btn', type: 'button', id: 'as-add' }, '+ instance');
    const remove = el('button', { class: 'btn ghost as-btn', type: 'button', id: 'as-remove' }, '− instance');
    onPress(add, () => doAdd());
    onPress(remove, () => doRemove());
    ctl.append(add, remove);
    const ramp = el('div', { class: 'as-ramp' }, `<span class="small" id="as-clock"></span><span class="as-bar"><i id="as-rampbar"></i></span>`);
    p1.append(gauge, fleet, ctl, ramp);

    const p2 = el('div', { class: 'as-panel', hidden: true });
    const chip = (label: string, attr: string, v: string | number) => el('button', { class: 'chip', type: 'button', [attr]: String(v) }, label);
    const tRow = el('div', { class: 'row', role: 'group', 'aria-label': 'Target CPU' }, '<span class="small as-lbl">Target CPU</span>');
    const tBtns = sim.TARGETS.map((v) => {
      const b = chip(`${v}%`, 'data-target', v);
      b.addEventListener('click', () => setOpt(() => (opts.target = v)));
      tRow.appendChild(b);
      return b;
    });
    const mRow = el('div', { class: 'row', role: 'group', 'aria-label': 'Minimum instances' }, '<span class="small as-lbl">Minimum</span>');
    const mBtns = sim.MINS.map((v) => {
      const b = chip(String(v), 'data-min', v);
      b.addEventListener('click', () => setOpt(() => (opts.min = v)));
      mRow.appendChild(b);
      return b;
    });
    const pre = el('button', { class: 'chip', type: 'button', id: 'as-pre', 'aria-pressed': 'false' }, 'Pre-warm for 12:00 sale');
    pre.addEventListener('click', () => setOpt(() => (opts.prewarm = !opts.prewarm)));
    const pRow = el('div', { class: 'row' }, '<span class="small as-lbl">Schedule</span>');
    pRow.appendChild(pre);
    const run = el('button', { class: 'btn go', type: 'button', id: 'as-run' }, 'Run day');
    run.addEventListener('click', runIt);
    const res = el('div', { class: 'as-res', id: 'as-res' });
    p2.append(tRow, mRow, pRow, run, res);
    stage.append(status, p1, p2);

    const flow = makeFlow(api, meta, INFO, (t) => {
      if (t <= 1) m = sim.createManual(t);
      if (t === 2) Object.assign(opts, { target: 95, min: 2, prewarm: false });
      if (t === 3) Object.assign(opts, { target: 60, min: 2, prewarm: false });
      if (t >= 2) res.innerHTML = '';
    }, render);

    // ---------- render ----------
    function drawManual() {
      const c = sim.cpu(m);
      setText(stage.querySelector('#as-cpu')!, `${Math.round(c * 100)}%`);
      const bar = stage.querySelector<HTMLElement>('#as-cpubar')!;
      bar.style.width = `${Math.min(100, c * 100)}%`;
      gauge.classList.toggle('hot', c > 1);
      gauge.classList.toggle('warm', c > 0.8 && c <= 1);
      gauge.classList.toggle('idle', c < 0.35 && m.running > 1);
      setText(stage.querySelector('#as-load')!, `${sim.rampDemand(m.now)} req/s · capacity ${sim.capacity(m)}`);
      boxes.forEach((b, i) => {
        const cls = i < m.running ? 'as-inst on' : i < m.running + m.booting.length ? 'as-inst boot' : 'as-inst';
        if (b.className !== cls) b.className = cls;
      });
      const realMin = Math.floor((m.now * sim.SPEEDUP) / 60000);
      setText(stage.querySelector('#as-clock')!, `07:${String(realMin).padStart(2, '0')} · morning ramp`);
      stage.querySelector<HTMLElement>('#as-rampbar')!.style.width = `${Math.min(100, (100 * m.now) / sim.RAMP_MS)}%`;
    }

    function render() {
      const t = flow.task;
      p1.hidden = t > 1;
      p2.hidden = t < 2;
      const s1 = stage.querySelector('#as-s1')!, s2 = stage.querySelector('#as-s2')!;
      if (t <= 1) {
        s1.innerHTML = `instances <b>${m.running}</b>${m.booting.length ? ` + ${m.booting.length} booting` : ''}`;
        s2.innerHTML = `overloaded <b>${Math.floor(m.overloadMs / 1000)} s</b> · idle <b>${Math.floor(m.idleMs / 1000)} s</b>`;
        drawManual();
        flow.progress(t === 1 ? `Morning ramp: ${Math.min(100, Math.round((100 * m.now) / sim.RAMP_MS))}%` : '');
      } else {
        mRow.hidden = t === 2;
        pRow.hidden = t === 2;
        tBtns.forEach((b) => {
          b.setAttribute('aria-pressed', String(Number(b.dataset.target) === opts.target));
          b.hidden = t === 3 && ![60, 80].includes(Number(b.dataset.target));
        });
        mBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.min) === opts.min)));
        pre.setAttribute('aria-pressed', String(opts.prewarm));
        s1.innerHTML = `target <b>${opts.target}%</b>${t === 3 ? ` · min <b>${opts.min}</b>${opts.prewarm ? ' · pre-warm' : ''}` : ''}`;
        s2.innerHTML = `budget <b>$${(t === 3 ? sim.BUDGET_SALE : sim.BUDGET_DAY).toFixed(2)}</b>`;
        flow.progress('Run the day when ready.');
      }
      if (!flow.coachBetween() && flow.phase === 'play') api.coach.say(...coachLine());
    }

    function coachLine(): [string, 'act' | 'watch'] {
      const t = flow.task;
      if (t === 1) {
        const projected = sim.rampDemand(m.now + sim.BOOT_MS) / ((m.running + m.booting.length) * sim.PER_INSTANCE);
        if (sim.cpu(m) > 1) return ['Overloaded! Users are getting errors. Click <b>+ instance</b>.', 'act'];
        if (projected > 0.85) return [`In ${sim.BOOT_REAL_S} s traffic will be ${sim.rampDemand(m.now + sim.BOOT_MS)} req/s. Boot an instance <b>now</b>.`, 'act'];
        if (sim.cpu(m) < 0.35 && m.running > 1) return ['CPU is low: you are paying for idle machines. Click <b>− instance</b>.', 'act'];
        return ['Watch the CPU and the trend. Add instances before you need them.', 'watch'];
      }
      if (t === 2) return ['Pick a target CPU, then press <b>Run day</b>.', 'act'];
      if (t === 3) return ['Pick a target, a minimum and a schedule, then press <b>Run day</b>.', 'act'];
      return ['', 'watch'];
    }

    // ---------- actions ----------
    function doAdd() {
      if (flow.guard()) return;
      if (flow.task > 1) return api.toast('The autoscaler adds instances now. Change its settings instead.');
      if (flow.phase === 'tutorial' && api.coach.step !== 'add') return api.toast('Tutorial: click − instance (highlighted).');
      if (m.running + m.booting.length >= POOL) return api.toast(`That is the limit (${POOL}) for this account.`);
      api.move();
      const projected = sim.rampDemand(m.now + sim.BOOT_MS) / ((m.running + m.booting.length) * sim.PER_INSTANCE);
      sim.addInstance(m);
      if (flow.phase === 'tutorial') {
        api.hit('booting', add);
        api.coach.did('add');
      } else if (projected > 0.6) api.hit('just in time', add);
      else api.toast('Booting. CPU was fairly low: this one may sit idle for a while.');
      render();
    }

    function doRemove() {
      if (flow.guard()) return;
      if (flow.task > 1) return api.toast('The autoscaler removes instances now. Change its settings instead.');
      if (flow.phase === 'tutorial' && api.coach.step !== 'remove') return api.toast('Tutorial: click + instance (highlighted).');
      api.move();
      const r = sim.removeInstance(m);
      if (!r.ok) return api.toast('Keep at least one instance running.');
      if (flow.phase === 'tutorial') {
        api.hit('stopped', remove);
        api.coach.did('remove');
      } else if (r.cpuAfter > 1) {
        api.mistake('overloaded', remove);
        api.toast('Too few instances now: CPU is over 100%.');
      } else if (r.cpuAfter < 0.8) api.hit('saved money', remove);
      render();
    }

    function setOpt(f: () => void) {
      if (flow.guard()) return;
      if (flow.task < 2) return api.toast('Autoscaler settings unlock in the next task.');
      f();
      render();
    }

    function runIt() {
      if (flow.guard()) return;
      if (flow.task < 2) return api.toast('Autoscaler settings unlock in the next task.');
      api.move();
      const sale = flow.task === 3;
      const r = sim.runDay(opts, sale);
      drawDay(r, sale);
      if (sim.dayOk(r, sale)) {
        api.hit(`$${r.cost.toFixed(2)}`, run);
        return flow.done();
      }
      api.mistake(r.overloadMin ? 'overloaded' : 'over budget', run);
      if (r.overloadMin) api.toast(sale && !opts.prewarm ? `${r.overloadMin} overloaded minutes at 12:00: traffic tripled faster than new instances could boot.` : `${r.overloadMin} overloaded minutes: with CPU kept near ${opts.target}%, a small spike pushes it past 100% before new instances boot.`);
      else api.toast(`No overload, but the day cost $${r.cost.toFixed(2)}. Too many idle machines.`);
      render();
    }

    function drawDay(r: sim.DayResult, sale: boolean) {
      const W = 600, H = 120;
      const max = Math.max(...r.demand, ...r.running.map((x) => x * sim.PER_INSTANCE)) * 1.05;
      const line = (vals: number[]) => vals.map((v, i) => `${((W * i) / vals.length).toFixed(1)},${(H - (H * v) / max).toFixed(1)}`).join(' ');
      const over = r.demand.map((d, i) => (d > r.running[i] * sim.PER_INSTANCE ? `<rect x="${(W * i) / r.demand.length}" y="0" width="${W / r.demand.length + 0.5}" height="${H}" fill="var(--bad)" opacity=".25"/>` : '')).join('');
      res.innerHTML = `<svg viewBox="0 0 ${W} ${H + 16}" class="as-chart" role="img" aria-label="Traffic and capacity over the day">${over}
        <polyline points="${line(r.running.map((x) => x * sim.PER_INSTANCE))}" fill="none" stroke="var(--ok)" stroke-width="2"/>
        <polyline points="${line(r.demand)}" fill="none" stroke="var(--bad)" stroke-width="1.3"/>
        ${['08:00', '10:00', '12:00', '14:00', '16:00'].map((l, i) => `<text x="${Math.min(W - 18, (W * i) / 4)}" y="${H + 13}" font-family="IBM Plex Mono, monospace" font-size="10" fill="var(--muted)" text-anchor="${i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}">${l}</text>`).join('')}</svg>
        <p class="small" style="margin:0"><span style="color:var(--bad)">red</span>: traffic · <span style="color:var(--ok)">green</span>: capacity · shaded: overloaded</p>
        <div class="mrow"><span>Overloaded minutes</span><span class="${r.overloadMin ? 'bad-pill' : 'ok-pill'}" id="as-over">${r.overloadMin}</span></div>
        <div class="mrow"><span>Cost of the day</span><span class="${r.cost <= (sale ? sim.BUDGET_SALE : sim.BUDGET_DAY) ? 'ok-pill' : 'bad-pill'}" id="as-cost">$${r.cost.toFixed(2)}</span></div>`;
    }

    // ---------- loop ----------
    let last = performance.now();
    let raf = 0;
    let lastPanel = 0;
    let lastToast = 0;
    function frame(t: number) {
      if (!alive) return;
      const dt = Math.min(100, t - last);
      last = t;
      if (flow.task <= 1 && (flow.phase === 'play' || flow.phase === 'tutorial')) {
        for (const e of sim.stepManual(m, dt)) {
          if (flow.phase !== 'play') continue;
          if (e.type === 'overload-second') {
            api.mistake('overloaded', gauge);
            if (t - lastToast > 2500) { lastToast = t; api.toast('CPU over 100%: users are getting errors. Add instances!'); }
          } else if (e.type === 'idle-second') {
            api.mistake('idle', gauge);
            if (t - lastToast > 2500) { lastToast = t; api.toast('CPU under 35%: you are paying for idle machines. Remove one.'); }
          } else if (e.type === 'done') flow.done();
        }
        drawManual();
        if (t - lastPanel > 200) {
          lastPanel = t;
          render();
        }
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    render();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      flow.dispose();
    };
  },
};
