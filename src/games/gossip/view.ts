/** Gossip view. Node buttons, the 50-dot grid and the heartbeat table are built once; the loop only updates classes and text. */
import { el, onPress, setText } from '../../lib/dom';
import { makeFlow } from '../flow';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

const INFO = [
  { h: 'Tutorial: one tell', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'Spread it by hand', p: `Each round, every node that knows the rumour may tell <b>one</b> node that doesn’t. Click nodes to tell them, then <b>Next round</b>. Reach all ${sim.MANUAL_N} in as few rounds as you can: don’t waste tells.` },
  { h: 'Random gossip', p: `Real nodes don’t know who has heard already: each one tells <b>f</b> random nodes every round (the fanout). Pick f and press <b>Run</b> (${sim.RUNS} rumours). Goal: in at least ${sim.PASS_RUNS} of ${sim.RUNS}, all ${sim.N} nodes know within ${sim.ROUND_GOAL} rounds, and no node sends more than ${sim.BUDGET} messages per round.` },
  { h: 'Who is dead?', p: `Every node bumps its own heartbeat counter each round and gossips the table. Below is your view. A node whose counter hasn’t gone up for <b>${sim.SUSPECT_AFTER} rounds</b> is dead: click <b>Mark dead</b>. A short stall can be slow gossip: don’t accuse a live node.` },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    let m = sim.createManual();
    let fan = 1;
    let anim: { at: number[]; r: number; t: number } | null = null;
    let hbRound = 1;
    let hbT = 0;
    const marked = new Set<string>();
    const missed = new Set<string>();
    let alive = true;
    let onAnimEnd: (() => void) | null = null;

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="gs-s1"></span><span id="gs-s2"></span>`);
    const p1 = el('div', { class: 'gs-panel' });
    const grid16 = el('div', { class: 'gs-grid16', role: 'group', 'aria-label': 'Nodes' });
    const nodeBtns = Array.from({ length: sim.MANUAL_N }, (_, i) => {
      const b = el('button', { class: 'gs-node', type: 'button', 'data-node': i }, String(i));
      onPress(b, () => doTell(i));
      grid16.appendChild(b);
      return b;
    });
    const roundBtn = el('button', { class: 'btn go', type: 'button', id: 'gs-round' }, 'Next round');
    onPress(roundBtn, () => doRound());
    const slotsEl = el('span', { class: 'small', id: 'gs-slots' });
    const r1 = el('div', { class: 'row' });
    r1.append(roundBtn, slotsEl);
    p1.append(grid16, r1);

    const p2 = el('div', { class: 'gs-panel', hidden: true });
    const fRow = el('div', { class: 'row', role: 'group', 'aria-label': 'Fanout' }, '<span class="small rs-lbl">Fanout</span>');
    const fBtns = sim.FANOUTS.map((v) => {
      const b = el('button', { class: 'chip', type: 'button', 'data-f': v }, String(v));
      b.addEventListener('click', () => setFan(v));
      fRow.appendChild(b);
      return b;
    });
    const run = el('button', { class: 'btn go', type: 'button', id: 'gs-run' }, `Run ${sim.RUNS} rumours`);
    run.addEventListener('click', runIt);
    const dots = el('div', { class: 'gs-dots', 'aria-hidden': 'true' });
    const dotEls = Array.from({ length: sim.N }, () => dots.appendChild(el('i')));
    const animLbl = el('p', { class: 'small', id: 'gs-anim', style: 'margin:0' });
    const res = el('div', { class: 'as-res', id: 'gs-res' });
    p2.append(fRow, run, dots, animLbl, res);

    const p3 = el('div', { class: 'gs-panel', hidden: true });
    const table = el('div', { class: 'gs-hb', role: 'table', 'aria-label': 'Heartbeats as you see them' }, `<div class="gs-hbrow head" role="row"><span>node</span><span>heartbeat</span><span>still for</span><span></span></div>`);
    const hbRows = sim.PEERS.map((p) => {
      const r = el('div', { class: 'gs-hbrow', role: 'row', 'data-peer': p }, `<b>${p}</b><span class="gs-beat"></span><span class="gs-age"></span>`);
      const b = el('button', { class: 'btn ghost as-btn gs-mark', type: 'button', 'data-mark': p }, 'Mark dead');
      onPress(b, () => doMark(p, b));
      r.appendChild(b);
      table.appendChild(r);
      return { p, r, b };
    });
    p3.append(table);
    stage.append(status, p1, p2, p3);

    const flow = makeFlow(api, meta, INFO, (t) => {
      if (t <= 1) m = sim.createManual();
      if (t === 2) { fan = 1; anim = null; res.innerHTML = ''; dotEls.forEach((d) => (d.className = '')); setText(animLbl, ''); }
      if (t === 3) { hbRound = 1; hbT = 0; marked.clear(); missed.clear(); }
    }, render);

    // ---------- render ----------
    function render() {
      const t = flow.task;
      p1.hidden = t > 1;
      p2.hidden = t !== 2;
      p3.hidden = t !== 3;
      const s1 = stage.querySelector('#gs-s1')!, s2 = stage.querySelector('#gs-s2')!;
      if (t <= 1) {
        nodeBtns.forEach((b, i) => {
          b.classList.toggle('on', m.informed[i]);
          b.setAttribute('aria-pressed', String(m.informed[i]));
        });
        setText(slotsEl, sim.manualDone(m) ? 'Everyone knows!' : `Tells left this round: ${m.slots}`);
        s1.innerHTML = `round <b>${m.round}</b>`;
        s2.innerHTML = `know it <b>${sim.informedCount(m)}/${sim.MANUAL_N}</b>`;
        flow.progress(t === 1 ? `Know it: ${sim.informedCount(m)} / ${sim.MANUAL_N}` : '');
      } else if (t === 2) {
        fBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.f) === fan)));
        s1.innerHTML = `fanout <b>${fan}</b>`;
        s2.innerHTML = `messages per node per round <b>${fan}</b> (budget ${sim.BUDGET})`;
        flow.progress('Run when ready.');
      } else {
        drawHb();
        s1.innerHTML = `round <b>${hbRound}</b>`;
        s2.innerHTML = `marked dead <b>${marked.size}/${Object.keys(sim.DEATHS).length}</b>`;
        flow.progress(`Found: ${marked.size} / ${Object.keys(sim.DEATHS).length}`);
      }
      if (!flow.coachBetween() && flow.phase === 'play') api.coach.say(...coachLine());
    }

    function drawHb() {
      hbRows.forEach(({ p, r, b }) => {
        const a = sim.age(p, hbRound);
        setText(r.querySelector('.gs-beat')!, String(sim.seen(p, hbRound)));
        setText(r.querySelector('.gs-age')!, marked.has(p) ? 'DEAD' : `${a} round${a === 1 ? '' : 's'}`);
        r.setAttribute('data-age', String(a));
        r.className = `gs-hbrow ${marked.has(p) ? 'dead' : a >= sim.SUSPECT_AFTER ? 'sus' : a >= 2 ? 'warn' : ''}`;
        b.setAttribute('aria-disabled', String(marked.has(p)));
      });
    }

    function coachLine(): [string, 'act' | 'watch'] {
      const t = flow.task;
      if (t === 1) return m.slots > 0 ? [`Click ${m.slots} node${m.slots > 1 ? 's' : ''} that don’t know yet.`, 'act'] : ['All tells used. Click <b>Next round</b>.', 'act'];
      if (t === 2) return anim ? ['Watch one rumour spread, round by round…', 'watch'] : ['Pick a fanout, then press <b>Run</b>.', 'act'];
      if (t === 3) {
        if (hbRows.some(({ p }) => !marked.has(p) && sim.age(p, hbRound) >= sim.SUSPECT_AFTER)) return [`A counter has been still for ${sim.SUSPECT_AFTER}+ rounds. <b>Mark it dead.</b>`, 'act'];
        return ['Watch the counters. Mark a node dead only once its counter is still for 4 rounds.', 'watch'];
      }
      return ['', 'watch'];
    }

    // ---------- actions ----------
    function doTell(i: number) {
      if (flow.guard()) return;
      if (flow.task > 1) return;
      if (flow.phase === 'tutorial') {
        if (api.coach.step !== 'tell') return api.toast('Tutorial: click Next round (highlighted).');
        if (i !== 1) return api.toast('Tutorial: click node 1 (highlighted).');
        sim.tell(m, 1);
        api.hit('told', nodeBtns[1]);
        api.coach.did('tell');
        render();
        return;
      }
      api.move();
      const r = sim.tell(m, i);
      if (r === 'known') {
        api.mistake('already knew', nodeBtns[i]);
        api.toast(`Node ${i} already knows. Telling it again wastes the message.`);
        return;
      }
      if (r === 'no-slots') return api.toast('No tells left this round. Click Next round: everyone who knows now gets a tell.');
      api.hit('told', nodeBtns[i]);
      render();
      if (sim.manualDone(m)) {
        api.toast(`All ${sim.MANUAL_N} in ${m.round} rounds: that’s log₂ ${sim.MANUAL_N} = ${sim.idealRounds(sim.MANUAL_N)}.`);
        flow.done();
      }
    }

    function doRound() {
      if (flow.guard()) return;
      if (flow.task > 1) return;
      if (flow.phase === 'tutorial') {
        if (api.coach.step !== 'round') return api.toast('Tutorial: click node 1 first (highlighted).');
        sim.nextRound(m);
        api.coach.did('round');
        return;
      }
      api.move();
      const { wasted } = sim.nextRound(m);
      if (wasted) {
        api.mistake('wasted tells', roundBtn);
        api.toast(`${wasted} tell${wasted > 1 ? 's' : ''} wasted. Every node that knows should tell someone each round.`);
      } else api.hit(`${m.slots} can tell`, roundBtn);
      render();
    }

    function setFan(v: number) {
      if (flow.guard()) return;
      if (flow.task !== 2) return api.toast('Fanout unlocks in the next task.');
      fan = v;
      render();
    }

    function runIt() {
      if (flow.guard()) return;
      if (flow.task !== 2) return api.toast('Fanout unlocks in the next task.');
      if (anim) return api.toast('Watch this run finish first.');
      api.move();
      const c = sim.checkFanout(fan);
      const big = [200, 800].map((n) => sim.trials(n, fan).median);
      res.innerHTML = `<div class="mrow"><span>All ${sim.N} know within ${sim.ROUND_GOAL} rounds</span><span class="${c.within >= sim.PASS_RUNS ? 'ok-pill' : 'bad-pill'}" id="gs-within">${c.within}/${sim.RUNS}</span></div>
        <div class="mrow"><span>Messages per node per round</span><span class="${fan <= sim.BUDGET ? 'ok-pill' : 'bad-pill'}" id="gs-load">${fan}</span></div>
        <div class="mrow"><span>Typical rounds: 50 · 200 · 800 nodes</span><span id="gs-scale">${c.median} · ${big[0]} · ${big[1]}</span></div>`;
      anim = { at: sim.infectionRounds(sim.N, fan, api.seed || 1), r: 0, t: 0 };
      dotEls.forEach((d, i) => (d.className = i === 0 ? 'on' : ''));
      if (c.ok) {
        api.hit(`fanout ${fan}`, run);
        api.toast(`All ${sim.N} nodes in about ${c.median} rounds, and it barely grows with N: ${big[0]} rounds for 200, ${big[1]} for 800.`);
        onAnimEnd = () => flow.done();
      } else {
        api.mistake('not yet', run);
        api.toast(c.why);
        onAnimEnd = null;
      }
      render();
    }
    function doMark(p: string, b: HTMLElement) {
      if (flow.guard()) return;
      if (flow.task !== 3) return;
      if (marked.has(p)) return api.toast(`${p} is already marked dead.`);
      api.move();
      const r = sim.markCheck(p, hbRound);
      if (!r.ok) {
        api.mistake('false alarm', b);
        api.toast(r.why);
        return;
      }
      marked.add(p);
      api.hit(`${p} is dead`, b);
      render();
      if (Object.keys(sim.DEATHS).every((d) => marked.has(d))) flow.done();
    }

    // ---------- loop ----------
    let last = performance.now();
    let raf = 0;
    function frame(now: number) {
      if (!alive) return;
      const dt = Math.min(100, now - last);
      last = now;
      if (flow.task === 2 && anim) {
        anim.t += dt;
        if (anim.t > 450) {
          anim.t = 0;
          anim.r++;
          const at = anim.at;
          const r = anim.r;
          dotEls.forEach((d, i) => (d.className = at[i] >= 0 && at[i] <= r ? (at[i] === r ? 'on new' : 'on') : ''));
          const know = at.filter((x) => x >= 0 && x <= r).length;
          setText(animLbl, `Round ${r}: ${know} of ${sim.N} know`);
          if (know >= sim.N || r > 20) {
            anim = null;
            const f = onAnimEnd;
            onAnimEnd = null;
            if (f) f();
            else render();
          }
        }
      }
      if (flow.task === 3 && flow.phase === 'play') {
        hbT += dt;
        if (hbT >= sim.ROUND_MS) {
          hbT = 0;
          hbRound++;
          for (const p of Object.keys(sim.DEATHS)) {
            if (!marked.has(p) && !missed.has(p) && sim.age(p, hbRound) >= sim.MISS_AFTER) {
              missed.add(p);
              const row = hbRows.find((x) => x.p === p)!;
              api.mistake('missed it', row.r);
              api.toast(`${p} has been silent for ${sim.MISS_AFTER} rounds and other nodes still send it work. Mark it dead.`);
            }
          }
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
