/** Blast Radius view. Placement grid, zone cards and option chips are built once; updates change text and classes. */
import { el, onPress, setText } from '../../lib/dom';
import { makeFlow } from '../flow';
import { predictAndReveal, replayBusy } from '../replay';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

const INFO = [
  { h: 'Tutorial: zones', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'Spread out', p: `Everything runs in zone a. Move components so that whichever zone fails, at least <b>${sim.WEB_NEEDED} web servers</b> and <b>one database</b> are left. Then press <b>Test zone failures</b>.` },
  { h: 'A zone goes dark', p: `Your fleet is spread out, with the database primary in zone a and its replica in zone b. Soon zone a will fail. <b>Promote</b> the replica so writes keep working, and keep enough web servers running (demand grows to 5 at lunch). New servers take ${sim.BOOT_MS / 1000} s to boot.` },
  { h: 'Lose a whole region', p: `Now plan for losing all of us-east. Pick how the database is copied to us-west and what is ready there, then press <b>Lose us-east</b>. Requirements: lose at most ${sim.RPO_GOAL_S} s of data (RPO), be back within ${sim.RTO_GOAL_S / 60} min (RTO), add at most ${sim.LATENCY_GOAL_MS} ms to each write, and spend at most ${sim.BUDGET} budget units.` },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    let place = sim.startPlacement();
    let live = sim.createLive();
    let repl = 'backup';
    let standby = 'cold';
    let alive = true;

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="br-s1"></span><span id="br-s2"></span>`);
    const p1 = el('div', { class: 'br-panel' });
    const grid = el('div', { class: 'br-grid', role: 'group', 'aria-label': 'Where each component runs' }, `<span></span>${sim.AZS.map((a) => `<span class="br-azh">zone ${a}</span>`).join('')}`);
    const placeBtns: Record<string, HTMLButtonElement[]> = {};
    for (const c of sim.COMPONENTS) {
      grid.appendChild(el('span', { class: `br-name ${c.startsWith('db') ? 'db' : ''}` }, c));
      placeBtns[c] = sim.AZS.map((a) => {
        const b = el('button', { class: 'br-cell', type: 'button', 'data-place': `${c}-${a}`, 'aria-label': `Run ${c} in zone ${a}` }, '');
        onPress(b, () => doPlace(c, a));
        grid.appendChild(b);
        return b;
      });
    }
    const test = el('button', { class: 'btn go', type: 'button', id: 'br-test' }, 'Test zone failures');
    onPress(test, () => doTest());
    const testRes = el('div', { class: 'br-tests', id: 'br-tests' });
    p1.append(grid, test, testRes);

    const p2 = el('div', { class: 'br-panel', hidden: true });
    const zones = el('div', { class: 'br-zones' });
    const zoneUi = sim.AZS.map((a) => {
      const card = el('div', { class: 'br-zone', 'data-zone': a }, `<b>zone ${a}</b><span class="br-servers"></span><span class="br-db small"></span>`);
      const add = el('button', { class: 'btn ghost', type: 'button', 'data-add': a }, '+ web server');
      onPress(add, () => doAdd(a));
      card.appendChild(add);
      zones.appendChild(card);
      return { card, servers: card.querySelector<HTMLElement>('.br-servers')!, db: card.querySelector<HTMLElement>('.br-db')!, add };
    });
    const promoteBtn = el('button', { class: 'btn go', type: 'button', id: 'br-promote' }, 'Promote replica to primary');
    onPress(promoteBtn, () => doPromote());
    const liveStat = el('div', { class: 'br-live', id: 'br-live' });
    p2.append(zones, promoteBtn, liveStat);

    const p3 = el('div', { class: 'br-panel', hidden: true });
    const optRow = (label: string, opts: sim.Option[], attr: string, pick: (id: string) => void) => {
      const box = el('div', { class: 'br-opts', role: 'group', 'aria-label': label }, `<p class="eyebrow" style="margin:0 0 6px">${label}</p>`);
      const btns = opts.map((o) => {
        const b = el('button', { class: 'br-opt', type: 'button', [attr]: o.id }, `<b>${o.label}</b><span class="small">${o.detail}</span><span class="cost">${'$'.repeat(o.cost) || 'free'}</span>`);
        b.addEventListener('click', () => pick(o.id));
        box.appendChild(b);
        return b;
      });
      return { box, btns };
    };
    const rRow = optRow('Copy the database to us-west', sim.REPLICATION, 'data-repl', (id) => setOpt(() => (repl = id)));
    const sRow = optRow('Ready in us-west', sim.STANDBY, 'data-standby', (id) => setOpt(() => (standby = id)));
    const run = el('button', { class: 'btn go', type: 'button', id: 'br-run' }, 'Lose us-east');
    run.addEventListener('click', runDr);
    const drRes = el('div', { class: 'as-res', id: 'br-dr' });
    p3.append(rRow.box, sRow.box, run, drRes);
    stage.append(status, p1, p2, p3);

    const flow = makeFlow(api, meta, INFO, (t) => {
      if (t <= 1) { place = sim.startPlacement(); testRes.innerHTML = ''; }
      if (t === 2) live = sim.createLive();
      if (t === 3) { repl = 'backup'; standby = 'cold'; drRes.innerHTML = ''; }
    }, render);

    // ---------- render ----------
    function drawLive() {
      zoneUi.forEach((z, i) => {
        const a = sim.AZS[i];
        const dead = live.down === a;
        z.card.classList.toggle('dead', dead);
        const ws = live.webs.filter((w) => w.az === a);
        z.servers.innerHTML = ws.map((w) => `<i class="${dead ? 'dead' : w.readyAt > live.now ? 'boot' : ''}"></i>`).join('');
        setText(z.db, live.primary === a ? (dead ? 'db primary: LOST' : 'db primary') : live.replica === a ? 'db replica' : '');
        z.db.className = `br-db small ${live.primary === a ? (dead ? 'badc' : 'pri') : ''}`;
      });
      const cap = sim.capacity(live), dem = sim.demand(live);
      liveStat.innerHTML = `<div class="mrow"><span>Writes (orders, sign-ups)</span><span class="${sim.writesUp(live) ? 'ok-pill' : 'bad-pill'}" id="br-writes">${sim.writesUp(live) ? 'working' : 'FAILING'}</span></div>
        <div class="mrow"><span>Web capacity vs demand</span><span class="${cap >= dem ? 'ok-pill' : 'bad-pill'}" id="br-cap">${cap} / ${dem}</span></div>
        <div class="mrow"><span>Time</span><span>${Math.floor(live.now / 1000)} / ${sim.LIVE_MS / 1000} s</span></div>`;
    }

    function render() {
      const t = flow.task;
      p1.hidden = t > 1;
      p2.hidden = t !== 2;
      p3.hidden = t !== 3;
      const s1 = stage.querySelector('#br-s1')!, s2 = stage.querySelector('#br-s2')!;
      if (t <= 1) {
        for (const c of sim.COMPONENTS) placeBtns[c].forEach((b, i) => {
          const on = place[c] === sim.AZS[i];
          b.setAttribute('aria-pressed', String(on));
          b.textContent = on ? '●' : '';
        });
        const tests = sim.testAll(place);
        s1.innerHTML = `zones: ${sim.AZS.map((a) => `${a} <b>${sim.COMPONENTS.filter((c) => place[c] === a).length}</b>`).join(' · ')}`;
        s2.innerHTML = `worst zone loss leaves <b>${Math.min(...tests.map((x) => x.webLeft))}</b> web servers`;
        flow.progress(t === 1 ? 'Move components, then test.' : '');
      } else if (t === 2) {
        s1.innerHTML = `zone a <b>${live.down ? 'DOWN' : 'up'}</b>`;
        s2.innerHTML = `writes down <b>${(live.writesDownMs / 1000).toFixed(1)} s</b> · short <b>${(live.shortMs / 1000).toFixed(1)} s</b>`;
        drawLive();
        flow.progress(`Survive: ${Math.floor(live.now / 1000)} / ${sim.LIVE_MS / 1000} s`);
      } else {
        rRow.btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.repl === repl)));
        sRow.btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.standby === standby)));
        const r = sim.evaluateDr(repl, standby);
        s1.innerHTML = `cost <b>${r.cost} / ${sim.BUDGET}</b>`;
        s2.innerHTML = '';
        flow.progress('Run when ready.');
      }
      if (!flow.coachBetween() && flow.phase === 'play') api.coach.say(...coachLine());
    }

    function coachLine(): [string, 'act' | 'watch'] {
      const t = flow.task;
      if (t === 1) return [`Move components so every zone holds part of the fleet, then press <b>Test zone failures</b>.`, 'act'];
      if (t === 2) {
        if (!live.down) return ['Everything is healthy. Watch the zones.', 'watch'];
        if (!sim.writesUp(live)) return ['Zone a is down with the database primary! <b>Promote the replica</b>.', 'act'];
        if (sim.capacity(live) < sim.demand(live) || (live.now > sim.LUNCH_AT - 4000 && live.webs.filter((w) => w.az !== live.down).length < 5)) return ['Not enough web servers for the lunch rush. Add one in a <b>healthy</b> zone.', 'act'];
        return ['Holding steady. Keep an eye on capacity.', 'watch'];
      }
      if (t === 3) return ['Pick how data is copied and what is ready in us-west, then press <b>Lose us-east</b>.', 'act'];
      return ['', 'watch'];
    }

    // ---------- actions ----------
    function doPlace(c: string, a: sim.Az) {
      if (flow.guard()) return;
      if (flow.task > 1) return;
      if (flow.phase === 'tutorial' && !(api.coach.step === 'move' && c === 'web-2' && a === 'b')) return api.toast('Tutorial: click the highlighted cell.');
      if (place[c] === a) return api.toast(`${c} already runs in zone ${a}.`);
      api.move();
      place[c] = a;
      if (flow.phase === 'tutorial') {
        api.hit('moved', placeBtns[c][1]);
        api.coach.did('move');
      }
      render();
    }

    function doTest() {
      if (flow.guard()) return;
      if (flow.task > 1) return;
      if (flow.phase === 'tutorial' && api.coach.step !== 'test') return api.toast('Tutorial: click the highlighted cell first.');
      api.move();
      const tests = sim.testAll(place);
      testRes.innerHTML = tests.map((x) => `<div class="mrow"><span>Lose zone ${x.az}: ${x.webLeft} web, ${x.dbLeft} database${x.dbLeft === 1 ? '' : 's'} left</span><span class="${x.ok ? 'ok-pill' : 'bad-pill'}" data-test="${x.az}">${x.ok ? 'survives' : 'OUTAGE'}</span></div>`).join('');
      if (flow.phase === 'tutorial') {
        api.coach.did('test');
        return;
      }
      if (tests.every((x) => x.ok)) {
        api.hit('zone-proof', test);
        return flow.done();
      }
      const bad = tests.filter((x) => !x.ok);
      api.mistake('outage', test);
      api.toast(`Losing zone ${bad.map((x) => x.az).join(' or ')} would take the service down: ${bad[0].webLeft < sim.WEB_NEEDED ? `only ${bad[0].webLeft} web servers left` : 'no database left'}.`);
      render();
    }

    function doPromote() {
      if (flow.guard()) return;
      if (flow.task !== 2) return;
      api.move();
      const r = sim.promote(live);
      if (r === 'promoted') api.hit('failed over', promoteBtn);
      else if (r === 'not-needed') api.toast('The primary is healthy. Promoting now would only cause a needless failover.');
      else api.toast('There is no healthy replica to promote.');
      render();
    }

    function doAdd(a: sim.Az) {
      if (flow.guard()) return;
      if (flow.task !== 2) return;
      api.move();
      const r = sim.addWeb(live, a);
      const b = zoneUi[sim.AZS.indexOf(a)].add;
      if (r === 'dead-zone') {
        api.mistake('dead zone', b);
        api.toast(`Zone ${a} is down: a server launched there will never come up.`);
      } else if (live.down && sim.capacity(live) < sim.demand(live) + 1) api.hit('capacity', b);
      else api.toast(`Booting a web server in zone ${a}.`);
      render();
    }

    function setOpt(f: () => void) {
      if (flow.guard()) return;
      if (flow.task !== 3) return api.toast('Region planning is the last task.');
      f();
      render();
    }

    async function runDr() {
      if (flow.guard()) return;
      if (flow.task !== 3) return;
      if (replayBusy()) return api.toast('Wait for this run.');
      api.move();
      const r = sim.evaluateDr(repl, standby);
      drRes.innerHTML = '';
      await predictAndReveal(api, drRes, {
        title: 'The region goes dark',
        simMs: 1000,
        realMs: 1500,
        predict: { q: `Replication: ${repl}, standby: ${standby}. The whole region fails. What is the weakest point of this plan?`, options: ['We lose data', 'We are down too long', 'Every write gets slower, or it costs too much', 'Nothing: it meets every goal'], answer: !r.rpoOk ? 0 : !r.rtoOk ? 1 : !r.latencyOk || !r.costOk ? 2 : 3, why: !r.rpoOk ? 'Backups or slow copies mean the newest orders exist only in the region that died.' : !r.rtoOk ? 'A cold standby has to be built from scratch before it can serve.' : !r.latencyOk ? 'Synchronous replication makes every write wait for the far region.' : !r.costOk ? 'A hot standby doubles your bill.' : 'Asynchronous copies lose only seconds, and a warm standby is quick to promote.' },
      });
      if (!alive) return;
      const pill = (ok: boolean, txt: string, id: string) => `<span class="${ok ? 'ok-pill' : 'bad-pill'}" id="${id}">${txt}</span>`;
      drRes.innerHTML = `<div class="mrow"><span>Data lost (RPO, goal ≤ ${sim.RPO_GOAL_S} s)</span>${pill(r.rpoOk, sim.fmtDuration(r.rpoS), 'br-rpo')}</div>
        <div class="mrow"><span>Time down (RTO, goal ≤ ${sim.RTO_GOAL_S / 60} min)</span>${pill(r.rtoOk, sim.fmtDuration(r.rtoS), 'br-rto')}</div>
        <div class="mrow"><span>Extra delay on every write</span>${pill(r.latencyOk, `${r.latencyMs} ms`, 'br-lat')}</div>
        <div class="mrow"><span>Cost (budget ${sim.BUDGET})</span>${pill(r.costOk, String(r.cost), 'br-cost')}</div>`;
      if (r.ok) {
        api.hit('disaster-ready', run);
        return flow.done();
      }
      api.mistake('not yet', run);
      api.toast(!r.rpoOk ? `You would lose up to ${sim.fmtDuration(r.rpoS)} of orders.` : !r.latencyOk ? `Every write now waits ${r.latencyMs} ms for the other region to confirm.` : !r.rtoOk ? `It takes ${sim.fmtDuration(r.rtoS)} to get back up.` : `That costs ${r.cost}: over the budget of ${sim.BUDGET}.`);
      render();
    }

    // ---------- loop (task 2) ----------
    let last = performance.now();
    let raf = 0;
    let lastPanel = 0;
    let lastToast = 0;
    function frame(t: number) {
      if (!alive) return;
      const dt = Math.min(100, t - last);
      last = t;
      if (flow.task === 2 && flow.phase === 'play') {
        for (const e of sim.stepLive(live, dt)) {
          if (e.type === 'az-down') api.toast('Zone a just lost power!');
          else if (e.type === 'lunch') api.toast('Lunch rush: demand is up to 5 servers.');
          else if (e.type === 'writes-second') {
            api.mistake('writes failing', promoteBtn);
            if (t - lastToast > 2500) { lastToast = t; api.toast('Orders are failing: the database primary is gone. Promote the replica!'); }
          } else if (e.type === 'short-second') {
            api.mistake('not enough servers', liveStat);
            if (t - lastToast > 2500) { lastToast = t; api.toast('Not enough web servers: users are getting errors.'); }
          } else if (e.type === 'done') flow.done();
        }
        if (t - lastPanel > 150) {
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
