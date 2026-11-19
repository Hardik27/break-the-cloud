/** Retry Storm view. The pacing meter, tiles and policy controls are built once; frames update text and styles. */
import { el, onPress, setText } from '../../lib/dom';
import { makeFlow } from '../flow';
import { predictAndReveal, replayBusy } from '../replay';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

const INFO = [
  { h: 'Tutorial: a retry', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'Pace the retries', p: `The payment API is recovering from an outage. It can take about 1 request per second now, rising to 3. You have <b>${sim.PACE_RETRIES} failed payments</b> to retry. Send each one when the meter shows room. A retry into a full API fails, and still adds load.` },
  { h: 'Pick a retry policy', p: `${sim.CLIENTS} clients call the API. At 5 s it crashes and serves only ${sim.OUTAGE_CAPACITY} requests per second for 10 s. Pick how clients retry, then press <b>Run</b>. Goal: during the outage, total load stays under ${sim.OUTAGE_LOAD_GOAL}× normal.` },
  { h: 'Break the waves', p: `The crash failed every client at the same instant, so their retries are in lockstep. Find settings where outage load stays under ${sim.OUTAGE_LOAD_GOAL}× normal <b>and</b> no 100 ms after recovery gets more than the API can take.` },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    let pace = sim.createPace(0);
    let policy: sim.Policy = 'immediate';
    let jitter = false;
    let alive = true;

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="rs-s1"></span><span id="rs-s2"></span>`);
    const p1 = el('div', { class: 'rs-panel' });
    const meter = el('div', { class: 'rs-meter', id: 'rs-meter' }, `<span class="eyebrow">API load (last second)</span><b id="rs-load"></b><span class="as-bar"><i id="rs-bar"></i></span>`);
    const tiles = el('div', { class: 'rs-tiles', 'aria-label': 'Queued retries' });
    const tileEls = Array.from({ length: sim.PACE_RETRIES }, (_, i) => tiles.appendChild(el('span', { class: 'rs-tile' }, `#${i + 1}`)));
    const send = el('button', { class: 'btn go as-btn', type: 'button', id: 'rs-send' }, 'Send retry');
    onPress(send, () => doSend());
    p1.append(meter, tiles, send);

    const p2 = el('div', { class: 'rs-panel', hidden: true });
    const pRow = el('div', { class: 'row', role: 'group', 'aria-label': 'Retry policy' }, '<span class="small rs-lbl">Retry</span>');
    const pBtns = sim.POLICIES.map((p) => {
      const b = el('button', { class: 'chip', type: 'button', 'data-policy': p }, { immediate: 'Immediately', fixed: 'Every 1 s', exponential: 'Exponential backoff' }[p]);
      b.addEventListener('click', () => setOpt(() => (policy = p)));
      pRow.appendChild(b);
      return b;
    });
    const jRow = el('div', { class: 'row' }, '<span class="small rs-lbl">Jitter</span>');
    const jBtn = el('button', { class: 'chip', type: 'button', id: 'rs-jitter', 'aria-pressed': 'false' }, 'Add jitter');
    jBtn.addEventListener('click', () => setOpt(() => (jitter = !jitter)));
    jRow.appendChild(jBtn);
    const run = el('button', { class: 'btn go', type: 'button', id: 'rs-run' }, 'Run');
    run.addEventListener('click', runIt);
    const res = el('div', { class: 'as-res', id: 'rs-res' });
    p2.append(pRow, jRow, run, res);
    stage.append(status, p1, p2);

    const flow = makeFlow(api, meta, INFO, (t) => {
      if (t <= 1) pace = sim.createPace(t);
      if (t === 2) { policy = 'immediate'; jitter = false; res.innerHTML = ''; }
      if (t === 3) { policy = 'exponential'; jitter = false; res.innerHTML = ''; }
    }, render);

    // ---------- render ----------
    function drawPace() {
      const load = sim.loadLastSecond(pace);
      const cap = sim.paceCapacity(pace);
      setText(stage.querySelector('#rs-load')!, pace.frozen ? `${load} / plenty` : `${load} / ${cap.toFixed(1)} per s`);
      stage.querySelector<HTMLElement>('#rs-bar')!.style.width = `${pace.frozen ? 10 : Math.min(100, (100 * load) / cap)}%`;
      const room = load + 1 <= cap;
      meter.classList.toggle('full', !room);
      send.classList.toggle('pulse', room && !pace.frozen);
      tileEls.forEach((tl, i) => {
        const cls = i < pace.sent ? 'rs-tile ok' : 'rs-tile';
        if (tl.className !== cls) tl.className = cls;
      });
    }

    function render() {
      const t = flow.task;
      p1.hidden = t > 1;
      p2.hidden = t < 2;
      jRow.hidden = t !== 3;
      const s1 = stage.querySelector('#rs-s1')!, s2 = stage.querySelector('#rs-s2')!;
      if (t <= 1) {
        s1.innerHTML = `sent <b>${pace.sent}${t === 1 ? '/' + sim.PACE_RETRIES : ''}</b>`;
        s2.innerHTML = `failed retries <b>${pace.failed}</b>`;
        drawPace();
        flow.progress(t === 1 ? `Retries through: ${pace.sent} / ${sim.PACE_RETRIES}` : '');
      } else {
        pBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.policy === policy)));
        jBtn.setAttribute('aria-pressed', String(jitter));
        s1.innerHTML = `policy <b>${policy}${jitter ? ' + jitter' : ''}</b>`;
        s2.innerHTML = `outage load goal <b>≤ ${sim.OUTAGE_LOAD_GOAL}×</b>`;
        flow.progress('Run when ready.');
      }
      if (!flow.coachBetween() && flow.phase === 'play') api.coach.say(...coachLine());
    }

    function coachLine(): [string, 'act' | 'watch'] {
      const t = flow.task;
      if (t === 1) return sim.loadLastSecond(pace) + 1 <= sim.paceCapacity(pace) ? ['The API has room: <b>Send retry</b>.', 'act'] : ['The API is full. Wait for the meter to drop.', 'watch'];
      if (t === 2) return ['Pick how clients retry, then press <b>Run</b>.', 'act'];
      if (t === 3) return ['Pick a policy and whether to add jitter, then press <b>Run</b>.', 'act'];
      return ['', 'watch'];
    }

    // ---------- actions ----------
    function doSend() {
      if (flow.guard()) return;
      if (flow.task > 1) return api.toast('Clients retry automatically now. Pick their policy below.');
      if (pace.sent >= sim.PACE_RETRIES) return;
      api.move();
      const r = sim.send(pace);
      if (r === 'ok') {
        api.hit('through', send);
        if (flow.phase === 'tutorial') api.coach.did(api.coach.step!);
      } else {
        api.mistake('API full', send);
        api.toast('The API was already full: that retry failed and made the overload worse. Wait for room.');
      }
      render();
      if (flow.task === 1 && sim.paceDone(pace)) flow.done();
    }

    function setOpt(f: () => void) {
      if (flow.guard()) return;
      if (flow.task < 2) return api.toast('Retry policies unlock in the next task.');
      f();
      render();
    }

    async function runIt() {
      if (flow.guard()) return;
      if (flow.task < 2) return api.toast('Retry policies unlock in the next task.');
      if (replayBusy()) return api.toast('Watch the replay first.');
      api.move();
      const r = sim.storm(policy, flow.task === 3 && jitter);
      drawResult(r);
      const ok = flow.task === 2 ? sim.backoffOk(r) : sim.jitterOk(r);
      const outcome = r.outageLoad > sim.OUTAGE_LOAD_GOAL ? 0 : r.peakAfter > sim.PEAK_GOAL ? 1 : 2;
      await predictAndReveal(api, res, {
        title: 'The outage, second by second',
        simMs: r.loadPerSec.length * 1000,
        predict: { q: 'The API crashes, then recovers. With your retry policy, what happens?', options: ['Clients flood the API during the outage', 'Calm during the outage, but everyone retries at the same moment when it recovers', 'Calm during the outage and a smooth recovery'], answer: outcome, why: outcome === 0 ? 'Retrying immediately or at a fixed short delay multiplies traffic exactly when the API is weakest.' : outcome === 1 ? 'Backoff calms the outage, but clients that failed together retry together: synchronized waves.' : 'Growing waits calm the outage, and random jitter spreads the retries out.' },
      });
      if (!alive) return;
      if (ok) {
        api.hit('storm calmed', run);
        return flow.done();
      }
      api.mistake('storm', run);
      if (r.outageLoad > sim.OUTAGE_LOAD_GOAL) api.toast(`During the outage clients sent ${r.outageLoad.toFixed(1)}× normal traffic into an API that could take a fifth of it.`);
      else api.toast(`Outage load was fine, but every client retried in the same 100 ms: ${r.peakAfter.toFixed(1)}× what the API can take.`);
      render();
    }

    function drawResult(r: sim.StormResult) {
      const W = 600, H = 110;
      const max = Math.max(...r.loadPerSec, sim.CAPACITY) * 1.05;
      const bw = W / r.loadPerSec.length;
      const bars = r.loadPerSec.map((v, i) => `<rect x="${i * bw + 1}" y="${H - (H * v) / max}" width="${bw - 2}" height="${(H * v) / max}" fill="${v > r.capPerSec[i] ? 'var(--bad)' : 'var(--append)'}"/>`).join('');
      const cap = r.capPerSec.map((c, i) => `${i * bw},${H - (H * c) / max} ${(i + 1) * bw},${H - (H * c) / max}`).join(' ');
      res.innerHTML = `<svg viewBox="0 0 ${W} ${H + 14}" class="as-chart" role="img" aria-label="Load per second">${bars}<polyline points="${cap}" fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="5 4"/>
        <text x="${5 * bw}" y="${H + 12}" font-family="IBM Plex Mono, monospace" font-size="10" fill="var(--muted)">crash</text><text x="${15 * bw}" y="${H + 12}" font-family="IBM Plex Mono, monospace" font-size="10" fill="var(--muted)">recovered</text></svg>
        <div class="mrow"><span>Load during the outage vs normal</span><span class="${r.outageLoad <= sim.OUTAGE_LOAD_GOAL ? 'ok-pill' : 'bad-pill'}" id="rs-ol">${r.outageLoad.toFixed(2)}×</span></div>
        ${flow.task === 3 ? `<div class="mrow"><span>Busiest 100 ms after recovery vs capacity</span><span class="${r.peakAfter <= sim.PEAK_GOAL ? 'ok-pill' : 'bad-pill'}" id="rs-peak">${r.peakAfter.toFixed(2)}×</span></div>` : ''}
        <div class="mrow"><span>Requests that gave up with an error</span><span class="ok-pill">${r.errorsPct.toFixed(1)}%</span></div>`;
    }

    // ---------- loop ----------
    let last = performance.now();
    let raf = 0;
    let lastPanel = 0;
    function frame(t: number) {
      if (!alive) return;
      const dt = Math.min(100, t - last);
      last = t;
      if (flow.task <= 1 && (flow.phase === 'play' || flow.phase === 'tutorial')) {
        if (flow.phase === 'play') sim.stepPace(pace, dt);
        drawPace();
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
