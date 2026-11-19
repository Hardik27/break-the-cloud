/**
 * Gossip view. Node buttons, the 50-dot grid and the SWIM panel are built once; frames only update classes and text.
 * Message arcs are short-lived SVG lines in an overlay (not interactive).
 */
import { el, onPress, setText, svgEl } from '../../lib/dom';
import { makeFlow } from '../flow';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

const ROUND_MS = 6000;

const INFO = [
  { h: 'Tutorial: one tell', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'Spread it by hand', p: `<b>Goal:</b> all ${sim.MANUAL_N} nodes know the rumour, without wasting tells.<br><b>Your tools:</b> each round, every node that knows may tell one more node: click nodes to tell them. A round ends when its timer runs out, or press Next round.` },
  { h: 'Nobody sees the whole cluster', p: `<b>Goal:</b> in at least ${sim.PASS_RUNS} of ${sim.RUNS} rumours, all ${sim.N} nodes know within ${sim.ROUND_GOAL} rounds, and no node sends more than ${sim.BUDGET} messages a round.<br><b>Your tools:</b> the fanout: how many random nodes each node tells per round.` },
  { h: 'Who is ghosting?', p: `<b>Goal:</b> decide, for ${sim.SUSPECTS.length} quiet members, whether each is dead or alive. Never call a live node dead.<br><b>Your tools:</b> ping it yourself, ask two others to ping it for you, then give your verdict.` },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    let m = sim.createManual();
    let fan = 1;
    let anim: { at: number[]; r: number; t: number } | null = null;
    let alive = true;
    let onAnimEnd: (() => void) | null = null;
    let roundLeft = ROUND_MS;
    let senders: number[] = [0];
    let si = 0;
    let swim = sim.createSwim(0);
    let predicted = false;

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="gs-s1"></span><span id="gs-s2"></span>`);
    const p1 = el('div', { class: 'gs-panel' });
    const gridWrap = el('div', { class: 'gs-gridwrap' });
    const grid16 = el('div', { class: 'gs-grid16', role: 'group', 'aria-label': 'Nodes' });
    const nodeBtns = Array.from({ length: sim.MANUAL_N }, (_, i) => {
      const b = el('button', { class: 'gs-node', type: 'button', 'data-node': i }, String(i));
      onPress(b, () => doTell(i));
      grid16.appendChild(b);
      return b;
    });
    const arcs = svgEl('svg', { class: 'gs-arcs', 'aria-hidden': 'true' }) as SVGSVGElement;
    gridWrap.append(grid16, arcs as unknown as HTMLElement);
    const roundBtn = el('button', { class: 'btn go', type: 'button', id: 'gs-round' }, 'Next round');
    onPress(roundBtn, () => doRound());
    const slotsEl = el('span', { class: 'small', id: 'gs-slots' });
    const timer = el('span', { class: 'gs-timer', 'aria-hidden': 'true' }, '<i id="gs-tbar"></i>');
    const r1 = el('div', { class: 'row' });
    r1.append(roundBtn, slotsEl, timer);
    p1.append(gridWrap, r1);

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

    // task 3: SWIM
    const p3 = el('div', { class: 'gs-panel', hidden: true });
    const ring = el('div', { class: 'gs-ring', 'aria-hidden': 'true' });
    const FRIENDS = ['you', 'Ana', 'Kim', 'Dev', 'Bea', 'Raj', 'Mo', 'Lu'];
    const friendEls = FRIENDS.map((n, i) => {
      const a = (2 * Math.PI * i) / FRIENDS.length - Math.PI / 2;
      const d = el('span', { class: 'gs-friend', 'data-friend': n, style: `left:${50 + 40 * Math.cos(a)}%;top:${50 + 40 * Math.sin(a)}%` }, n);
      ring.appendChild(d);
      return d;
    });
    const swimCard = el('div', { class: 'gs-swim', id: 'gs-swim', 'aria-live': 'polite' });
    const swimBtns = el('div', { class: 'row' });
    const mk = (id: string, label: string, cls: string, fn: () => void) => {
      const b = el('button', { class: `btn ${cls}`, type: 'button', id }, label);
      onPress(b, fn);
      swimBtns.appendChild(b);
      return b;
    };
    const bPing = mk('gs-ping', 'Ping', 'go', () => doPing(false));
    const bAsk = mk('gs-ask', 'Ask 2 others to ping', 'ghost as-btn', () => doPing(true));
    const bAlive = mk('gs-alive', 'Verdict: alive', 'ghost as-btn', () => doJudge('alive'));
    const bDead = mk('gs-dead', 'Verdict: dead', 'ghost as-btn gs-deadbtn', () => doJudge('dead'));
    const swimLog = el('div', { class: 'feed' });
    const swimLines = Array.from({ length: 3 }, () => swimLog.appendChild(el('div')));
    const log: string[] = [];
    p3.append(ring, swimCard, swimBtns, swimLog);
    stage.append(status, p1, p2, p3);

    const flow = makeFlow(api, meta, INFO, (t) => {
      if (t <= 1) { m = sim.createManual(); roundLeft = ROUND_MS; senders = [0]; }
      if (t === 2) { fan = 1; anim = null; predicted = false; res.innerHTML = ''; dotEls.forEach((d) => (d.className = '')); setText(animLbl, ''); }
      if (t === 3) { si = 0; swim = sim.createSwim(0); log.length = 0; }
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
          b.classList.toggle('sender', senders.includes(i) && !sim.manualDone(m));
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
        const sp = swim.s;
        friendEls.forEach((f) => {
          const n = f.dataset.friend!;
          const done = sim.SUSPECTS.slice(0, si).find((x) => x.name === n);
          f.className = `gs-friend${n === 'you' ? ' me' : ''}${n === sp.name && si < sim.SUSPECTS.length ? ' sus' : ''}${done ? (done.truth === 'dead' ? ' gone' : ' fine') : ''}${(n === 'Ana' || n === 'Kim') && swim.probe.startsWith('indirect') ? ' helper' : ''}`;
        });
        const probeTxt: Record<sim.Probe, string> = {
          none: 'Not checked yet.',
          'direct-ok': `You pinged ${sp.name}: answered in 40 ms.`,
          'direct-fail': `You pinged ${sp.name}: no answer within ${sim.PING_TIMEOUT_MS} ms.`,
          'indirect-ok': `Ana and Kim pinged ${sp.name} for you: ${sp.name} answered them.`,
          'indirect-fail': `Ana and Kim pinged ${sp.name} for you: no answer to them either.`,
        };
        swimCard.innerHTML = `<p class="eyebrow">Member ${Math.min(si + 1, sim.SUSPECTS.length)} of ${sim.SUSPECTS.length}</p><p><b>${sp.story}</b></p><p class="small gs-probe" id="gs-probe">${probeTxt[swim.probe]}</p>`;
        swimLines.forEach((d, i) => setText(d, log[i] ?? ''));
        s1.innerHTML = `decided <b>${si}/${sim.SUSPECTS.length}</b>`;
        s2.innerHTML = `ping timeout <b>${sim.PING_TIMEOUT_MS} ms</b>`;
        flow.progress(`Decided: ${si} / ${sim.SUSPECTS.length}`);
      }
      if (!flow.coachBetween() && flow.phase === 'play') api.coach.say(...coachLine());
    }

    function coachLine(): [string, 'act' | 'watch'] {
      const t = flow.task;
      if (t === 1) return m.slots > 0 ? [`Each glowing node can tell one more. Click ${m.slots} node${m.slots > 1 ? 's' : ''} that don’t know yet.`, 'act'] : ['All tells used. Click <b>Next round</b> (or wait for the timer).', 'act'];
      if (t === 2) return anim ? ['Watch one rumour spread, round by round…', 'watch'] : ['Pick a fanout, then press <b>Run</b>.', 'act'];
      if (t === 3) {
        if (swim.probe === 'none') return [`Is ${swim.s.name} dead? Start by checking: <b>Ping</b>.`, 'act'];
        if (swim.probe === 'direct-fail') return ['No answer to you. Is it them, or your link? <b>Ask 2 others to ping</b>.', 'act'];
        return ['You have the evidence. Give your verdict.', 'act'];
      }
      return ['', 'watch'];
    }

    // ---------- arcs ----------
    function arc(from: number, to: number) {
      const box = gridWrap.getBoundingClientRect();
      const a = nodeBtns[from].getBoundingClientRect();
      const b = nodeBtns[to].getBoundingClientRect();
      arcs.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
      const x1 = a.left - box.left + a.width / 2, y1 = a.top - box.top + a.height / 2;
      const x2 = b.left - box.left + b.width / 2, y2 = b.top - box.top + b.height / 2;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.min(60, Math.hypot(x2 - x1, y2 - y1) / 3);
      const p = svgEl('path', { d: `M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`, class: 'gs-arc' }, arcs);
      setTimeout(() => p.remove(), 900);
    }

    // ---------- actions ----------
    function doTell(i: number) {
      if (flow.guard()) return;
      if (flow.task > 1) return;
      if (flow.phase === 'tutorial') {
        if (api.coach.step !== 'tell') return api.toast('Tutorial: click Next round (highlighted).');
        if (i !== 1) return api.toast('Tutorial: click node 1 (highlighted).');
        sim.tell(m, 1);
        arc(0, 1);
        senders = [];
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
      const from = senders.shift() ?? 0;
      arc(from, i);
      api.hit('told', nodeBtns[i]);
      render();
      if (sim.manualDone(m)) {
        api.toast(`All ${sim.MANUAL_N} in ${m.round} rounds: that’s log₂ ${sim.MANUAL_N} = ${sim.idealRounds(sim.MANUAL_N)}. The number who know doubled every round.`);
        flow.done();
      }
    }

    function startRoundSenders() {
      senders = m.informed.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
    }

    function doRound(auto = false) {
      if (!auto && flow.guard()) return;
      if (flow.task > 1) return;
      if (flow.phase === 'tutorial') {
        if (api.coach.step !== 'round') return api.toast('Tutorial: click node 1 first (highlighted).');
        sim.nextRound(m);
        startRoundSenders();
        api.coach.did('round');
        return;
      }
      if (!auto) api.move();
      const { wasted } = sim.nextRound(m);
      startRoundSenders();
      roundLeft = ROUND_MS;
      if (wasted) {
        api.mistake('wasted tells', roundBtn);
        api.toast(`${auto ? 'Time’s up: ' : ''}${wasted} tell${wasted > 1 ? 's' : ''} wasted. Every node that knows should tell someone each round.`);
      } else api.hit(`${m.slots} can tell`, roundBtn);
      render();
    }

    function setFan(v: number) {
      if (flow.guard()) return;
      if (flow.task !== 2) return api.toast('Fanout unlocks in the next task.');
      fan = v;
      render();
    }

    async function runIt() {
      if (flow.guard()) return;
      if (flow.task !== 2) return api.toast('Fanout unlocks in the next task.');
      if (anim) return api.toast('Watch this run finish first.');
      api.move();
      const c = sim.checkFanout(fan);
      if (!predicted) {
        predicted = true;
        await api.predict({
          q: `Each node tells ${fan} random node${fan > 1 ? 's' : ''} per round, without knowing who has heard already. About how many rounds until all ${sim.N} know?`,
          options: ['About 5', 'About 10', 'About 50'],
          answer: c.median <= 7 ? 0 : 1,
          why: `It took about ${c.median} rounds. Random picks often hit nodes that already know, so with fanout ${fan} it is ${c.median <= 7 ? 'still fast: the number who know roughly multiplies each round' : 'slower than doubling'}.`,
        });
      }
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

    function doPing(indirect: boolean) {
      if (flow.guard()) return;
      if (flow.task !== 3) return;
      api.move();
      const n = swim.s.name;
      if (indirect) {
        const r = sim.pingIndirect(swim);
        log.unshift(`${n}: Ana and Kim pinged → ${r.ok ? 'answered' : 'no answer'}`);
        if (r.ok && swim.s.truth === 'slow') api.hit('it was your link', bAsk);
        else api.hit(r.ok ? 'answered' : 'silent', bAsk);
      } else {
        const r = sim.pingDirect(swim);
        log.unshift(`${n}: you pinged → ${r.ok ? `answered in ${r.ms} ms` : 'no answer'}`);
        api.hit(r.ok ? 'pong' : 'timeout', bPing);
      }
      render();
    }

    function doJudge(v: sim.Verdict) {
      if (flow.guard()) return;
      if (flow.task !== 3) return;
      api.move();
      const r = sim.judge(swim, v);
      const b = v === 'dead' ? bDead : bAlive;
      if (!r.ok) {
        api.mistake(v === 'dead' && swim.s.truth !== 'dead' ? 'false alarm' : 'not sure yet', b);
        api.toast(r.why);
        return;
      }
      api.hit(v === 'dead' ? `${swim.s.name} is dead` : `${swim.s.name} is fine`, b);
      api.toast(r.why);
      log.unshift(`Verdict: ${swim.s.name} is ${v}`);
      si++;
      if (si >= sim.SUSPECTS.length) {
        render();
        return flow.done();
      }
      swim = sim.createSwim(si);
      render();
    }

    // ---------- loop ----------
    let last = performance.now();
    let raf = 0;
    function frame(now: number) {
      if (!alive) return;
      const dt = Math.min(100, now - last);
      last = now;
      if (flow.task === 1 && flow.phase === 'play' && !sim.manualDone(m) && !(stage as HTMLElement).inert) {
        roundLeft -= dt;
        (stage.querySelector('#gs-tbar') as HTMLElement).style.width = `${Math.max(0, (100 * roundLeft) / ROUND_MS)}%`;
        if (roundLeft <= 0) doRound(true);
      }
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
