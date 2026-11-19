/** Quorum view. Turn-based: replica cards and buttons are built once; text and classes update after each action. */
import { el, onPress, setText } from '../../lib/dom';
import { makeFlow } from '../flow';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

const INFO = [
  { h: 'Tutorial: one write', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'You are the coordinator', p: `${sim.ROUNDS} rounds. In each one, pick replicas and <b>Send write</b>, then pick replicas and <b>Read</b>. Every read must return the newest value. Careful: replicas sometimes crash right after a write.` },
  { h: 'Pick R and W', p: `Now the coordinator does it for you: every write goes to <b>W</b> random replicas, every read asks <b>R</b> random replicas. Pick R and W, then press <b>Run ${sim.OPS} requests</b>. Goal: zero stale reads, and each write plus read waits for at most ${sim.LATENCY_BUDGET_MS} ms (${sim.MS_PER_REPLICA} ms per replica asked).` },
  { h: 'One replica dies', p: 'Replica C crashes for the first half of the run, then comes back with old data. Pick R and W so every read is still fresh <b>and</b> no read or write fails. No latency budget this time.' },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    let c = sim.createCoord();
    let r = 1;
    let w = 1;
    const log: string[] = [];

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="qr-s1"></span><span id="qr-s2"></span>`);
    const p1 = el('div', { class: 'qr-panel' });
    const reps = el('div', { class: 'qr-reps', role: 'group', 'aria-label': 'Replicas' });
    const repEls = sim.NAMES.map((n, i) => {
      const b = el('button', { class: 'qr-rep', type: 'button', 'data-rep': i, 'aria-pressed': 'false' }, `<b>${n}</b><span class="qr-val"></span><span class="small qr-st"></span>`);
      onPress(b, () => pick(i));
      reps.appendChild(b);
      return b;
    });
    const send = el('button', { class: 'btn go', type: 'button', id: 'qr-send' }, 'Send write');
    onPress(send, () => doSend());
    const hint = el('span', { class: 'small', id: 'qr-hint' });
    const row = el('div', { class: 'row' });
    row.append(send, hint);
    const feed = el('div', { class: 'feed' });
    const feedLines = Array.from({ length: 4 }, () => feed.appendChild(el('div')));
    p1.append(reps, row, feed);

    const p2 = el('div', { class: 'qr-panel', hidden: true });
    const rRow = el('div', { class: 'row', role: 'group', 'aria-label': 'Read quorum R' }, '<span class="small qr-lbl">Read from R =</span>');
    const rBtns = sim.RS.map((v) => {
      const b = el('button', { class: 'chip', type: 'button', 'data-r': v }, String(v));
      b.addEventListener('click', () => setOpt(() => (r = v)));
      rRow.appendChild(b);
      return b;
    });
    const wRow = el('div', { class: 'row', role: 'group', 'aria-label': 'Write quorum W' }, '<span class="small qr-lbl">Write to W =</span>');
    const wBtns = sim.WS.map((v) => {
      const b = el('button', { class: 'chip', type: 'button', 'data-w': v }, String(v));
      b.addEventListener('click', () => setOpt(() => (w = v)));
      wRow.appendChild(b);
      return b;
    });
    const sum = el('p', { class: 'small qr-sum', id: 'qr-sum' });
    const run = el('button', { class: 'btn go', type: 'button', id: 'qr-run' }, `Run ${sim.OPS} requests`);
    run.addEventListener('click', runIt);
    const res = el('div', { class: 'as-res', id: 'qr-res' });
    p2.append(rRow, wRow, sum, run, res);
    stage.append(status, p1, p2);

    const flow = makeFlow(api, meta, INFO, (t) => {
      if (t <= 1) { c = sim.createCoord(); log.length = 0; }
      if (t === 2) { r = 1; w = 1; res.innerHTML = ''; }
      if (t === 3) { r = 1; w = 3; res.innerHTML = ''; }
    }, render);

    // ---------- render ----------
    function render() {
      const t = flow.task;
      p1.hidden = t > 1;
      p2.hidden = t < 2;
      const s1 = stage.querySelector('#qr-s1')!, s2 = stage.querySelector('#qr-s2')!;
      if (t <= 1) {
        repEls.forEach((b, i) => {
          const rep = c.replicas[i];
          b.classList.toggle('newest', c.latest > 0 && rep.version === c.latest);
          b.classList.toggle('down', !rep.up);
          b.setAttribute('aria-pressed', String(c.selected.has(i)));
          setText(b.querySelector('.qr-val')!, rep.version ? `v${rep.version} = ${rep.value}` : 'empty');
          setText(b.querySelector('.qr-st')!, !rep.up ? 'CRASHED' : rep.version === c.latest && c.latest ? 'newest' : rep.version ? 'old value' : '');
        });
        const reading = c.phase === 'read';
        setText(send, reading ? 'Read' : `Send write (${sim.writeValue(c)})`);
        send.classList.toggle('qr-read', reading);
        setText(hint, c.selected.size ? `${c.selected.size} replica${c.selected.size > 1 ? 's' : ''} picked · ${c.selected.size * sim.MS_PER_REPLICA} ms` : 'pick replicas first');
        feedLines.forEach((d, i) => setText(d, log[i] ?? ''));
        s1.innerHTML = t === 1 ? `round <b>${Math.min(c.round + 1, sim.ROUNDS)}/${sim.ROUNDS}</b>` : '';
        s2.innerHTML = `fresh <b>${c.fresh}</b> · stale <b>${c.stale}</b> · waited <b>${c.latencyMs} ms</b>`;
        flow.progress(t === 1 ? `Rounds: ${c.round} / ${sim.ROUNDS}` : '');
      } else {
        rBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.r) === r)));
        wBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.w) === w)));
        sum.innerHTML = `R + W = <b>${r + w}</b> (N = ${sim.N}) · each write + read waits for <b>${(r + w) * sim.MS_PER_REPLICA} ms</b>`;
        s1.innerHTML = `R <b>${r}</b> · W <b>${w}</b>`;
        s2.innerHTML = t === 3 ? 'replica C: <b>down, then back</b>' : `budget <b>${sim.LATENCY_BUDGET_MS} ms</b>`;
        flow.progress('Run when ready.');
      }
      if (!flow.coachBetween() && flow.phase === 'play') api.coach.say(...coachLine());
    }

    function coachLine(): [string, 'act' | 'watch'] {
      const t = flow.task;
      if (t === 1) {
        if (c.phase === 'write') return [c.selected.size ? `Pick more replicas, or <b>Send write</b> (value ${sim.writeValue(c)}).` : `Round ${c.round + 1}: pick the replicas that get value ${sim.writeValue(c)}.`, 'act'];
        return [c.selected.size ? 'Press <b>Read</b>. The newest version among the replicas you picked wins.' : 'Now pick replicas to read from. You need the newest value back.', 'act'];
      }
      if (t === 2) return ['Pick R and W, then press <b>Run</b>. No stale reads, at most 80 ms.', 'act'];
      if (t === 3) return ['Pick R and W that survive C crashing and coming back, then press <b>Run</b>.', 'act'];
      return ['', 'watch'];
    }

    // ---------- actions ----------
    function pick(i: number) {
      if (flow.guard()) return;
      if (flow.task > 1) return api.toast('The coordinator picks replicas at random now. Set R and W below.');
      if (flow.phase === 'tutorial') {
        if (api.coach.step !== 'pick') return api.toast('Tutorial: click Send write (highlighted).');
        if (i !== 0) return api.toast('Tutorial: click replica A (highlighted).');
        if (!c.selected.has(0)) sim.toggleSelect(c, 0);
        api.hit('picked', repEls[0]);
        api.coach.did('pick');
        render();
        return;
      }
      const s = sim.toggleSelect(c, i);
      if (s === 'down') return api.toast(`Replica ${sim.NAMES[i]} crashed. It can’t answer: pick a replica that is up.`);
      render();
    }

    function doSend() {
      if (flow.guard()) return;
      if (flow.task > 1) return;
      if (flow.phase === 'tutorial') {
        if (api.coach.step !== 'write') return api.toast('Tutorial: click replica A first (highlighted).');
        sim.sendWrite(c);
        api.hit('written', send);
        api.coach.did('write');
        return;
      }
      if (!c.selected.size) return api.toast(c.phase === 'write' ? 'Pick at least one replica to write to.' : 'Pick at least one replica to read from.');
      api.move();
      if (c.phase === 'write') {
        const n = c.selected.size;
        const { crashed } = sim.sendWrite(c);
        log.unshift(`Wrote ${c.latest * 10} to ${n} replica${n > 1 ? 's' : ''}`);
        if (crashed !== null) {
          log.unshift(`⚡ ${sim.NAMES[crashed]} crashed`);
          api.toast(`Replica ${sim.NAMES[crashed]} crashed right after your write!`);
        }
        render();
        return;
      }
      const lost = !c.replicas.some((x) => x.up && x.version === c.latest);
      const got = sim.sendRead(c)!;
      log.unshift(`Read ${got.value}${got.fresh ? ' ✓ fresh' : ` ✕ stale (newest is ${c.latest * 10})`}`);
      if (got.fresh) api.hit('fresh read', send);
      else {
        api.mistake('stale read', send);
        api.toast(lost
          ? 'Stale! The only replica with the newest value crashed. Write to at least 2 replicas so one survives a crash.'
          : 'Stale! None of the replicas you read from got the newest write. Your read set must overlap your write set.');
      }
      if (!sim.nextRound(c)) {
        render();
        return flow.done();
      }
      render();
    }

    function setOpt(f: () => void) {
      if (flow.guard()) return;
      if (flow.task < 2) return api.toast('R and W unlock in the next task.');
      f();
      render();
    }

    function runIt() {
      if (flow.guard()) return;
      if (flow.task < 2) return api.toast('R and W unlock in the next task.');
      api.move();
      const out = flow.task === 2 ? sim.checkFresh(r, w) : sim.checkOneDown(r, w);
      drawResult(out.q);
      if (out.ok) {
        api.hit(`R${r} W${w}`, run);
        return flow.done();
      }
      api.mistake('not yet', run);
      api.toast(out.why);
      render();
    }

    function drawResult(q: sim.QuorumResult) {
      const pill = (ok: boolean) => (ok ? 'ok-pill' : 'bad-pill');
      res.innerHTML = `<div class="mrow"><span>Stale reads</span><span class="${pill(q.stalePct === 0)}" id="qr-stale">${q.stalePct.toFixed(1)}%</span></div>
        <div class="mrow"><span>Wait per write + read</span><span class="${pill(flow.task === 3 || q.latencyMs <= sim.LATENCY_BUDGET_MS)}" id="qr-lat">${q.latencyMs} ms</span></div>
        <div class="mrow"><span>Failed writes</span><span class="${pill(q.writeAvailPct === 100)}" id="qr-wf">${(100 - q.writeAvailPct).toFixed(0)}%</span></div>
        <div class="mrow"><span>Failed reads</span><span class="${pill(q.readAvailPct === 100)}" id="qr-rf">${(100 - q.readAvailPct).toFixed(0)}%</span></div>`;
    }

    render();
    return () => flow.dispose();
  },
};
