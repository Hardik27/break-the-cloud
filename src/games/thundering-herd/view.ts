/** Thundering Herd view. The TTL bar, DB meter and herd dots are built once; frames update styles only. */
import { el, onPress, setText } from '../../lib/dom';
import { makeFlow } from '../flow';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

const INFO = [
  { h: 'Tutorial: the herd', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'Just in time', p: `The homepage’s TTL bar drains over ${sim.TTL_MS / 1000} s. Click <b>Refresh</b> while it is in the last 30% (the amber zone). Too late and the herd stampedes the database; too early wastes a database query. Get <b>${sim.GOOD_REFRESHES} good refreshes</b>.` },
  { h: 'One hot key', p: `You can’t click Refresh forever. Pick protections, then press <b>Run</b> to expire the homepage once. Goal: the database gets at most ${sim.DB_CAP} queries, and 99% of users get an answer within ${sim.P99_GOAL_MS} ms.` },
  { h: 'Synchronized expiry', p: `A deploy cached ${sim.KEYS} keys at the same moment, all with a ${sim.LONG_TTL_S} s TTL. Add random <b>jitter</b> to each TTL, then press <b>Run 5 min</b>. Goal: never more than ${sim.SPREAD_CAP} refreshes in one second.` },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    let hot = sim.createHot(0);
    const hotOpts: sim.HotOpts = { coalesce: false, swr: false };
    let jitter = 0;
    let alive = true;

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="th-s1"></span><span id="th-s2"></span>`);
    const p1 = el('div', { class: 'th-panel' });
    const users = el('div', { class: 'th-users' }, '<b>1,000</b><span class="small">requests / s</span>');
    const cacheCard = el('div', { class: 'th-cache' }, `<div class="th-key"><b>homepage</b><span class="small" id="th-left"></span></div><div class="th-ttl"><span class="zone"></span><i id="th-bar"></i></div>`);
    const refresh = el('button', { class: 'btn go', type: 'button', id: 'th-refresh' }, 'Refresh');
    onPress(refresh, () => doRefresh());
    const expire = el('button', { class: 'btn ghost', type: 'button', id: 'th-expire', hidden: true }, 'Expire now');
    onPress(expire, () => doExpire());
    const btnRow = el('div', { class: 'row' });
    btnRow.append(refresh, expire);
    cacheCard.appendChild(btnRow);
    const dbCard = el('div', { class: 'th-db', id: 'th-db' }, `<b>Database</b><span class="small" id="th-dbq"></span><div class="th-meter"><i id="th-dbm"></i></div>`);
    const herd = el('div', { class: 'th-herd', 'aria-hidden': 'true' });
    const dots = Array.from({ length: 40 }, () => herd.appendChild(el('span')));
    const flowRow = el('div', { class: 'th-flow' });
    flowRow.append(users, cacheCard, dbCard);
    p1.append(flowRow, herd);

    const p2 = el('div', { class: 'th-panel', hidden: true });
    const coal = el('button', { class: 'chip', type: 'button', id: 'th-coal', 'aria-pressed': 'false' }, 'Request coalescing');
    const swr = el('button', { class: 'chip', type: 'button', id: 'th-swr', 'aria-pressed': 'false' }, 'Stale-while-revalidate');
    const run2 = el('button', { class: 'btn go', type: 'button', id: 'th-run2' }, 'Run');
    coal.addEventListener('click', () => toggle('coalesce'));
    swr.addEventListener('click', () => toggle('swr'));
    run2.addEventListener('click', runHot);
    const r2 = el('div', { class: 'th-res', id: 'th-res2' });
    const row2 = el('div', { class: 'row' });
    row2.append(coal, swr, run2);
    p2.append(el('p', { class: 'small', style: 'margin:0' }, '<b>Coalescing:</b> one request reloads, the others wait for it. <b>Stale-while-revalidate:</b> everyone gets the old copy instantly while one request reloads in the background.'), row2, r2);

    const p3 = el('div', { class: 'th-panel', hidden: true });
    const row3 = el('div', { class: 'row', role: 'group', 'aria-label': 'TTL jitter' }, '<span class="small">TTL jitter</span>');
    const jBtns = sim.JITTERS.map((j) => {
      const b = el('button', { class: 'chip', type: 'button', 'data-jitter': j }, j ? `±${j}%` : 'none');
      b.addEventListener('click', () => setJitter(j));
      row3.appendChild(b);
      return b;
    });
    const run3 = el('button', { class: 'btn go', type: 'button', id: 'th-run3' }, 'Run 5 min');
    run3.addEventListener('click', runMany);
    row3.appendChild(run3);
    const r3 = el('div', { class: 'th-res', id: 'th-res3' });
    p3.append(row3, r3);
    stage.append(status, p1, p2, p3);

    const flow = makeFlow(api, meta, INFO, (t) => {
      if (t <= 1) hot = sim.createHot(t);
      if (t === 2) { hotOpts.coalesce = false; hotOpts.swr = false; r2.innerHTML = ''; }
      if (t === 3) { jitter = 0; r3.innerHTML = ''; }
    }, render);

    // ---------- render ----------
    function drawHot() {
      const left = sim.ttlLeft(hot);
      const bar = stage.querySelector<HTMLElement>('#th-bar')!;
      bar.style.width = `${(left * 100).toFixed(1)}%`;
      bar.className = left <= 0.3 ? 'zone' : left > sim.TOO_EARLY ? 'early' : '';
      setText(stage.querySelector('#th-left')!, `expires in ${((left * sim.TTL_MS) / 1000).toFixed(1)} s`);
      const load = hot.dbLoad;
      const m = stage.querySelector<HTMLElement>('#th-dbm')!;
      m.style.width = `${Math.min(100, (100 * load) / sim.DB_CAP)}%`;
      dbCard.classList.toggle('hot', load > sim.DB_CAP);
      setText(stage.querySelector('#th-dbq')!, `${Math.round(load)} queries now`);
      const n = Math.min(dots.length, Math.round(load / 7));
      dots.forEach((d, i) => d.classList.toggle('on', i < n));
      refresh.classList.toggle('pulse', left <= 0.3);
    }

    function render() {
      const t = flow.task;
      p1.hidden = t > 1;
      p2.hidden = t !== 2;
      p3.hidden = t !== 3;
      expire.hidden = !(flow.phase === 'tutorial' && api.coach.step === 'expire');
      const s1 = stage.querySelector('#th-s1')!, s2 = stage.querySelector('#th-s2')!;
      if (t <= 1) {
        s1.innerHTML = `good refreshes <b>${hot.good}${t === 1 ? `/${sim.GOOD_REFRESHES}` : ''}</b>`;
        s2.innerHTML = `stampedes <b>${hot.stampedes}</b>`;
        drawHot();
        flow.progress(t === 1 ? `Good refreshes: ${hot.good} / ${sim.GOOD_REFRESHES}` : '');
      } else if (t === 2) {
        coal.setAttribute('aria-pressed', String(hotOpts.coalesce));
        swr.setAttribute('aria-pressed', String(hotOpts.swr));
        s1.innerHTML = `DB limit <b>${sim.DB_CAP} queries</b>`;
        s2.innerHTML = `latency goal <b>${sim.P99_GOAL_MS} ms</b>`;
        flow.progress('Run the test when ready.');
      } else {
        jBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.jitter) === jitter)));
        s1.innerHTML = `${sim.KEYS} keys · TTL <b>${sim.LONG_TTL_S} s ${jitter ? '±' + jitter + '%' : ''}</b>`;
        s2.innerHTML = `DB budget <b>${sim.SPREAD_CAP} refreshes / s</b>`;
        flow.progress('Run the test when ready.');
      }
      if (!flow.coachBetween() && flow.phase === 'play') api.coach.say(...coachLine());
    }

    function coachLine(): [string, 'act' | 'watch'] {
      const t = flow.task;
      if (t === 1) {
        const left = sim.ttlLeft(hot);
        return left <= 0.3 ? ['Now! The TTL is in the amber zone: click <b>Refresh</b>.', 'act'] : ['Wait for the TTL bar to reach the amber zone, then click <b>Refresh</b>.', 'watch'];
      }
      if (t === 2) return ['Choose protections for the hot key, then press <b>Run</b>.', 'act'];
      if (t === 3) return ['Pick a TTL jitter, then press <b>Run 5 min</b>.', 'act'];
      return ['', 'watch'];
    }

    // ---------- actions ----------
    function doRefresh() {
      if (flow.guard()) return;
      if (flow.task > 1) return api.toast('Manual refresh was the last task. Pick protections below.');
      if (flow.phase === 'tutorial' && api.coach.step !== 'refresh') return api.toast('Tutorial: click Expire now (highlighted).');
      api.move();
      const r = sim.refresh(hot);
      if (r === 'good') {
        api.hit('just in time', refresh);
        if (flow.phase === 'tutorial') api.coach.did('refresh');
      } else {
        api.mistake('too early', refresh);
        api.toast('Too early: the cached copy was still fresh, so that database query was wasted. Wait for the amber zone.');
      }
      render();
      if (flow.task === 1 && hot.good >= sim.GOOD_REFRESHES) flow.done();
    }

    function doExpire() {
      if (flow.guard()) return;
      if (flow.phase !== 'tutorial') return;
      sim.stampede(hot);
      api.toast(`Stampede! About ${Math.round((sim.REQS_PER_SEC * sim.DB_MS) / 1000)} requests hit the database at once. Its limit is ${sim.DB_CAP}.`);
      api.coach.did('expire');
      render();
    }

    function toggle(k: keyof sim.HotOpts) {
      if (flow.guard()) return;
      if (flow.task !== 2) return api.toast('These protections are for the next task.');
      hotOpts[k] = !hotOpts[k];
      render();
    }

    function runHot() {
      if (flow.guard()) return;
      if (flow.task !== 2) return api.toast('Running the test is for the next task.');
      api.move();
      const r = sim.hotKeyExpiry(hotOpts);
      r2.innerHTML = `<div class="mrow"><span>Database queries when the key expired</span><span class="${r.dbOk ? 'ok-pill' : 'bad-pill'}" id="th-q">${r.queries}</span></div>
        <div class="mrow"><span>Slowest 1% of users waited</span><span class="${r.fastOk ? 'ok-pill' : 'bad-pill'}" id="th-p99">${r.p99Ms} ms</span></div>`;
      if (r.dbOk && r.fastOk) {
        api.hit('herd tamed', run2);
        return flow.done();
      }
      api.mistake(r.dbOk ? 'users waited' : 'stampede', run2);
      api.toast(!r.dbOk ? 'The herd still reaches the database. Make sure only one request reloads the key.' : 'The database is safe, but every user waits 300 ms for the one reload. Can they get the old copy meanwhile?');
      render();
    }

    function setJitter(j: number) {
      if (flow.guard()) return;
      if (flow.task !== 3) return api.toast('Jitter is for the last task.');
      jitter = j;
      render();
    }

    function runMany() {
      if (flow.guard()) return;
      if (flow.task !== 3) return api.toast('Running the test is for the last task.');
      api.move();
      const xs = sim.expirySchedule(jitter);
      const pk = sim.peak(xs);
      const W = 600, H = 90;
      const bars = xs.map((v, i) => `<rect x="${(W * i) / xs.length}" y="${H - Math.min(H, (H * v) / 60)}" width="${Math.max(1, W / xs.length - 0.4)}" height="${Math.min(H, (H * v) / 60)}" fill="${v > sim.SPREAD_CAP ? 'var(--bad)' : 'var(--ok)'}"/>`).join('');
      const capY = H - (H * sim.SPREAD_CAP) / 60;
      r3.innerHTML = `<svg viewBox="0 0 ${W} ${H + 14}" class="th-chart" role="img" aria-label="Refreshes per second over 5 minutes">${bars}<line x1="0" y1="${capY}" x2="${W}" y2="${capY}" stroke="var(--muted)" stroke-dasharray="4 4"/><text x="0" y="${H + 12}" font-family="IBM Plex Mono, monospace" font-size="10" fill="var(--muted)">0</text><text x="${W}" y="${H + 12}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="10" fill="var(--muted)">5 min</text></svg>
        <div class="mrow"><span>Most refreshes in one second</span><span class="${pk <= sim.SPREAD_CAP ? 'ok-pill' : 'bad-pill'}" id="th-peak">${pk}</span></div>`;
      if (pk <= sim.SPREAD_CAP) {
        api.hit('smooth', run3);
        return flow.done();
      }
      api.mistake('spike', run3);
      api.toast(jitter === 0 ? `All ${sim.KEYS} keys expire in the same second, every minute. Spread them out.` : `±${jitter}% spreads them over only a few seconds: still ${pk} refreshes in one second. Spread them wider.`);
      render();
    }

    // ---------- loop ----------
    let last = performance.now();
    let raf = 0;
    let lastPanel = 0;
    function frame(t: number) {
      if (!alive) return;
      const dt = Math.min(100, t - last);
      last = t;
      if (flow.task <= 1 && flow.phase !== 'done') {
        if (flow.phase === 'play' && flow.task === 1) {
          for (const e of sim.stepHot(hot, dt)) {
            api.mistake('stampede!', dbCard);
            api.toast(`Too late! The key expired and ${e.queries} requests hit the database at once.`);
          }
        } else sim.stepHot(hot, dt);
        drawHot();
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
