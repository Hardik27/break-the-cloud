/** Traffic Cop view: builds every interactive node once, then only updates attributes and text each frame. */
import { el, onPress, setAttr, setText } from '../../lib/dom';
import { mulberry32 } from '../../lib/rng';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

type Phase = 'pre' | 'tutorial' | 'play' | 'between' | 'done';

const TASK_INFO = [
  { h: 'Tutorial: route by hand', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'Be the load balancer', p: 'Click a server for each request before it times out (2.5 s). Get <b>10 in a row</b> with no drops. Heavy (orange) requests need 3 free units.' },
  { h: 'Let an algorithm route', p: 'Nobody routes by hand at scale. Switch the balancer to <b>round robin</b>: it sends requests to each server in turn. Then get <b>15 in a row</b>. Something will break.' },
  { h: 'Not all requests are equal', p: 'Heavy requests take 3 units and last longer, and a client sends one on most third calls. Keep <b>15 in a row</b> alive.' },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    const s = sim.create(mulberry32(api.seed));
    let phase: Phase = 'pre';
    let nextStageAt = 0;
    let dropsThisStage = 0;
    let alive = true;

    // ---------- build DOM once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span>strategy <b id="tc-strategy"></b></span><span>health checks <b id="tc-health"></b></span><span>streak <b id="tc-streak"></b></span><span>served <b id="tc-served"></b> of recent</span>`);
    const lbstage = el('div', { class: 'lbstage' });
    const queueCol = el('div', { class: 'queue' });
    const rq = el('div', { class: 'reqbox', id: 'tc-rq', 'data-k': '', 'data-size': '0', 'aria-label': 'Request box' });
    const pkt = el('span', { class: 'pkt', hidden: true });
    rq.appendChild(pkt);
    const rqTxt = el('span', { id: 'tc-rqtxt' });
    queueCol.append(rq, rqTxt);
    const serversBox = el('div', { class: 'servers' });
    const srvEls = s.servers.map((srv, i) => {
      const b = el('button', { class: 'srv', type: 'button', 'data-srv': i }, `<span class="nm">${srv.name}</span><span class="bar"><i></i></span><span class="st"></span>`);
      onPress(b, () => clickServer(i));
      serversBox.appendChild(b);
      return { b, bar: b.querySelector('i')!, st: b.querySelector<HTMLElement>('.st')! };
    });
    lbstage.append(queueCol, serversBox);
    const ctl = el('div', { class: 'lbctl' });
    const stratGrp = el('span', { class: 'grp', role: 'group', 'aria-label': 'Routing strategy' }, `<span class="small">Strategy</span>`);
    const chips = (['manual', 'rr', 'least'] as sim.Strategy[]).map((k) => {
      const b = el('button', { class: 'chip', type: 'button', 'data-s': k, 'aria-pressed': 'false' }, { manual: 'By hand', rr: 'Round robin', least: 'Least loaded' }[k]);
      b.addEventListener('click', () => clickStrategy(k));
      stratGrp.appendChild(b);
      return { k, b };
    });
    const hcGrp = el('span', { class: 'grp', hidden: true }, `<span class="small">Health checks</span>`);
    const hc = el('button', { class: 'chip', type: 'button', id: 'tc-hc', 'aria-pressed': 'false' }, 'Off');
    hc.addEventListener('click', clickHealth);
    hcGrp.appendChild(hc);
    ctl.append(stratGrp, hcGrp);
    const strip = el('div', { class: 'strip', 'aria-label': 'Recent requests: green served, red dropped' });
    const stripCells = Array.from({ length: 60 }, () => strip.appendChild(el('span')));
    stage.append(status, lbstage, ctl, strip);
    const $ = (id: string) => stage.querySelector<HTMLElement>('#' + id)!;

    // ---------- side card (rebuilt only when a task starts) ----------
    let prog: HTMLElement | null = null;
    function renderSide() {
      const i = Math.min(s.stage, TASK_INFO.length - 1);
      const t = TASK_INFO[i];
      api.side.innerHTML = `<p class="eyebrow">Task ${i + 1} of ${meta.tasks.length}</p><h2>${t.h}</h2><p style="margin:0">${t.p}</p><div class="progress" id="tc-prog"></div>`;
      prog = api.side.querySelector('#tc-prog');
    }

    // ---------- flow ----------
    api.onBegin(() => {
      phase = 'tutorial';
      sim.enterStage(s, 0);
      sim.inject(s, false);
      renderSide();
      api.coach.tutorial(meta.walkthrough, onTutorialDone);
    });

    function onTutorialDone() {
      api.task(0);
      phase = 'between';
      nextStageAt = s.now + 1800;
    }

    function startStage(n: number) {
      sim.enterStage(s, n);
      dropsThisStage = 0;
      phase = 'play';
      renderSide();
    }

    const TUTORIAL_SERVER: Record<string, number> = { 'route-1': 0, 'route-2': 1, 'route-heavy': 2 };

    function clickServer(i: number) {
      const name = s.servers[i].name;
      if (phase === 'pre') return api.toast('Press Start first. It is in the brief, and above the game.');
      if (phase === 'done') return api.toast('All tasks done. Press Play again to start a new run.');
      if (phase === 'between') return api.toast('Task done. The next task starts in a moment.');
      if (phase === 'tutorial') {
        const want = TUTORIAL_SERVER[api.coach.step ?? ''];
        if (want !== i) return api.toast(`Tutorial: click ${s.servers[want ?? 0].name}, the highlighted server.`);
      }
      if (s.strategy !== 'manual') return api.toast(`The balancer routes with ${sim.STRATEGY_NAMES[s.strategy]} now, so clicking ${name} does nothing. Change the strategy below instead.`);
      if (!s.queue) return api.toast('No request is waiting. Wait for a dot to appear in the request box.');
      api.move();
      const ev = sim.route(s, i);
      flash(i);
      handle(ev);
      if (phase === 'tutorial') {
        const step = api.coach.step;
        api.coach.did(step!);
        if (api.coach.step === 'route-2') sim.inject(s, false);
        else if (api.coach.step === 'route-heavy') sim.inject(s, true);
      }
    }

    function lockReason(k: sim.Strategy): string | null {
      if (phase === 'pre') return 'Press Start first.';
      if (phase === 'tutorial') return 'Finish the tutorial first: click the highlighted server (or Skip tutorial).';
      if (phase === 'done') return 'All tasks done. Press Play again to start a new run.';
      if (phase === 'between') return 'The next task starts in a moment.';
      if (s.stage === 1 && k !== 'manual') return 'This task is routing by hand. Algorithms unlock in the next task.';
      if (s.stage === 2 && k === 'least') return 'Least loaded unlocks in the next task. Try round robin here.';
      if (s.stage >= 2 && k === 'manual') return 'Routing by hand is over. Pick an algorithm.';
      return null;
    }

    function clickStrategy(k: sim.Strategy) {
      const why = lockReason(k);
      if (why) return api.toast(why);
      if (s.strategy === k) return api.toast(`Already routing with ${sim.STRATEGY_NAMES[k]}.`);
      sim.setStrategy(s, k);
      api.move();
      api.toast(`Strategy: ${sim.STRATEGY_NAMES[k]}. Streak reset.`);
    }

    function clickHealth() {
      if (phase !== 'play') return api.toast(phase === 'done' ? 'All tasks done.' : 'Wait for the task to start.');
      sim.setHealth(s, !s.health);
      api.move();
      api.toast(s.health ? 'Health checks on: the balancer skips servers that fail them.' : 'Health checks off.');
    }

    function flash(i: number) {
      const b = srvEls[i].b;
      b.classList.add('hit');
      setTimeout(() => b.classList.remove('hit'), 180);
    }

    function handle(events: sim.SimEvent[]) {
      for (const e of events) {
        if (e.type === 'drop') {
          dropsThisStage++;
          if (phase === 'play') api.toast(`Dropped: ${e.why}. Streak reset.`);
        } else if (e.type === 'crash') {
          api.toast(`${s.servers[e.server].name} just crashed.`);
        } else if (e.type === 'goal') {
          api.task(e.stage);
          if (e.stage >= sim.LAST_STAGE) phase = 'done';
          else {
            phase = 'between';
            nextStageAt = s.now + 2500;
          }
        }
      }
    }

    // ---------- coach ----------
    function coachLine(): [string, 'act' | 'watch'] {
      if (phase === 'between') return ['Task done. Read the lesson; the next task starts in a moment.', 'watch'];
      const q = s.queue;
      if (s.stage === 1) {
        return q
          ? [`A ${q.heavy ? 'heavy request (needs 3 free units)' : 'request'} is waiting. <b>Click a server</b> with enough free space.`, 'act']
          : ['Watch the request box. When a request appears, click a server.', 'watch'];
      }
      if (s.stage === 2) {
        if (s.strategy === 'manual') return ['Click <b>Round robin</b> in the strategy row below the servers.', 'act'];
        const down = s.servers.find((x) => !x.up);
        if (down && !s.health) return [`${down.name} crashed, and round robin still sends it every third request. Turn on <b>Health checks</b> below.`, 'act'];
        if (!down) return ['Round robin sends requests to each server in turn. Watch the streak.', 'watch'];
        return ['Hands off: the balancer skips the dead server now. Watch the streak reach 15.', 'watch'];
      }
      if (s.stage === 3) {
        if (s.strategy === 'least') return ['Hands off. Least loaded checks each server before every pick. Watch the streak.', 'watch'];
        if (dropsThisStage === 0) return ['Watch round robin handle the heavy mix. If requests drop, change the strategy below.', 'watch'];
        return ['Round robin ignores load, so heavy requests landed on a full server. Pick <b>Least loaded</b>.', 'act'];
      }
      return ['', 'watch'];
    }

    // ---------- per-frame drawing (attributes and text only) ----------
    function draw() {
      const q = s.queue;
      setAttr(rq, 'data-k', q ? (q.heavy ? 'heavy' : 'light') : '');
      setAttr(rq, 'data-size', q ? q.size : 0);
      pkt.hidden = !q;
      pkt.classList.toggle('heavy', !!q?.heavy);
      const manualWaiting = !!q && s.strategy === 'manual' && (phase === 'play' || phase === 'tutorial');
      rq.classList.toggle('waiting', manualWaiting);
      setText(rqTxt, q ? (q.heavy ? 'heavy · 3 units' : 'request · 1 unit') : phase === 'pre' ? 'press Start' : 'next request…');
      s.servers.forEach((srv, i) => {
        const e = srvEls[i];
        const l = sim.load(srv);
        const pct = Math.min(100, (l / sim.CAP) * 100);
        e.b.classList.toggle('down', !srv.up);
        e.b.classList.toggle('pickable', manualWaiting && srv.up && sim.free(srv) >= q!.size);
        setAttr(e.b, 'data-load', l);
        setAttr(e.b, 'data-up', srv.up ? '1' : '0');
        setAttr(e.b, 'aria-label', `${srv.name}, ${srv.up ? `${l} of ${sim.CAP} units busy` : 'down'}. Activate to send the waiting request here.`);
        const w = pct + '%';
        if (e.bar.style.width !== w) e.bar.style.width = w;
        const cls = pct >= 100 ? 'full' : pct >= 75 ? 'hot' : '';
        if (e.bar.className !== cls) e.bar.className = cls;
        setText(e.st, srv.up ? `${l}/${sim.CAP}` : 'DOWN');
      });
      for (const c of chips) {
        setAttr(c.b, 'aria-pressed', String(s.strategy === c.k));
        setAttr(c.b, 'aria-disabled', String(!!lockReason(c.k) && phase === 'play'));
      }
      const showHc = phase !== 'pre' && (s.health || s.servers.some((x) => !x.up) || s.stage >= 3);
      hcGrp.hidden = !showHc;
      setAttr(hc, 'aria-pressed', String(s.health));
      setText(hc, s.health ? 'On' : 'Off');
      const goal = sim.STAGES[s.stage].goal;
      setText($('tc-strategy'), sim.STRATEGY_NAMES[s.strategy]);
      setText($('tc-health'), s.health ? 'on' : 'off');
      setText($('tc-streak'), s.stage > 0 ? `${s.streak} / ${goal}` : '–');
      const recent = s.results.slice(-60);
      const ok = recent.filter(Boolean).length;
      setText($('tc-served'), recent.length ? `${Math.round((100 * ok) / recent.length)}%` : '–');
      stripCells.forEach((c, i) => {
        const r = recent[i];
        const cls = r === undefined ? '' : r ? 'ok' : 'x';
        if (c.className !== cls) c.className = cls;
      });
      if (prog) {
        const txt = phase === 'tutorial' ? `Tutorial step ${Math.max(1, meta.walkthrough.findIndex((w) => w.id === api.coach.step) + 1)} of ${meta.walkthrough.length}` : phase === 'between' || phase === 'done' ? 'Done.' : `Streak: ${s.streak} / ${goal}`;
        setText(prog, txt);
        prog.classList.toggle('win', phase === 'between' || phase === 'done');
      }
      if (phase !== 'pre' && phase !== 'tutorial' && phase !== 'done') {
        const [t, m] = coachLine();
        api.coach.say(t, m);
      }
    }

    // ---------- loop ----------
    let last = performance.now();
    let raf = 0;
    function frame(t: number) {
      if (!alive) return;
      const dt = Math.min(100, t - last);
      last = t;
      if (phase === 'tutorial' || phase === 'play' || phase === 'between') {
        handle(sim.step(s, dt));
        if (phase === 'between' && s.now >= nextStageAt) startStage(s.stage + 1);
      }
      draw();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  },
};
