/** Traffic Cop view: builds every interactive node once, then only updates attributes and text each frame. */
import { el, onPress, setAttr, setText } from '../../lib/dom';
import { mulberry32 } from '../../lib/rng';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

type Phase = 'pre' | 'tutorial' | 'play' | 'between' | 'done';

const TASK_INFO = [
  { h: 'Tutorial: route by hand', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'Rush hour', p: 'Click a server for each request before it times out (3 s). Get <b>8 in a row</b> with no drops. Heavy (orange) requests need 3 free units.' },
  { h: 'Be the health check', p: 'Traffic triples. Put the balancer on <b>round robin</b> autopilot. When a server crashes, click it to <b>pull it out of rotation</b>; when it comes back, click it again to return it. Then hold <b>15 in a row</b>.' },
  { h: 'Heavy hitters', p: 'Round robin routes light requests instantly, but it pauses on each heavy one and shows where it will send it. Beat it: click a server with <b>3 free units</b> before the bar runs out. Serve <b>5 heavy requests in a row</b>.' },
  { h: 'Boss wave', p: 'Full traffic, and you choose the algorithm. Something will break. Hold <b>15 in a row</b> after it does.' },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    const s = sim.create(mulberry32(api.seed));
    let phase: Phase = 'pre';
    let nextStageAt = 0;
    let alive = true;
    let lastToast = 0;
    const toastSoon = (msg: string) => {
      if (performance.now() - lastToast > 900) {
        lastToast = performance.now();
        api.toast(msg);
      }
    };

    // ---------- build DOM once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span>strategy <b id="tc-strategy"></b></span><span>goal <b id="tc-streak"></b></span><span>served <b id="tc-served"></b></span><span>drops <b id="tc-drops"></b></span>`);
    const lbstage = el('div', { class: 'lbstage' });
    const queueCol = el('div', { class: 'queue' });
    const rq = el('div', { class: 'reqbox', id: 'tc-rq', 'data-k': '', 'data-size': '0', 'aria-label': 'Request box' });
    const pkt = el('span', { class: 'pkt', hidden: true });
    rq.appendChild(pkt);
    const hold = el('div', { class: 'holdbar', hidden: true, 'aria-hidden': 'true' }, '<i></i>');
    const holdFill = hold.querySelector('i')!;
    const rqTxt = el('span', { id: 'tc-rqtxt' });
    queueCol.append(rq, hold, rqTxt);
    const serversBox = el('div', { class: 'servers' });
    const srvEls = s.servers.map((srv, i) => {
      const b = el('button', { class: 'srv', type: 'button', 'data-srv': i }, `<span class="nm">${srv.name}<span class="tag-next"></span></span><span class="bar"><i></i></span><span class="st"></span>`);
      onPress(b, () => clickServer(i));
      serversBox.appendChild(b);
      return { b, bar: b.querySelector('i')!, st: b.querySelector<HTMLElement>('.st')!, next: b.querySelector<HTMLElement>('.tag-next')! };
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
    ctl.append(stratGrp);
    const strip = el('div', { class: 'strip', 'aria-label': 'Recent requests: green served, red dropped' });
    const stripCells = Array.from({ length: 60 }, () => strip.appendChild(el('span')));
    const flyers = Array.from({ length: 8 }, () => el('span', { class: 'flyer', 'aria-hidden': 'true', style: 'opacity:0' }));
    stage.append(status, lbstage, ctl, strip, ...flyers);
    const $ = (id: string) => stage.querySelector<HTMLElement>('#' + id)!;
    let flyI = 0;

    /** Animate a request flying from the request box to server i (cheap: Web Animations on a pooled node). */
    function fly(i: number, heavy: boolean, ok: boolean) {
      const f = flyers[flyI++ % flyers.length];
      const base = stage.getBoundingClientRect();
      const a = rq.getBoundingClientRect();
      const b = srvEls[i].b.getBoundingClientRect();
      f.className = `flyer${heavy ? ' heavy' : ''}`;
      if (!ok) f.style.background = 'var(--bad)';
      else f.style.removeProperty('background');
      const x0 = a.left + a.width / 2 - base.left, y0 = a.top + a.height / 2 - base.top;
      const x1 = b.left + 40 - base.left, y1 = b.top + b.height / 2 - base.top;
      try {
        f.animate(
          [
            { transform: `translate(${x0}px,${y0}px)`, opacity: 1 },
            { transform: `translate(${x1}px,${y1}px)`, opacity: ok ? 0.2 : 1 },
            { transform: `translate(${x1}px,${y1 + (ok ? 0 : 18)}px)`, opacity: 0 },
          ],
          { duration: 320, easing: 'ease-in' },
        );
      } catch {
        /* animations are a nicety */
      }
      if (!ok) {
        const sb = srvEls[i].b;
        sb.classList.remove('drop');
        void sb.offsetWidth;
        sb.classList.add('drop');
      }
    }

    // ---------- side card (rebuilt only when a task starts) ----------
    let prog: HTMLElement | null = null;
    function renderSide() {
      const i = Math.min(s.stage, TASK_INFO.length - 1);
      const t = TASK_INFO[i];
      api.side.innerHTML = `<p class="eyebrow">${i === 0 ? 'Tutorial' : `Task ${i + 1} of ${meta.tasks.length}`}</p><h2>${t.h}</h2><p style="margin:0">${t.p}</p><div class="progress" id="tc-prog"></div>`;
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
      phase = 'play';
      renderSide();
    }

    const TUTORIAL_SERVER: Record<string, number> = { 'route-1': 0, 'route-2': 1, 'route-heavy': 2 };
    const autopilot = () => s.strategy !== 'manual';

    function clickServer(i: number) {
      const srv = s.servers[i];
      const b = srvEls[i].b;
      if (phase === 'pre') return api.toast('Press Start first. It is in the brief, and above the game.');
      if (phase === 'done') return api.toast('All tasks done. Press Play again to start a new run.');
      if (phase === 'between') return api.toast('Task done. The next task starts in a moment.');
      if (phase === 'tutorial') {
        const want = TUTORIAL_SERVER[api.coach.step ?? ''];
        if (want !== i) return api.toast(`Tutorial: click ${s.servers[want ?? 0].name}, the highlighted server.`);
      }
      // Heavy hitters: override round robin on a held heavy request.
      if (s.stage === 3 && phase === 'play') {
        if (!s.queue?.heavy) return api.toast('Round robin handles light requests. Wait for a heavy (orange) one, then click a server with 3 free units.');
        api.move();
        handle(sim.route(s, i, true));
        return;
      }
      // Autopilot: clicking a server pulls it out of rotation or returns it.
      if (autopilot() && phase === 'play') {
        api.move();
        const r = sim.toggleRotation(s, i);
        if (r === 'pulled-dead') {
          api.hit('pulled', b);
          api.toast(`${srv.name} pulled out of rotation. No more traffic to a dead server.`);
        } else if (r === 'returned') {
          api.hit('back online', b);
          api.toast(`${srv.name} is back in rotation. Full capacity again.`);
        } else if (r === 'returned-dead') {
          api.mistake('still down', b);
          api.toast(`${srv.name} is still down! It will eat requests. Click it again to pull it.`);
        } else {
          api.toast(`${srv.name} is healthy: pulling it only removes capacity. Click again to return it.`);
        }
        return;
      }
      if (s.stage === 2 && phase === 'play') return api.toast('Switch on Round robin first (the strategy row below the servers).');
      if (!s.queue) return api.toast('No request is waiting. Wait for a dot to appear in the request box.');
      api.move();
      handle(sim.route(s, i, true));
      if (phase === 'tutorial') {
        api.coach.did(api.coach.step!);
        if (api.coach.step === 'route-2') sim.inject(s, false);
        else if (api.coach.step === 'route-heavy') sim.inject(s, true);
      }
    }

    function lockReason(k: sim.Strategy): string | null {
      if (phase === 'pre') return 'Press Start first.';
      if (phase === 'tutorial') return 'Finish the tutorial first: click the highlighted server (or Skip tutorial).';
      if (phase === 'done') return 'All tasks done. Press Play again to start a new run.';
      if (phase === 'between') return 'The next task starts in a moment.';
      if (s.stage === 1 && k !== 'manual') return 'Rush hour is by hand. Algorithms unlock in the next task.';
      if (s.stage === 2 && k === 'least') return 'Least loaded unlocks in the boss wave. Use round robin here.';
      if (s.stage === 3) return 'This task keeps round robin on. Beat it by clicking a server when a heavy request waits.';
      if (s.stage >= 2 && k === 'manual') return 'Traffic is too fast for hands now. Pick an algorithm.';
      return null;
    }

    function clickStrategy(k: sim.Strategy) {
      const why = lockReason(k);
      if (why) return api.toast(why);
      if (s.strategy === k) return api.toast(`Already routing with ${sim.STRATEGY_NAMES[k]}.`);
      sim.setStrategy(s, k);
      api.move();
      api.toast(`Autopilot: ${sim.STRATEGY_NAMES[k]}. Streak reset.`);
    }

    function handle(events: sim.SimEvent[]) {
      for (const e of events) {
        if (e.type === 'served') {
          fly(e.server, e.heavy, true);
          if (e.manual) api.hit(phase === 'tutorial' ? 'Nice!' : e.heavy ? 'heavy' : undefined, srvEls[e.server].b);
        } else if (e.type === 'drop') {
          if (e.server !== null) fly(e.server, e.heavy, false);
          if (phase === 'play') {
            api.mistake(e.heavy ? 'heavy dropped' : 'dropped', e.server !== null ? srvEls[e.server].b : rq);
            toastSoon(`Dropped: ${e.why}.`);
          }
        } else if (e.type === 'crash') {
          api.toast(`${s.servers[e.server].name} just crashed!`);
        } else if (e.type === 'recover') {
          const srv = s.servers[e.server];
          api.toast(srv.inRotation ? `${srv.name} recovered.` : `${srv.name} recovered. Click it to return it to rotation!`);
        } else if (e.type === 'goal') {
          api.task(e.stage);
          if (e.stage >= sim.LAST_STAGE) phase = 'done';
          else {
            phase = 'between';
            nextStageAt = s.now + 2600;
          }
        }
      }
    }

    // ---------- coach ----------
    function coachLine(): [string, 'act' | 'watch'] {
      if (phase === 'between') return ['Task clear! Read the lesson; the next task starts in a moment.', 'watch'];
      const q = s.queue;
      const deadIn = s.servers.find((x) => !x.up && x.inRotation);
      const backOut = s.servers.find((x) => x.up && !x.inRotation);
      const goal = sim.STAGES[s.stage].goal;
      if (s.stage === 1) {
        return q
          ? [`A ${q.heavy ? 'heavy request (needs 3 free units)' : 'request'} is waiting. <b>Click a server</b> with room.`, 'act']
          : [`Watch the request box. ${s.streak} of ${goal} in a row.`, 'watch'];
      }
      if (s.stage === 2) {
        if (s.strategy === 'manual') return ['Traffic is about to triple. Switch on <b>Round robin</b> autopilot below the servers.', 'act'];
        if (deadIn) return [`<b>${deadIn.name} is down</b> but still in rotation, so it eats every third request. Click it to pull it out!`, 'act'];
        if (backOut) return [`${backOut.name} is back up. Click it to <b>return it to rotation</b>.`, 'act'];
        if (!sim.crashesOver(s)) return ['Autopilot is routing. Keep an eye out: servers will crash.', 'watch'];
        return [`All servers healthy. Hold it: ${s.streak} of ${goal} in a row.`, 'watch'];
      }
      if (s.stage === 3) {
        if (q?.heavy) {
          const t = s.servers[sim.peek(s)];
          const fits = sim.free(t) >= sim.HEAVY;
          return [`Heavy request! Round robin will send it to <b>${t.name}</b>${fits ? '' : ' (no room!)'}. Click a server with 3 free units.`, 'act'];
        }
        return [`Round robin is routing the light ones. Wait for a heavy (orange) request. ${s.heavyStreak} of ${goal} heavy served.`, 'watch'];
      }
      if (s.stage === 4) {
        if (s.strategy === 'rr') return ['Boss wave! Round robin ignores load. Pick the algorithm that checks how busy each server is.', 'act'];
        if (deadIn) return [`${deadIn.name} died, and least loaded thinks it is the emptiest server! <b>Click it</b> to pull it out.`, 'act'];
        if (backOut) return [`${backOut.name} is back up. Click it to <b>return it to rotation</b>.`, 'act'];
        if (!sim.crashesOver(s)) return ['Least loaded is holding. Stay sharp: something always breaks in a boss wave.', 'watch'];
        return [`Hold on: ${s.streak} of ${goal} in a row.`, 'watch'];
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
      const manualWaiting = !!q && (phase === 'play' || phase === 'tutorial') && (s.strategy === 'manual' || (s.stage === 3 && q.heavy));
      rq.classList.toggle('waiting', manualWaiting);
      const hl = sim.holdLeft(s);
      hold.hidden = !(hl > 0 && phase === 'play');
      if (hl > 0) holdFill.style.width = `${(100 * hl) / sim.STAGES[s.stage].holdHeavyMs}%`;
      setText(rqTxt, q ? (q.heavy ? 'heavy · 3 units' : 'request · 1 unit') : phase === 'pre' ? 'press Start' : 'next request…');
      const target = s.stage === 3 && q?.heavy && phase === 'play' ? sim.peek(s) : -1;
      const onAuto = autopilot() && phase === 'play';
      s.servers.forEach((srv, i) => {
        const e = srvEls[i];
        const l = sim.load(srv);
        const pct = srv.up ? Math.min(100, (l / sim.CAP) * 100) : 0;
        e.b.classList.toggle('down', !srv.up);
        e.b.classList.toggle('out', srv.up && !srv.inRotation);
        e.b.classList.toggle('alarm', onAuto && !srv.up && srv.inRotation);
        e.b.classList.toggle('pickable', manualWaiting && srv.up && sim.free(srv) >= q!.size);
        setAttr(e.b, 'data-load', l);
        setAttr(e.b, 'data-up', srv.up ? '1' : '0');
        setAttr(e.b, 'data-rot', srv.inRotation ? '1' : '0');
        const state = !srv.up ? (srv.inRotation ? 'down but still in rotation' : 'down, out of rotation') : !srv.inRotation ? 'out of rotation' : `${l} of ${sim.CAP} units busy`;
        setAttr(e.b, 'aria-label', `${srv.name}, ${state}. ${onAuto && s.stage !== 3 ? 'Activate to pull it out of rotation or return it.' : 'Activate to send the waiting request here.'}`);
        const w = pct + '%';
        if (e.bar.style.width !== w) e.bar.style.width = w;
        const cls = pct >= 100 ? 'full' : pct >= 75 ? 'hot' : '';
        if (e.bar.className !== cls) e.bar.className = cls;
        setText(e.st, !srv.up ? (srv.inRotation ? 'DOWN!' : 'down') : !srv.inRotation ? 'OUT' : `${l}/${sim.CAP}`);
        setText(e.next, i === target ? ' ← round robin' : '');
      });
      for (const c of chips) {
        setAttr(c.b, 'aria-pressed', String(s.strategy === c.k));
        setAttr(c.b, 'aria-disabled', String(!!lockReason(c.k) && phase === 'play'));
      }
      const goal = sim.STAGES[s.stage].goal;
      setText($('tc-strategy'), sim.STRATEGY_NAMES[s.strategy]);
      setText($('tc-streak'), s.stage === 0 ? '–' : sim.STAGES[s.stage].goalKind === 'heavy' ? `${s.heavyStreak}/${goal} heavy` : `${s.streak}/${goal} in a row`);
      const recent = s.results.slice(-60);
      const ok = recent.filter(Boolean).length;
      setText($('tc-served'), recent.length ? `${Math.round((100 * ok) / recent.length)}%` : '–');
      setText($('tc-drops'), String(s.drops));
      stripCells.forEach((c, i) => {
        const r = recent[i];
        const cls = r === undefined ? '' : r ? 'ok' : 'x';
        if (c.className !== cls) c.className = cls;
      });
      if (prog) {
        const txt =
          phase === 'tutorial'
            ? `Tutorial step ${Math.max(1, meta.walkthrough.findIndex((w) => w.id === api.coach.step) + 1)} of ${meta.walkthrough.length}`
            : phase === 'between' || phase === 'done'
              ? 'Cleared!'
              : sim.STAGES[s.stage].goalKind === 'heavy'
                ? `Heavy served in a row: ${s.heavyStreak} / ${goal}`
                : `In a row: ${s.streak} / ${goal}${sim.crashesOver(s) ? '' : ' (counts after the crash)'}`;
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
