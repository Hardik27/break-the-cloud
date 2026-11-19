/** Two-Phase Commit view. Turn-based with short timed beats (votes arriving, waiting while blocked). Built once; render updates text and classes. */
import { el, esc, onPress, setText } from '../../lib/dom';
import { makeFlow } from '../flow';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

const INFO = [
  { h: 'Tutorial: one transfer', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'You are the coordinator', p: `${sim.TRANSFERS.length} transfers. For each: <b>Prepare</b>, wait for both votes, then <b>Commit</b> or <b>Abort</b>. Both banks must end up doing the same thing.` },
  { h: 'Bank B crashed', p: `Bank B crashed in the middle of ${sim.RECOVERIES.length} transfers and is restarting. Read its log for each one and choose: <b>Commit</b>, <b>Abort</b>, or <b>Ask coordinator</b>. Ask only when B truly can’t know.` },
  { h: 'The coordinator died', p: `The coordinator crashed right after sending prepare. Bank B voted yes and is holding locks; customers are queuing. For each transfer, first <b>Ask Bank A</b> what it knows, then <b>Commit</b>, <b>Abort</b> or <b>Wait</b> for the coordinator.` },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    let tx: sim.Transfer = sim.TUTORIAL_TRANSFER;
    let ti = 0;
    let phase: 'idle' | 'voting' | 'voted' = 'idle';
    let shown = [false, false];
    let ri = 0;
    let bi = 0;
    let askedPeer = false;
    let waitUntil = 0;
    let queued = 0;
    const log: string[] = [];
    const timers = new Set<number>();
    let gen = 0;
    const later = (ms: number, fn: () => void) => {
      const g = gen;
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (g === gen) fn();
      }, ms);
      timers.add(id);
    };

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="tp-s1"></span><span id="tp-s2"></span>`);
    const nodes = el('div', { class: 'tp-nodes' });
    const mkNode = (name: string, id: string) => {
      const n = el('div', { class: 'tp-node', id }, `<b>${name}</b><span class="tp-st"></span>`);
      nodes.appendChild(n);
      return n;
    };
    const nA = mkNode('Bank A', 'tp-a');
    const nC = mkNode('Coordinator', 'tp-c');
    const nB = mkNode('Bank B', 'tp-b');
    const card = el('div', { class: 'tp-card', id: 'tp-card', 'aria-live': 'polite' });
    const body = el('div', { class: 'tp-panel' });

    const row1 = el('div', { class: 'row' });
    const prep = el('button', { class: 'btn go', type: 'button', id: 'tp-prepare' }, 'Prepare');
    const commit = el('button', { class: 'btn ghost as-btn tp-commit', type: 'button', id: 'tp-commit' }, 'Commit');
    const abort = el('button', { class: 'btn ghost as-btn tp-abort', type: 'button', id: 'tp-abort' }, 'Abort');
    onPress(prep, () => doPrepare());
    onPress(commit, () => doDecide(true));
    onPress(abort, () => doDecide(false));
    row1.append(prep, commit, abort);

    const row2 = el('div', { class: 'row', role: 'group', 'aria-label': 'What Bank B does' });
    for (const a of ['commit', 'abort', 'ask'] as sim.Act[]) {
      const b = el('button', { class: `btn ghost as-btn tp-${a}`, type: 'button', 'data-act': a }, a === 'ask' ? 'Ask coordinator' : a[0].toUpperCase() + a.slice(1));
      onPress(b, () => doRecover(a, b));
      row2.appendChild(b);
    }

    const row3 = el('div', { class: 'row', role: 'group', 'aria-label': 'What Bank B does' });
    const askPeer = el('button', { class: 'btn go', type: 'button', id: 'tp-askpeer' }, 'Ask Bank A');
    onPress(askPeer, () => doAskPeer());
    row3.appendChild(askPeer);
    for (const a of ['commit', 'abort', 'wait'] as sim.Act3[]) {
      const b = el('button', { class: `btn ghost as-btn tp-${a}`, type: 'button', 'data-act3': a }, a[0].toUpperCase() + a.slice(1));
      onPress(b, () => doTerminate(a, b));
      row3.appendChild(b);
    }
    const waitBar = el('div', { class: 'as-ramp', hidden: true }, `<span class="small">Waiting for the coordinator</span><span class="as-bar"><i id="tp-wait"></i></span>`);
    const feed = el('div', { class: 'feed' });
    const feedLines = Array.from({ length: 4 }, () => feed.appendChild(el('div')));
    body.append(card, row1, row2, row3, waitBar, feed);
    stage.append(status, nodes, body);

    const flow = makeFlow(api, meta, INFO, (t) => {
      gen++;
      log.length = 0;
      phase = 'idle';
      shown = [false, false];
      if (t === 0) tx = sim.TUTORIAL_TRANSFER;
      if (t === 1) { ti = 0; tx = sim.TRANSFERS[0]; }
      if (t === 2) ri = 0;
      if (t === 3) { bi = 0; askedPeer = false; waitUntil = 0; queued = 0; }
    }, render);

    // ---------- render ----------
    function setNode(n: HTMLElement, st: string, cls: string) {
      n.className = `tp-node ${cls}`;
      setText(n.querySelector('.tp-st')!, st);
    }
    const voteText = (v: sim.Vote) => (v === 'yes' ? 'YES · locked' : v === 'no' ? 'voted NO' : 'no answer');
    const voteCls = (v: sim.Vote) => (v === 'yes' ? 'lock' : 'bad');

    function render() {
      const t = flow.task;
      row1.hidden = t > 1;
      row2.hidden = t !== 2;
      row3.hidden = t !== 3;
      const s1 = stage.querySelector('#tp-s1')!, s2 = stage.querySelector('#tp-s2')!;
      if (t <= 1) {
        setNode(nC, phase === 'idle' ? 'ready' : phase === 'voting' ? 'collecting votes…' : 'your decision', phase === 'voted' ? 'act' : '');
        [nA, nB].forEach((n, k) => (phase === 'idle' ? setNode(n, 'idle', '') : !shown[k] ? setNode(n, 'voting…', '') : setNode(n, voteText(tx.votes[k]), voteCls(tx.votes[k]))));
        const reasons = shown.map((s, k) => (s ? `<span class="small">Bank ${'AB'[k]}: ${esc(tx.why[k])}</span>` : '')).join('');
        card.innerHTML = `<p class="eyebrow">Transfer ${t === 1 ? `${Math.min(ti + 1, sim.TRANSFERS.length)} of ${sim.TRANSFERS.length}` : ''}</p><p>${esc(tx.text)}</p>${reasons}`;
        prep.setAttribute('aria-disabled', String(phase !== 'idle'));
        s1.innerHTML = t === 1 ? `transfer <b>${Math.min(ti + 1, sim.TRANSFERS.length)}/${sim.TRANSFERS.length}</b>` : '';
        s2.innerHTML = '';
        flow.progress(t === 1 ? `Transfers: ${ti} / ${sim.TRANSFERS.length}` : '');
      } else if (t === 2) {
        const r = sim.RECOVERIES[Math.min(ri, sim.RECOVERIES.length - 1)];
        setNode(nC, 'up', '');
        setNode(nA, 'up', '');
        setNode(nB, 'restarting · reading log', 'down');
        card.innerHTML = `<p class="eyebrow">Bank B’s log on disk</p><ol class="tp-log">${r.log.map((l) => `<li>${esc(l)}</li>`).join('')}</ol><p class="small">B crashed right after the last line.</p>`;
        s1.innerHTML = `restart <b>${Math.min(ri + 1, sim.RECOVERIES.length)}/${sim.RECOVERIES.length}</b>`;
        s2.innerHTML = '';
        flow.progress(`Recovered: ${ri} / ${sim.RECOVERIES.length}`);
      } else {
        const b = sim.BLOCKED[Math.min(bi, sim.BLOCKED.length - 1)];
        const waiting = waitUntil > 0;
        setNode(nC, waiting ? 'restarting…' : 'CRASHED', 'down');
        setNode(nA, askedPeer ? b.peer === 'commit' ? 'got COMMIT' : b.peer === 'abort' ? 'got ABORT' : b.peer === 'no' ? 'voted NO' : 'YES · locked' : '?', askedPeer ? (b.peer === 'yes' ? 'lock' : b.peer === 'commit' ? 'ok' : 'bad') : '');
        setNode(nB, 'YES · locked', 'lock');
        card.innerHTML = `<p class="eyebrow">Transfer ${b.tx}</p><p>Bank B voted <b>YES</b> and holds the locks. The coordinator crashed before sending a decision.</p>${askedPeer ? `<p class="tp-peer" id="tp-peer">${esc(sim.PEER_TEXT[b.peer].replace(' T', ` ${b.tx}`))}</p>` : ''}`;
        askPeer.setAttribute('aria-disabled', String(askedPeer || waiting));
        waitBar.hidden = !waiting;
        s1.innerHTML = `transfer <b>${Math.min(bi + 1, sim.BLOCKED.length)}/${sim.BLOCKED.length}</b>`;
        s2.innerHTML = `customers stuck on locked accounts <b id="tp-queued">${queued}</b>`;
        flow.progress(`Resolved: ${bi} / ${sim.BLOCKED.length}`);
      }
      waitBar.hidden = t !== 3 || !waitUntil;
      feedLines.forEach((d, i) => setText(d, log[i] ?? ''));
      if (!flow.coachBetween() && flow.phase === 'play') api.coach.say(...coachLine());
    }

    function coachLine(): [string, 'act' | 'watch'] {
      const t = flow.task;
      if (t === 1) {
        if (phase === 'idle') return ['Click <b>Prepare</b> to ask both banks for their vote.', 'act'];
        if (phase === 'voting') return ['Votes are coming in…', 'watch'];
        return ['Both votes are in. <b>Commit</b> or <b>Abort</b>?', 'act'];
      }
      if (t === 2) return ['Read B’s log. <b>Commit</b>, <b>Abort</b>, or <b>Ask coordinator</b>?', 'act'];
      if (t === 3) {
        if (waitUntil) return ['Blocked. Locks held, customers queuing, until the coordinator returns…', 'watch'];
        if (!askedPeer) return ['Click <b>Ask Bank A</b> what it knows about this transfer.', 'act'];
        return ['From A’s answer: <b>Commit</b>, <b>Abort</b>, or <b>Wait</b>?', 'act'];
      }
      return ['', 'watch'];
    }

    // ---------- actions ----------
    function doPrepare() {
      if (flow.guard()) return;
      if (flow.task > 1) return api.toast('Prepare was already sent in this scenario. Use the buttons below.');
      if (flow.phase === 'tutorial') {
        if (api.coach.step !== 'prepare') return api.toast('Tutorial: click Commit (highlighted).');
        phase = 'voted';
        shown = [true, true];
        api.hit('prepare sent', prep);
        api.coach.did('prepare');
        render();
        return;
      }
      if (phase !== 'idle') return api.toast(phase === 'voting' ? 'Prepare is out. Wait for the votes.' : 'Votes are in. Commit or Abort.');
      api.move();
      phase = 'voting';
      log.unshift(`→ PREPARE: ${tx.text}`);
      later(500, () => { shown[0] = true; render(); });
      later(1000, () => { shown[1] = true; phase = 'voted'; render(); });
      render();
    }

    function doDecide(c: boolean) {
      if (flow.guard()) return;
      if (flow.task > 1) return api.toast('Use the buttons below for this scenario.');
      if (flow.phase === 'tutorial') {
        if (api.coach.step !== 'commit') return api.toast('Tutorial: click Prepare first (highlighted).');
        if (!c) return api.toast('Tutorial: both banks voted yes. Click Commit.');
        api.hit('committed', commit);
        api.coach.did('commit');
        return;
      }
      if (phase === 'idle') return api.toast('Nobody has voted yet. Click Prepare first.');
      if (phase === 'voting') return api.toast('Wait for both votes before deciding.');
      api.move();
      const r = sim.decide(tx, c);
      const b = c ? commit : abort;
      log.unshift(`${c ? 'COMMIT' : 'ABORT'}: ${tx.text}${r.ok ? '' : ' ✕'}`);
      if (r.ok) api.hit(c ? 'committed' : 'aborted', b);
      else {
        api.mistake(c ? 'banks split' : 'needless abort', b);
        api.toast(r.why);
      }
      ti++;
      phase = 'idle';
      shown = [false, false];
      if (ti >= sim.TRANSFERS.length) {
        render();
        return flow.done();
      }
      tx = sim.TRANSFERS[ti];
      render();
    }

    function doRecover(a: sim.Act, b: HTMLElement) {
      if (flow.guard()) return;
      if (flow.task !== 2) return;
      api.move();
      const rec = sim.RECOVERIES[ri];
      const r = sim.recover(rec, a);
      if (!r.ok) {
        api.mistake(a === 'ask' ? 'needless ask' : 'guessed', b);
        api.toast(r.why);
        return;
      }
      api.hit(a === 'ask' ? `coordinator: ${rec.coordSays}` : a, b);
      log.unshift(a === 'ask' ? `B asked; coordinator said ${rec.coordSays!.toUpperCase()} → B ${rec.coordSays}s` : `B ${a}s on its own`);
      api.toast(r.why);
      ri++;
      render();
      if (ri >= sim.RECOVERIES.length) flow.done();
    }

    function doAskPeer() {
      if (flow.guard()) return;
      if (flow.task !== 3) return;
      if (waitUntil) return api.toast('Waiting for the coordinator to come back…');
      if (askedPeer) return api.toast('A already answered. Now decide.');
      api.move();
      askedPeer = true;
      api.hit('asked A', askPeer);
      render();
    }

    function doTerminate(a: sim.Act3, b: HTMLElement) {
      if (flow.guard()) return;
      if (flow.task !== 3) return;
      if (waitUntil) return api.toast('Waiting for the coordinator to come back…');
      api.move();
      if (!askedPeer) {
        api.mistake('decided blind', b);
        api.toast('B voted yes, so it can’t decide alone. Ask Bank A what it knows first.');
        return;
      }
      const blk = sim.BLOCKED[bi];
      const r = sim.terminate(blk, a);
      if (!r.ok) {
        api.mistake(a === 'wait' ? 'locks held' : 'banks split', b);
        api.toast(r.why);
        return;
      }
      api.toast(r.why);
      if (a === 'wait') {
        waitUntil = performance.now() + sim.WAIT_MS;
        log.unshift(`${blk.tx}: both in doubt, B waits…`);
        api.hit('waiting', b);
        tickWait();
        render();
        return;
      }
      api.hit(a === 'commit' ? 'committed' : 'aborted', b);
      log.unshift(`${blk.tx}: B ${a}s (learned from A)`);
      nextBlocked();
    }

    function tickWait() {
      if (!waitUntil) return;
      const left = waitUntil - performance.now();
      const bar = stage.querySelector<HTMLElement>('#tp-wait');
      if (bar) bar.style.width = `${Math.min(100, 100 * (1 - left / sim.WAIT_MS))}%`;
      if (left <= 0) {
        waitUntil = 0;
        log.unshift('Coordinator restarted: its log says COMMIT. Locks released.');
        api.toast('The coordinator is back: it had logged COMMIT. B commits and releases the locks.');
        return nextBlocked();
      }
      queued++;
      const q = stage.querySelector('#tp-queued');
      if (q) setText(q, String(queued));
      later(250, tickWait);
    }

    function nextBlocked() {
      bi++;
      askedPeer = false;
      render();
      if (bi >= sim.BLOCKED.length) flow.done();
    }

    render();
    return () => {
      gen++;
      timers.forEach((id) => clearTimeout(id));
      flow.dispose();
    };
  },
};
