/** Backpressure view. Consumer icons, queue rows (a fixed pool) and controls are built once; frames update text and classes. */
import { el, onPress, setAttr, setText } from '../../lib/dom';
import { makeFlow } from '../flow';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

const ROWS = 7;
const INFO = [
  { h: 'Tutorial: consumers and the DLQ', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'Drain the backlog', p: `${sim.START_BACKLOG} orders are waiting and ${sim.ARRIVALS_PER_S} more arrive every second. Each consumer handles ${sim.PER_CONSUMER} per second. Add consumers to drain the queue, but more than <b>${sim.DB_MAX}</b> overload the database. Once it is empty, scale back to <b>${sim.SETTLED_MAX} or fewer</b>.` },
  { h: 'Poison messages', p: `A consumer takes the order at the front every second. Some orders are broken: they crash the consumer and go back to the front, blocking everything behind them. Click a broken order to move it to the <b>dead-letter queue</b>. Catch <b>${sim.POISONS}</b>. Good orders belong in the queue, not the DLQ.` },
  { h: 'Automatic dead-lettering', p: `Pick how many tries a message gets before the queue moves it to the DLQ, then press <b>Run 2 min</b>. Goal: no good order lost, every order processed, and at most ${sim.CRASH_BUDGET} consumer crashes.` },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    let d = sim.createDrain(0);
    let p = sim.createPoison(0);
    let maxR = 1;
    let alive = true;

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="bp-s1"></span><span id="bp-s2"></span>`);
    const pA = el('div', { class: 'bp-panel' });
    const qbar = el('div', { class: 'bp-q' }, `<span class="eyebrow">Queue</span><b id="bp-qn"></b><span class="as-bar"><i id="bp-qbar"></i></span><span class="small" id="bp-eta"></span>`);
    const cons = el('div', { class: 'bp-cons', 'aria-label': 'Consumers' });
    const icons = Array.from({ length: 12 }, () => cons.appendChild(el('span', { class: 'bp-c' })));
    const ctl = el('div', { class: 'row' });
    const add = el('button', { class: 'btn go as-btn', type: 'button', id: 'bp-add' }, '+ consumer');
    const rem = el('button', { class: 'btn ghost as-btn', type: 'button', id: 'bp-remove' }, '− consumer');
    onPress(add, () => changeConsumers(1));
    onPress(rem, () => changeConsumers(-1));
    ctl.append(add, rem);
    const db = el('div', { class: 'bp-db' }, `<span class="small">Database load</span><span class="as-bar"><i id="bp-dbbar"></i></span><span class="small" id="bp-db"></span>`);
    pA.append(qbar, cons, ctl, db);

    const pB = el('div', { class: 'bp-panel', hidden: true });
    const consumer = el('div', { class: 'bp-consumer', id: 'bp-consumer' });
    const rows = el('div', { class: 'bp-rows', role: 'group', 'aria-label': 'Messages in the queue, front first' });
    const rowBtns = Array.from({ length: ROWS }, (_, i) => {
      const b = el('button', { class: 'bp-row', type: 'button', 'data-qrow': i }, `<span class="id"></span><code class="pl"></code><span class="rc"></span>`);
      onPress(b, () => clickRow(i));
      rows.appendChild(b);
      return b;
    });
    const dlqBox = el('div', { class: 'bp-dlq', id: 'bp-dlq' });
    const feed = el('div', { class: 'feed' });
    const feedLines = Array.from({ length: 4 }, () => feed.appendChild(el('div')));
    pB.append(consumer, el('p', { class: 'eyebrow', style: 'margin:0' }, 'Queue (front at the top) · click a message to dead-letter it'), rows, dlqBox, feed);

    const pC = el('div', { class: 'bp-panel', hidden: true });
    const rRow = el('div', { class: 'row', role: 'group', 'aria-label': 'Tries before dead-lettering' }, '<span class="small">Tries before the DLQ</span>');
    const rBtns = sim.MAX_RECEIVES.map((v) => {
      const b = el('button', { class: 'chip', type: 'button', 'data-maxr': Number.isFinite(v) ? String(v) : 'never' }, Number.isFinite(v) ? String(v) : 'never');
      b.addEventListener('click', () => setMaxR(v));
      rRow.appendChild(b);
      return b;
    });
    const run = el('button', { class: 'btn go', type: 'button', id: 'bp-run' }, 'Run 2 min');
    run.addEventListener('click', runIt);
    rRow.appendChild(run);
    const res = el('div', { class: 'as-res', id: 'bp-res' });
    pC.append(rRow, res);
    stage.append(status, pA, pB, pC);

    const flow = makeFlow(api, meta, INFO, (t) => {
      if (t <= 1) d = sim.createDrain(t);
      if (t === 0 || t === 2) p = sim.createPoison(t);
      if (t === 3) { maxR = 1; res.innerHTML = ''; }
    }, render);

    // ---------- render ----------
    function drawDrain() {
      setText(stage.querySelector('#bp-qn')!, `${Math.round(d.queue)} orders`);
      stage.querySelector<HTMLElement>('#bp-qbar')!.style.width = `${Math.min(100, (100 * d.queue) / 160)}%`;
      const e = sim.eta(d);
      setText(stage.querySelector('#bp-eta')!, d.drained && d.queue < 2 ? 'keeping up' : Number.isFinite(e) ? `empty in ~${Math.ceil(e)} s` : 'growing!');
      qbar.classList.toggle('grow', !Number.isFinite(e) && !d.drained);
      icons.forEach((c, i) => {
        const cls = i < d.consumers ? (i >= sim.DB_MAX ? 'bp-c on over' : 'bp-c on') : 'bp-c';
        if (c.className !== cls) c.className = cls;
      });
      stage.querySelector<HTMLElement>('#bp-dbbar')!.style.width = `${Math.min(100, (100 * d.consumers) / sim.DB_MAX)}%`;
      db.classList.toggle('hot', d.consumers > sim.DB_MAX);
      setText(stage.querySelector('#bp-db')!, `${d.consumers} / ${sim.DB_MAX} connections`);
    }

    function drawPoison() {
      const down = p.now < p.downUntil;
      consumer.className = `bp-consumer${down ? ' down' : ''}`;
      setText(consumer, down ? 'Consumer: CRASHED, restarting…' : 'Consumer: running');
      rowBtns.forEach((b, i) => {
        const m = p.queue[i];
        b.hidden = !m;
        if (!m) return;
        setText(b.querySelector('.id')!, `#${m.id}`);
        setText(b.querySelector('.pl')!, m.payload);
        setText(b.querySelector('.rc')!, m.receives ? `tried ${m.receives}×` : '');
        b.classList.toggle('tried', m.receives > 0);
        setAttr(b, 'data-id', m.id);
        setAttr(b, 'aria-label', `Order ${m.id}, ${m.payload}${m.receives ? `, tried ${m.receives} times` : ''}. Activate to move it to the dead-letter queue.`);
      });
      dlqBox.innerHTML = `<span class="eyebrow">Dead-letter queue</span> ${p.dlq.length ? p.dlq.map((m) => `<code class="${m.poison ? '' : 'bad'}">#${m.id}</code>`).join(' ') : '<span class="small">empty</span>'}`;
      feedLines.forEach((l, i) => setText(l, p.log[i] ?? ''));
    }

    function render() {
      const t = flow.task;
      pA.hidden = !(t === 1 || (t === 0 && api.coach.step !== 'dlq'));
      pB.hidden = !(t === 2 || (t === 0 && api.coach.step === 'dlq'));
      pC.hidden = t !== 3;
      const s1 = stage.querySelector('#bp-s1')!, s2 = stage.querySelector('#bp-s2')!;
      if (!pA.hidden) {
        s1.innerHTML = `consumers <b>${d.consumers}</b> · queue <b>${Math.round(d.queue)}</b>`;
        s2.innerHTML = `in ${sim.ARRIVALS_PER_S}/s · out <b>${(d.consumers * sim.PER_CONSUMER * (d.consumers > sim.DB_MAX ? 0.5 : 1)).toFixed(1)}/s</b>`;
        drawDrain();
        flow.progress(t === 1 ? (d.drained ? `Drained! Now scale back to ${sim.SETTLED_MAX} or fewer (now ${d.consumers}).` : `Backlog: ${Math.round(d.queue)} orders`) : '');
      }
      if (!pB.hidden) {
        s1.innerHTML = `processed <b>${p.processed}</b> · crashes <b>${p.crashes}</b>`;
        s2.innerHTML = `quarantined <b>${p.handled}${t === 2 ? '/' + sim.POISONS : ''}</b>`;
        drawPoison();
        if (t === 2) flow.progress(`Poison messages caught: ${p.handled} / ${sim.POISONS}`);
      }
      if (t === 3) {
        rBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.maxr === (Number.isFinite(maxR) ? String(maxR) : 'never'))));
        s1.innerHTML = `tries before DLQ <b>${Number.isFinite(maxR) ? maxR : 'never'}</b>`;
        s2.innerHTML = `crash budget <b>${sim.CRASH_BUDGET}</b>`;
        flow.progress('Run when ready.');
      }
      if (!flow.coachBetween() && flow.phase === 'play') api.coach.say(...coachLine());
    }

    function coachLine(): [string, 'act' | 'watch'] {
      const t = flow.task;
      if (t === 1) {
        if (d.consumers > sim.DB_MAX) return [`Too many consumers: the database is overloaded. Click <b>−</b>.`, 'act'];
        if (d.drained) return d.consumers > sim.SETTLED_MAX ? [`Queue drained. Click <b>−</b> until you have ${sim.SETTLED_MAX} or fewer consumers.`, 'act'] : ['Steady state: keeping up with arrivals.', 'watch'];
        return !Number.isFinite(sim.eta(d)) ? ['The queue is growing. Click <b>+</b> to add consumers.', 'act'] : ['Draining. More consumers drain faster, up to the database limit.', 'watch'];
      }
      if (t === 2) {
        const head = p.queue[0];
        if (head && head.receives >= 1 && p.now < p.downUntil + 300) return [`Order #${head.id} just crashed the consumer and is back at the front. Is it broken? Click it to dead-letter it.`, 'act'];
        return ['Watch the consumer. If an order keeps crashing it, move that order to the dead-letter queue.', 'watch'];
      }
      if (t === 3) return ['Pick how many tries a message gets, then press <b>Run 2 min</b>.', 'act'];
      return ['', 'watch'];
    }

    // ---------- actions ----------
    function changeConsumers(delta: number) {
      if (flow.guard()) return;
      if (flow.task !== 1 && !(flow.phase === 'tutorial' && api.coach.step === 'add')) return api.toast(flow.task === 0 ? 'Tutorial: click the highlighted message.' : 'Consumer controls are for the backlog task.');
      if (flow.phase === 'tutorial' && delta < 0) return api.toast('Tutorial: click + (highlighted).');
      if (delta < 0 && d.consumers <= 1) return api.toast('Keep at least one consumer.');
      if (delta > 0 && d.consumers >= icons.length) return api.toast('That is all the consumers you can run.');
      api.move();
      const before = d.consumers;
      d.consumers += delta;
      const b = delta > 0 ? add : rem;
      if (flow.phase === 'tutorial') {
        api.hit('consumer added', b);
        api.coach.did('add');
      } else if (delta > 0 && d.consumers > sim.DB_MAX) {
        api.mistake('database overloaded', b);
        api.toast(`${d.consumers} consumers open ${d.consumers} database connections. The limit is ${sim.DB_MAX}: everything slows down.`);
      } else if (delta > 0 && !d.drained) api.hit('faster', b);
      else if (delta < 0 && (before > sim.DB_MAX || d.drained)) api.hit('right-sized', b);
      render();
      if (flow.task === 1 && sim.drainDone(d)) flow.done();
    }

    function clickRow(i: number) {
      if (flow.guard()) return;
      if (flow.phase === 'tutorial' && api.coach.step !== 'dlq') return api.toast('Tutorial: click + (highlighted).');
      if (flow.phase === 'tutorial' && i !== 0) return api.toast('Tutorial: click the highlighted message.');
      if (flow.task !== 2 && flow.phase !== 'tutorial') return;
      const m = p.queue[i];
      if (!m) return;
      api.move();
      const r = sim.toDlq(p, m.id);
      const b = rowBtns[i];
      if (r === 'quarantined') {
        api.hit('quarantined', b);
        if (flow.phase === 'tutorial') api.coach.did('dlq');
      } else if (r === 'good-order') {
        api.mistake('good order!', b);
        api.toast(`Order #${m.id} was fine. Now it sits in the DLQ instead of being processed.`);
      }
      render();
      if (flow.task === 2 && sim.poisonDone(p)) flow.done();
    }

    function setMaxR(v: number) {
      if (flow.guard()) return;
      if (flow.task !== 3) return;
      maxR = v;
      render();
    }

    function runIt() {
      if (flow.guard()) return;
      if (flow.task !== 3) return;
      api.move();
      const r = sim.runDlq(maxR);
      res.innerHTML = `<div class="mrow"><span>Good orders lost to the DLQ</span><span class="${r.lostGood ? 'bad-pill' : 'ok-pill'}" id="bp-lost">${r.lostGood}</span></div>
        <div class="mrow"><span>Good orders never processed (queue stuck)</span><span class="${r.leftGood ? 'bad-pill' : 'ok-pill'}" id="bp-left">${r.leftGood}</span></div>
        <div class="mrow"><span>Consumer crashes</span><span class="${r.crashes > sim.CRASH_BUDGET ? 'bad-pill' : 'ok-pill'}" id="bp-crash">${r.crashes}</span></div>
        <div class="mrow"><span>Poison messages quarantined</span><span class="ok-pill">${r.poisonQuarantined} / 3</span></div>`;
      if (sim.dlqOk(r)) {
        api.hit('resilient', run);
        return flow.done();
      }
      api.mistake('not yet', run);
      api.toast(r.lostGood ? `${r.lostGood} good orders hit a brief network blip on their first try and went straight to the DLQ.` : r.leftGood ? `Poison messages kept crashing the consumer (${r.crashes} crashes) and blocked ${r.leftGood} good orders behind them.` : `${r.crashes} crashes: over the budget.`);
      render();
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
      if (flow.phase === 'play' && flow.task === 1) {
        for (const e of sim.stepDrain(d, dt)) {
          if (e.type === 'db-second') api.mistake('database overloaded', db);
          else if (e.type === 'idle-second') {
            api.mistake('idle consumers', cons);
            if (t - lastToast > 2500) { lastToast = t; api.toast(`The queue is empty: extra consumers sit idle and cost money. Scale back to ${sim.SETTLED_MAX}.`); }
          } else if (e.type === 'drained') api.toast('Backlog drained!');
        }
        if (sim.drainDone(d)) flow.done();
      }
      if (flow.phase === 'play' && flow.task === 2) {
        for (const e of sim.stepPoison(p, dt)) {
          if (e.type === 'crash' && e.receives >= 2) {
            api.mistake('crashed again', consumer);
            if (t - lastToast > 2500) { lastToast = t; api.toast(`Order #${e.id} crashed the consumer again (${e.receives}×). Dead-letter it!`); }
          }
        }
      }
      if (t - lastPanel > 150 && (flow.task <= 2) && flow.phase !== 'pre') {
        lastPanel = t;
        render();
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
