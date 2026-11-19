/** Circuit Breaker view. Gauges and controls are built once; frames update text, styles and classes. */
import { el, onPress, setText } from '../../lib/dom';
import { makeFlow } from '../flow';
import { predictAndReveal, replayBusy } from '../replay';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

const INFO = [
  { h: 'Tutorial: open and probe', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'You are the breaker', p: `Recommendations will go down twice in the next ${sim.BY_HAND_MS / 1000} s. Watch the threads and the error rate. <b>Open</b> the breaker before every thread is stuck. While it is open, <b>Probe</b> now and then; when a probe succeeds, <b>close</b> it again. You don’t know when it recovers: only probes tell you.` },
  { h: 'When should it trip?', p: `An automatic breaker now opens after N failed (or slower than 500 ms) calls in a row, and probes every 5 s. Pick N and press <b>Run 2 min</b>. Goal: the page never goes down, and the breaker never opens because of a harmless one-off blip.` },
  { h: 'How often to probe?', p: `Now pick how often an open breaker sends a probe. Goal: still no downtime, at most ${sim.PROBE_BUDGET} probes into the broken service, and features back within ${sim.RECOVERY_GOAL_MS / 1000} s of recovery.` },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    let m = sim.createManual(0);
    let threshold = 1;
    let probeS = 1;
    let alive = true;

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="cb-s1"></span><span id="cb-s2"></span>`);
    const p1 = el('div', { class: 'cb-panel' });
    const page = el('div', { class: 'cb-page', id: 'cb-page' }, `<b>Shop page</b><span id="cb-pagest"></span><span class="small" id="cb-rec"></span>`);
    const threads = el('div', { class: 'cb-threads' }, `<span class="small">Threads busy</span><span class="as-bar"><i id="cb-tbar"></i></span><b id="cb-tn"></b>`);
    const errs = el('div', { class: 'cb-threads' }, `<span class="small">Calls failing</span><span class="as-bar"><i id="cb-ebar"></i></span><b id="cb-en"></b>`);
    const sw = el('button', { class: 'cb-switch', type: 'button', id: 'cb-switch' }, '');
    onPress(sw, () => doToggle());
    const probeBtn = el('button', { class: 'btn ghost as-btn', type: 'button', id: 'cb-probe' }, 'Probe');
    onPress(probeBtn, () => doProbe());
    const probeRes = el('span', { class: 'small', id: 'cb-probe-res' });
    const row = el('div', { class: 'row' });
    row.append(sw, probeBtn, probeRes);
    const tl = el('div', { class: 'as-ramp' }, `<span class="small" id="cb-clock"></span><span class="as-bar"><i id="cb-tl"></i></span>`);
    p1.append(page, threads, errs, row, tl);

    const p2 = el('div', { class: 'cb-panel', hidden: true });
    const thRow = el('div', { class: 'row', role: 'group', 'aria-label': 'Failures before opening' }, '<span class="small rs-lbl">Open after</span>');
    const thBtns = sim.THRESHOLDS.map((v) => {
      const b = el('button', { class: 'chip', type: 'button', 'data-th': v }, `${v} failure${v > 1 ? 's' : ''}`);
      b.addEventListener('click', () => setOpt(() => (threshold = v)));
      thRow.appendChild(b);
      return b;
    });
    const prRow = el('div', { class: 'row', role: 'group', 'aria-label': 'Probe interval' }, '<span class="small rs-lbl">Probe every</span>');
    const prBtns = sim.PROBES_S.map((v) => {
      const b = el('button', { class: 'chip', type: 'button', 'data-probe': v }, `${v} s`);
      b.addEventListener('click', () => setOpt(() => (probeS = v)));
      prRow.appendChild(b);
      return b;
    });
    const run = el('button', { class: 'btn go', type: 'button', id: 'cb-run' }, 'Run 2 min');
    run.addEventListener('click', runIt);
    const res = el('div', { class: 'as-res', id: 'cb-res' });
    p2.append(thRow, prRow, run, res);
    stage.append(status, p1, p2);

    const flow = makeFlow(api, meta, INFO, (t) => {
      if (t <= 1) m = sim.createManual(t);
      if (t === 0) {
        // Tutorial: a frozen moment in an outage, threads filling.
        m.calls = Array.from({ length: 14 }, () => ({ end: Infinity, ok: false, failAt: 0, counted: true }));
        m.results = Array.from({ length: 8 }, () => ({ t: 0, ok: false }));
      }
      if (t === 2) { threshold = 1; probeS = 5; res.innerHTML = ''; }
      if (t === 3) { threshold = 5; probeS = 1; res.innerHTML = ''; }
    }, render);

    // ---------- render ----------
    function drawManual() {
      const busy = sim.threadsBusy(m);
      const down = busy >= sim.THREADS;
      page.classList.toggle('down', down);
      setText(stage.querySelector('#cb-pagest')!, down ? 'DOWN: all threads stuck' : 'up');
      setText(stage.querySelector('#cb-rec')!, m.open ? 'recommendations hidden (breaker open)' : 'showing recommendations');
      stage.querySelector<HTMLElement>('#cb-tbar')!.style.width = `${(100 * busy) / sim.THREADS}%`;
      threads.classList.toggle('hot', busy >= sim.THREADS * 0.6);
      setText(stage.querySelector('#cb-tn')!, `${busy}/${sim.THREADS}`);
      const er = sim.errorRate(m);
      stage.querySelector<HTMLElement>('#cb-ebar')!.style.width = `${er * 100}%`;
      errs.classList.toggle('hot', er > 0.3);
      setText(stage.querySelector('#cb-en')!, `${Math.round(er * 100)}%`);
      sw.className = `cb-switch ${m.open ? 'open' : 'closed'}`;
      setText(sw, m.open ? 'Breaker OPEN · click to close' : 'Breaker CLOSED · click to open');
      sw.setAttribute('aria-pressed', String(m.open));
      setText(probeRes, m.probe ? (m.probe.ok ? '✓ probe: answered in 100 ms' : '✗ probe: timed out') : '');
      probeRes.className = `small ${m.probe ? (m.probe.ok ? 'okc' : 'badc') : ''}`;
      setText(stage.querySelector('#cb-clock')!, `${Math.floor(m.now / 1000)} s of ${sim.BY_HAND_MS / 1000}`);
      stage.querySelector<HTMLElement>('#cb-tl')!.style.width = `${Math.min(100, (100 * m.now) / sim.BY_HAND_MS)}%`;
    }

    function render() {
      const t = flow.task;
      p1.hidden = t > 1;
      p2.hidden = t < 2;
      const s1 = stage.querySelector('#cb-s1')!, s2 = stage.querySelector('#cb-s2')!;
      if (t <= 1) {
        s1.innerHTML = `page down <b>${(m.pageDownMs / 1000).toFixed(1)} s</b>`;
        s2.innerHTML = `features off needlessly <b>${(m.lostMs / 1000).toFixed(1)} s</b>`;
        drawManual();
        flow.progress(t === 1 ? `Survive: ${Math.floor(m.now / 1000)} / ${sim.BY_HAND_MS / 1000} s` : '');
      } else {
        thRow.hidden = t !== 2;
        prRow.hidden = t !== 3;
        thBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.th) === threshold)));
        prBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.probe) === probeS)));
        s1.innerHTML = `open after <b>${threshold}</b> · probe every <b>${probeS} s</b>`;
        s2.innerHTML = '';
        flow.progress('Run when ready.');
      }
      if (!flow.coachBetween() && flow.phase === 'play') api.coach.say(...coachLine());
    }

    function coachLine(): [string, 'act' | 'watch'] {
      const t = flow.task;
      if (t === 1) {
        if (!m.open && sim.threadsBusy(m) >= 6) return ['Calls are hanging and threads are filling up. <b>Open the breaker!</b>', 'act'];
        if (m.open && (!m.probe || m.now - m.probe.t > 3000)) return ['The breaker is open. <b>Probe</b> to check whether recommendations is back.', 'act'];
        if (m.open && m.probe?.ok) return ['The probe succeeded: the service is back. <b>Close the breaker.</b>', 'act'];
        if (m.open) return ['Still failing. Probe again in a few seconds.', 'watch'];
        return ['All healthy. Watch the threads and the error rate.', 'watch'];
      }
      if (t === 2) return ['Pick how many failures in a row open the breaker, then press <b>Run 2 min</b>.', 'act'];
      if (t === 3) return ['Pick how often the open breaker probes, then press <b>Run 2 min</b>.', 'act'];
      return ['', 'watch'];
    }

    // ---------- actions ----------
    function doToggle() {
      if (flow.guard()) return;
      if (flow.task > 1) return api.toast('The breaker is automatic now. Change its settings below.');
      if (flow.phase === 'tutorial') {
        if (api.coach.step !== 'open') return api.toast('Tutorial: click Probe (highlighted).');
        sim.toggle(m);
        m.calls = [];
        api.hit('tripped', sw);
        api.coach.did('open');
        render();
        return;
      }
      api.move();
      const up = sim.serviceUp(m);
      const open = sim.toggle(m);
      if (open && !up) api.hit('tripped', sw);
      else if (open && up) {
        api.mistake('nothing wrong', sw);
        api.toast('Recommendations was working fine. Now the page hides it for no reason.');
      } else if (!open && up) api.hit('restored', sw);
      else {
        api.mistake('still down', sw);
        api.toast('Recommendations is still failing: calls will hang and fill the threads again. Probe before closing.');
      }
      render();
    }

    function doProbe() {
      if (flow.guard()) return;
      if (flow.task > 1) return api.toast('The breaker probes automatically now.');
      if (flow.phase === 'tutorial') {
        if (api.coach.step !== 'probe') return api.toast('Tutorial: click the breaker (highlighted).');
        m.probe = { t: m.now, ok: false };
        api.coach.did('probe');
        render();
        return;
      }
      api.move();
      const ok = sim.probe(m);
      if (ok && m.open) api.hit('it is back', probeBtn);
      render();
    }

    function setOpt(f: () => void) {
      if (flow.guard()) return;
      if (flow.task < 2) return api.toast('Breaker settings unlock in the next task.');
      f();
      render();
    }

    async function runIt() {
      if (flow.guard()) return;
      if (flow.task < 2) return api.toast('Breaker settings unlock in the next task.');
      if (replayBusy()) return api.toast('Watch the replay first.');
      api.move();
      const r = sim.runAuto(threshold, probeS);
      drawResult(r);
      const ok = flow.task === 2 ? sim.thresholdOk(r) : sim.probeOk(r);
      const q = flow.task === 2
        ? { q: `The breaker opens after ${threshold} failed call${threshold > 1 ? 's' : ''} in a row. Over 2 minutes there are one-off blips and one real outage. What happens?`, options: ['It opens on harmless blips', 'It opens too late: the page goes down', 'It opens only for the real outage'], answer: r.falseOpens ? 0 : r.pageDownMs ? 1 : 2, why: r.falseOpens ? 'A low threshold mistakes a single slow call for an outage.' : r.pageDownMs ? 'A high threshold waits while every thread gets stuck on a dead service.' : 'A few failures in a row is a real pattern; one is just a blip.' }
        : { q: `The open breaker sends a probe every ${probeS} s. What happens?`, options: ['Too many probes hit the recovering service', 'Recommendations come back long after the service did', 'Few probes, and a quick recovery'], answer: r.probesInOutage > sim.PROBE_BUDGET ? 0 : r.recoveryMs > sim.RECOVERY_GOAL_MS ? 1 : 2, why: r.probesInOutage > sim.PROBE_BUDGET ? 'Frequent probes add load to a service that is trying to come back.' : r.recoveryMs > sim.RECOVERY_GOAL_MS ? 'Rare probes mean nobody notices the service is back for a long time.' : 'A middle interval checks often enough without hammering it.' };
      await predictAndReveal(api, res, { title: '2 minutes with the breaker', simMs: sim.AUTO_MS, predict: q });
      if (!alive) return;
      if (ok) {
        api.hit('resilient', run);
        return flow.done();
      }
      api.mistake('not yet', run);
      if (r.pageDownMs) api.toast(`The page was down for ${(r.pageDownMs / 1000).toFixed(1)} s: the breaker waited for too many failures while every thread got stuck.`);
      else if (r.falseOpens) api.toast(`The breaker opened ${r.falseOpens} times on harmless one-off blips, hiding recommendations for no reason.`);
      else if (r.probesInOutage > sim.PROBE_BUDGET) api.toast(`${r.probesInOutage} probes hit a service that was trying to recover.`);
      else api.toast(`Recommendations came back ${(r.recoveryMs / 1000).toFixed(0)} s after the service did. Users missed it all that time.`);
      render();
    }

    function drawResult(r: sim.AutoResult) {
      const W = 600, H = 34;
      const x = (t: number) => (W * t) / sim.AUTO_MS;
      const spans = r.openSpans.map(([a, b]) => `<rect x="${x(a)}" y="4" width="${Math.max(2, x(b) - x(a))}" height="${H - 8}" fill="var(--bad)" opacity=".8"/>`).join('');
      res.innerHTML = `<svg viewBox="0 0 ${W} ${H + 30}" class="as-chart" role="img" aria-label="Breaker over 2 minutes">
        <rect x="${x(sim.AUTO_OUTAGE[0])}" y="0" width="${x(sim.AUTO_OUTAGE[1]) - x(sim.AUTO_OUTAGE[0])}" height="${H}" fill="var(--vote)" opacity=".25"/>
        <rect x="0" y="4" width="${W}" height="${H - 8}" fill="var(--ok)" opacity=".25"/>${spans}
        <text x="0" y="${H + 14}" font-family="IBM Plex Mono, monospace" font-size="10" fill="var(--muted)">amber band: service down · red: breaker open</text></svg>
        <div class="mrow"><span>Page down</span><span class="${r.pageDownMs ? 'bad-pill' : 'ok-pill'}" id="cb-down">${(r.pageDownMs / 1000).toFixed(1)} s</span></div>
        <div class="mrow"><span>Opened for no reason (blips)</span><span class="${r.falseOpens ? 'bad-pill' : 'ok-pill'}" id="cb-false">${r.falseOpens}</span></div>
        ${flow.task === 3 ? `<div class="mrow"><span>Probes into the broken service</span><span class="${r.probesInOutage > sim.PROBE_BUDGET ? 'bad-pill' : 'ok-pill'}" id="cb-probes">${r.probesInOutage}</span></div>
        <div class="mrow"><span>Features back after recovery</span><span class="${r.recoveryMs <= sim.RECOVERY_GOAL_MS ? 'ok-pill' : 'bad-pill'}" id="cb-rec2">${(r.recoveryMs / 1000).toFixed(1)} s</span></div>` : ''}`;
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
        if (flow.phase === 'play') {
          for (const e of sim.stepManual(m, dt)) {
            if (e.type === 'down-second') {
              api.mistake('page down', page);
              if (t - lastToast > 2500) { lastToast = t; api.toast('Every thread is stuck waiting on recommendations: the whole shop page is down!'); }
            } else if (e.type === 'lost-second') {
              api.mistake('feature off', sw);
              if (t - lastToast > 2500) { lastToast = t; api.toast('Recommendations is back, but the breaker is still open. Probe and close it.'); }
            } else if (e.type === 'done') flow.done();
          }
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
