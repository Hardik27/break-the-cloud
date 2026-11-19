/**
 * Rate Limiter view. The request lane uses a fixed pool of chip buttons created once; each frame only moves
 * them (transform) and updates classes. Config panels are built once too.
 */
import { el, esc, onPress, setAttr, setText } from '../../lib/dom';
import { mulberry32 } from '../../lib/rng';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

type Phase = 'pre' | 'tutorial' | 'play' | 'between' | 'done';
const LABEL: Record<sim.Kind, string> = { paid: 'PAID', free: 'FREE', bot: 'BOT' };

const INFO = [
  { h: 'Tutorial: your first block', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'Be the bouncer', p: `<b>Goal:</b> block ${sim.BOTS_TO_BLOCK} bot requests before they reach the API (it takes ${sim.API_CAP} per second).<br><b>Your tools:</b> tap a red BOT request to send it a 429. Green and grey ones are real people.` },
  { h: 'Tune a token bucket', p: `<b>Step 1:</b> Ana loads a page: 6 requests at once, every 3 seconds. Pick a <b>rate</b> and a <b>burst</b> so all of them get through.<br><b>Step 2:</b> Ben, Chen and a bot (15 requests a second) join, with the same settings. People must still get through, the bot at most ${sim.BOT_MAX_PER_SEC} a second, and the API (${sim.BUCKET_CAP} a second) must never fill up.` },
  { h: 'The noisy tenant', p: '<b>Goal:</b> paying tenants never see a 429, and the API never fills up.<br><b>Your tools:</b> choose whether all tenants share one limit or each has its own, and the rate for each tier. Then press <b>Run 20 s</b>.' },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    const rng = mulberry32(api.seed);
    let task = 0;
    let phase: Phase = 'pre';
    let lane = sim.createLane(0, rng);
    const cfg2 = { rate: 1, burst: 1 };
    const cfg3 = { scope: 'global' as 'global' | 'client', paid: 20, free: 20 };
    let alive = true;
    let betweenT = 0;
    let step2: 'ana' | 'all' = 'ana';
    let busy = false;

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="rl-s1"></span><span id="rl-s2"></span>`);
    const lanePanel = el('div', { class: 'rl-panel' });
    const track = el('div', { class: 'rl-track', 'aria-label': 'Requests flying toward the API' });
    const apiBox = el('div', { class: 'rl-api', id: 'rl-api' }, `<b>API</b><span class="small" id="rl-load"></span><span class="meter"><i id="rl-meter"></i></span>`);
    const chips = Array.from({ length: sim.POOL }, (_, i) => {
      const b = el('button', { class: 'rl-chip', type: 'button', 'data-chip-slot': i, hidden: true }, '');
      onPress(b, () => clickChip(i));
      track.appendChild(b);
      return b;
    });
    track.appendChild(apiBox);
    lanePanel.append(track, el('p', { class: 'small', style: 'margin:8px 0 0' }, 'Requests travel left to right. Tap a bot (red) before it reaches the API.'));

    const cfgPanel = el('div', { class: 'rl-panel', hidden: true });
    const row = (label: string, items: readonly (number | string)[], attr: string, fmt: (v: number | string) => string, onPick: (v: string) => void) => {
      const r = el('div', { class: 'row rl-row', role: 'group', 'aria-label': label }, `<span class="small rl-lbl">${label}</span>`);
      const btns = items.map((v) => {
        const b = el('button', { class: 'chip', type: 'button', [attr]: String(v) }, fmt(v));
        b.addEventListener('click', () => onPick(String(v)));
        r.appendChild(b);
        return b;
      });
      return { r, btns };
    };
    const t2rate = row('Rate', sim.RATES, 'data-rate', (v) => `${v}/s`, (v) => setCfg(() => (cfg2.rate = Number(v))));
    const t2burst = row('Burst', sim.BURSTS, 'data-burst', (v) => `${v}`, (v) => setCfg(() => (cfg2.burst = Number(v))));
    const t3scope = row('Limit per', ['global', 'client'], 'data-scope', (v) => (v === 'global' ? 'Shared by all' : 'Each tenant'), (v) => setCfg(() => (cfg3.scope = v as 'global' | 'client')));
    const t3paid = row('Paid tier', sim.PAID_RATES, 'data-paid', (v) => `${v}/s`, (v) => setCfg(() => (cfg3.paid = Number(v))));
    const t3free = row('Free tier', sim.FREE_RATES, 'data-free', (v) => `${v}/s`, (v) => {
      if (task === 3 && phase === 'play' && cfg3.scope === 'global') return api.toast('With one shared limit there are no tiers. Switch “Limit per” to “Each tenant” first.');
      setCfg(() => (cfg3.free = Number(v)));
    });
    const runRow = el('div', { class: 'row', style: 'margin-top:12px' });
    const run = el('button', { class: 'btn go', type: 'button', id: 'rl-run' }, 'Run 20 s');
    run.addEventListener('click', runIt);
    const cfgNote = el('span', { class: 'small', id: 'rl-note' });
    runRow.append(run, cfgNote);
    const result = el('div', { class: 'rl-result', id: 'rl-result' });
    // Replay: one row per client with its bucket level and its recent requests (built once, frames update it).
    const viz = el('div', { class: 'rl-viz', id: 'rl-viz', hidden: true });
    const vizApi = el('div', { class: 'rl-vapi' }, '<span class="small">API this second</span><span class="meter"><i id="rl-vmeter"></i></span><b id="rl-vload"></b>');
    const STRIP = 16;
    const vizRows = Array.from({ length: 4 }, () => {
      const r = el('div', { class: 'rl-vrow' }, '<b class="nm"></b><span class="rl-bucket"><i></i><em></em></span><span class="rl-reqs"></span>');
      const reqs = r.querySelector('.rl-reqs')!;
      const cellsR = Array.from({ length: STRIP }, () => reqs.appendChild(el('i')));
      viz.appendChild(r);
      return { r, nm: r.querySelector<HTMLElement>('.nm')!, fill: r.querySelector<HTMLElement>('.rl-bucket i')!, tk: r.querySelector<HTMLElement>('.rl-bucket em')!, cells: cellsR };
    });
    viz.append(vizApi, el('p', { class: 'small', style: 'margin:0' }, 'Orange bar: tokens left in each bucket. Squares: latest requests (green through, red 429, dark red: API full).'));
    cfgPanel.append(t2rate.r, t2burst.r, t3scope.r, t3paid.r, t3free.r, runRow, viz, result);
    stage.append(status, lanePanel, cfgPanel);

    // ---------- render ----------
    function drawLane() {
      const w = track.clientWidth;
      const chipW = chips[0].offsetWidth || 54;
      const travel = Math.max(80, w - 86 - chipW - 12);
      const ROWS = 5;
      const rowH = (track.clientHeight - 12) / ROWS;
      const recent = lane.arrivals.filter((t) => lane.now - t < 1000).length;
      setText(stage.querySelector('#rl-load')!, `${recent}/${sim.API_CAP} per s`);
      const m = stage.querySelector<HTMLElement>('#rl-meter')!;
      m.style.width = `${Math.min(100, (100 * recent) / sim.API_CAP)}%`;
      apiBox.classList.toggle('hot', recent >= sim.API_CAP);
      chips.forEach((b, i) => {
        const c = lane.chips[i];
        if (!c) {
          if (!b.hidden) b.hidden = true;
          return;
        }
        b.hidden = false;
        const x = 6 + sim.progress(lane, c) * travel;
        b.style.transform = `translate(${x.toFixed(1)}px, ${(6 + (i % ROWS) * rowH).toFixed(1)}px)`;
        setText(b, c.state === 'blocked' ? '429' : c.state === 'failed' ? '✕' : LABEL[c.kind]);
        setAttr(b, 'class', `rl-chip ${c.kind} ${c.state}`);
        setAttr(b, 'data-kind', c.kind);
        setAttr(b, 'data-state', c.state);
        setAttr(b, 'aria-label', `${c.kind === 'bot' ? 'Bot' : c.kind === 'paid' ? 'Paying customer' : 'Free user'} request${c.state === 'flying' ? '. Activate to block it.' : ', ' + c.state}`);
      });
    }

    function render() {
      lanePanel.hidden = task > 1;
      cfgPanel.hidden = task < 2;
      const s1 = stage.querySelector('#rl-s1')!, s2 = stage.querySelector('#rl-s2')!;
      if (task <= 1) {
        s1.innerHTML = `bots blocked <b>${lane.blockedBots}${task === 1 ? `/${sim.BOTS_TO_BLOCK}` : ''}</b>`;
        s2.innerHTML = `overloads <b>${lane.overloads}</b> · real users blocked <b>${lane.blockedLegit}</b>`;
        drawLane();
      } else {
        [t2rate, t2burst].forEach((g) => (g.r.hidden = task !== 2));
        [t3scope, t3paid, t3free].forEach((g) => (g.r.hidden = task !== 3));
        t2rate.btns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.rate) === cfg2.rate)));
        t2burst.btns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.burst) === cfg2.burst)));
        t3scope.btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scope === cfg3.scope)));
        t3paid.btns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.paid) === cfg3.paid)));
        t3free.btns.forEach((b) => {
          b.setAttribute('aria-pressed', String(Number(b.dataset.free) === cfg3.free));
          b.setAttribute('aria-disabled', String(cfg3.scope === 'global'));
        });
        s1.innerHTML = task === 2 ? `${step2 === 'ana' ? 'step 1: Ana alone' : 'step 2: everyone + the bot'} · bucket <b>${cfg2.rate}/s, burst ${cfg2.burst}</b>` : `limit <b>${cfg3.scope === 'global' ? `shared ${cfg3.paid}/s` : `paid ${cfg3.paid}/s · free ${cfg3.free}/s`}</b>`;
        s2.innerHTML = `API capacity <b>${sim.BUCKET_CAP}/s</b>`;
        cfgNote.textContent = task === 3 && cfg3.scope === 'global' ? 'Shared by all: one bucket at the paid-tier rate for everyone.' : '';
      }
      const prog = api.side.querySelector('#rl-prog');
      if (prog) prog.textContent = task === 1 ? `Bots blocked: ${lane.blockedBots} / ${sim.BOTS_TO_BLOCK}` : task === 2 ? (step2 === 'ana' ? 'Step 1 of 2: get all of Ana’s requests through.' : 'Step 2 of 2: people through, bot held back, API never full.') : task === 3 ? 'Run the 20 s test when ready.' : '';
      if (phase === 'between') api.coach.say('Task clear! Read the lesson; press Next above.', 'watch');
      else if (phase === 'play') api.coach.say(...coachLine());
    }

    function coachLine(): [string, 'act' | 'watch'] {
      if (task === 1) {
        const bots = lane.chips.filter((c) => c && c.kind === 'bot' && c.state === 'flying').length;
        return bots ? [`${bots} bot request${bots > 1 ? 's' : ''} incoming. <b>Tap the red ones</b> before they reach the API.`, 'act'] : ['Watch the lane. Tap red bot requests; let green and grey ones through.', 'watch'];
      }
      if (busy) return ['Watch the buckets: tokens drip in at the <b>rate</b>, and the bucket holds at most <b>burst</b> tokens.', 'watch'];
      if (task === 2) return step2 === 'ana' ? ['Ana sends 6 requests at once. Pick a <b>rate</b> and a <b>burst</b>, then press <b>Run 20 s</b>.', 'act'] : ['The bot is here. Adjust if you need to, then press <b>Run 20 s</b>.', 'act'];
      if (task === 3) return ['Decide how the limit is shared, and how much each tier gets. Then press <b>Run 20 s</b>.', 'act'];
      return ['', 'watch'];
    }

    function renderSide() {
      const t = INFO[task];
      api.side.innerHTML = `<p class="eyebrow">${task === 0 ? 'Tutorial' : `Task ${task + 1} of ${meta.tasks.length}`}</p><h2>${t.h}</h2><p style="margin:0">${t.p}</p><div class="progress" id="rl-prog"></div>`;
    }

    // ---------- flow ----------
    function startTask(t: number) {
      task = t;
      phase = t === 0 ? 'tutorial' : 'play';
      if (t <= 1) lane = sim.createLane(t, rng);
      if (t >= 2) { result.innerHTML = ''; viz.hidden = true; step2 = 'ana'; }
      renderSide();
      render();
    }
    function taskDone() {
      api.task(task);
      if (task >= meta.tasks.length - 1) { phase = 'done'; render(); return; }
      phase = 'between';
      render();
      { const next = task + 1; api.ready(next, () => startTask(next)); }
    }
    function guard(): boolean {
      if (phase === 'pre') { api.toast('Press Start first. It is in the brief, and above the game.'); return true; }
      if (phase === 'done') { api.toast('All tasks done. Press Play again to start a new run.'); return true; }
      if (phase === 'between') { api.toast('Task done. Press Next above to go on.'); return true; }
      return false;
    }

    function clickChip(i: number) {
      if (guard()) return;
      const b = chips[i];
      if (phase === 'tutorial') {
        const want = api.coach.step === 'bot1' ? 0 : 1;
        if (i !== want) return api.toast('Tutorial: click the highlighted bot request.');
      }
      api.move();
      const r = sim.block(lane, i);
      if (!r) return api.toast('That request already finished.');
      if (r.ok) {
        api.hit('429', b);
        if (phase === 'tutorial') api.coach.did(api.coach.step!);
      } else {
        api.mistake('real user!', b);
        api.toast(`That was a ${r.kind === 'paid' ? 'paying customer' : 'free user'}, not a bot. They just got an error.`);
      }
      render();
      if (task === 1 && lane.blockedBots >= sim.BOTS_TO_BLOCK) taskDone();
    }

    function setCfg(f: () => void) {
      if (guard()) return;
      if (task < 2) return api.toast('Rate limit settings unlock in the next task.');
      f();
      render();
    }

    async function runIt() {
      if (guard()) return;
      if (task < 2) return api.toast('Rate limit settings unlock in the next task.');
      if (busy) return api.toast('Watch this run first.');
      api.move();
      const clients = task === 2 ? (step2 === 'ana' ? sim.anaTraffic() : sim.task2Traffic()) : sim.task3Traffic();
      const cfg: sim.LimitConfig = task === 2 ? { scope: 'client', rate: cfg2.rate, burst: cfg2.burst } : { scope: cfg3.scope, rate: cfg3.paid, burst: cfg3.paid, freeRate: cfg3.free };
      const tr = sim.simulateTrace(clients, cfg);
      const r = tr.result;
      busy = true;
      result.innerHTML = '';
      if (task === 2 && step2 === 'all') {
        await api.predict({
          q: `The bot sends 15 requests a second into its own bucket (refilling at ${cfg2.rate} a second). About how many get through each second?`,
          options: ['None', `About ${Math.min(cfg2.rate, 15)}: the rate`, 'All 15'],
          answer: cfg2.rate >= 15 ? 2 : 1,
          why: `Once the bot’s bucket is empty, only the tokens that drip back in can be spent: ${cfg2.rate} a second. The burst only matters for the first moment.`,
        });
      } else if (task === 3) {
        await api.predict({
          q: cfg3.scope === 'global' ? 'All three tenants share one bucket. Freebie sends 30 a second. What happens to Acme and Globex?' : 'Each tenant has its own bucket now. What happens to Acme and Globex when Freebie sends 30 a second?',
          options: ['They get through fine', 'They get 429s too'],
          answer: cfg3.scope === 'global' || !sim.task3Ok(r) ? 1 : 0,
          why: cfg3.scope === 'global' ? 'One shared bucket is drained by whoever sends the most: Freebie spends the tokens, so paying tenants get 429s.' : sim.task3Ok(r) ? 'Separate buckets isolate tenants: Freebie can only empty its own.' : 'Separate buckets help, but the total the tiers allow is above what the API can take, so the API itself fills up.',
        });
      }
      viz.hidden = false;
      const rows = clients.map((c, i) => ({ c, u: vizRows[i], b: tr.buckets.get(tr.keyOf(c))!, ev: tr.events.filter((e) => e.cid === c.id) }));
      vizRows.forEach((u, i) => (u.r.hidden = i >= clients.length));
      rows.forEach(({ c, u }) => setText(u.nm, c.name));
      const okTimes = tr.events.filter((e) => e.ok).map((e) => e.t);
      const firstFull = r.loadPerSec.findIndex((v) => v >= sim.BUCKET_CAP);
      render();
      await api.playback({
        title: task === 2 ? (step2 === 'ana' ? 'Ana’s bucket' : 'Everyone’s buckets') : 'Tenants’ buckets',
        durationMs: sim.DURATION_MS,
        realMs: 9000,
        marks: firstFull >= 0 ? [{ t: firstFull * 1000 + 500, label: 'API full', bad: true }] : [],
        frame: (t) => {
          rows.forEach(({ u, b, ev }) => {
            const v = sim.tokensAt(b, t);
            u.fill.style.width = `${(100 * v) / b.burst}%`;
            setText(u.tk, `${v.toFixed(1)} / ${b.burst}`);
            let hi = ev.length;
            while (hi > 0 && ev[hi - 1].t > t) hi--;
            const recent = ev.slice(Math.max(0, hi - u.cells.length), hi);
            u.cells.forEach((cell, k) => {
              const e = recent[k - (u.cells.length - recent.length)];
              const cls = !e ? '' : e.ok ? 'ok' : e.why === 'api' ? 'full' : 'no';
              if (cell.className !== cls) cell.className = cls;
            });
          });
          const sec = Math.floor(t / 1000) * 1000;
          const load = okTimes.filter((x) => x >= sec && x <= t).length;
          (stage.querySelector('#rl-vmeter') as HTMLElement).style.width = `${Math.min(100, (100 * load) / sim.BUCKET_CAP)}%`;
          setText(stage.querySelector('#rl-vload')!, `${load}/${sim.BUCKET_CAP}`);
          vizApi.classList.toggle('hot', load >= sim.BUCKET_CAP);
        },
      });
      busy = false;
      if (!alive) return;
      drawResult(r);
      if (task === 2 && step2 === 'ana') {
        if (sim.anaOk(r)) {
          api.hit('Ana’s pages load', run);
          step2 = 'all';
          api.toast('All of Ana’s requests got through. Now Ben, Chen and a bot join, with the same settings.');
          render();
          return;
        }
        api.mistake('Ana got 429s', run);
        api.toast(`Only ${r.legitOkPct.toFixed(0)}% of Ana’s requests got through. ${cfg2.burst < 6 ? `She sends 6 at once, but the bucket holds only ${cfg2.burst} tokens.` : `The bucket refills too slowly to be full again for her next page load.`}`);
        render();
        return;
      }
      const ok = task === 2 ? sim.task2Ok(r) : sim.task3Ok(r);
      if (ok) {
        api.hit('protected', run);
        return taskDone();
      }
      api.mistake('not yet', run);
      api.toast(failReason(r));
      render();
    }

    function failReason(r: sim.SimResult): string {
      if (task === 2) {
        if (r.legitOkPct < 99) return `Only ${r.legitOkPct.toFixed(0)}% of people’s requests got through. A page load sends 6 at once: is the burst big enough, and does the rate keep up between page loads?`;
        if (r.overloaded) return 'The API filled up. Either the bot still gets too much through, or the bucket starts too full.';
        return `The bot still gets ${r.botOkPerSec.toFixed(1)} requests a second through. Lower the rate.`;
      }
      if (cfg3.scope === 'global') return `With one shared bucket, Freebie’s batch job uses up the tokens: paying tenants got only ${r.paidOkPct.toFixed(0)}% through.`;
      if (r.paidOkPct < 99.5) return `Paying tenants got ${r.paidOkPct.toFixed(1)}% through: the API is still full. Lower the free tier.`;
      return 'The API filled up. Total allowed traffic is above its capacity: lower a tier.';
    }

    function drawResult(r: sim.SimResult) {
      const max = sim.BUCKET_CAP;
      const bars = r.loadPerSec.map((v, i) => `<span class="${v >= max ? 'full' : ''}" style="height:${(100 * v) / max}%" title="second ${i + 1}: ${v}"></span>`).join('');
      result.innerHTML = `<table class="breakdown"><tbody>${r.perClient
        .map((p) => {
          const pct = p.sent ? (100 * p.ok) / p.sent : 100;
          const good = p.kind === 'bot' ? p.ok / (sim.DURATION_MS / 1000) <= sim.BOT_MAX_PER_SEC : p.kind === 'paid' ? pct >= 99 : true;
          const note = p.kind === 'bot' ? (good ? ' · held back ✓' : ' · too many') : p.kind === 'free' ? ' · throttled, as intended' : good ? ' ✓' : ' · got 429s';
          return `<tr><td>${esc(p.name)}</td><td>${p.ok}/${p.sent} through</td><td class="${good ? 'okc' : 'badc'}">${pct.toFixed(0)}%${note}</td></tr>`;
        })
        .join('')}</tbody></table>
        <p class="eyebrow" style="margin:8px 0 4px">API load per second (top = full)</p><div class="rl-bars" id="rl-bars">${bars}</div>`;
    }

    // ---------- loop ----------
    let last = performance.now();
    let raf = 0;
    let lastPanel = 0;
    function frame(t: number) {
      if (!alive) return;
      const dt = Math.min(100, t - last);
      last = t;
      if (task <= 1 && (phase === 'play' || phase === 'tutorial' || phase === 'pre')) {
        if (phase === 'play') {
          for (const e of sim.stepLane(lane, dt)) {
            if (e.type === 'overload') {
              api.mistake('API overloaded', apiBox);
              api.toast('Too many requests reached the API at once: it is overloaded and users get errors. Block more bots!');
            }
          }
        }
        drawLane();
        if (t - lastPanel > 200) {
          lastPanel = t;
          render();
        }
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    api.onBegin(() => {
      startTask(0);
      api.coach.tutorial(meta.walkthrough, () => {
        api.task(0);
        phase = 'between';
        render();
        api.ready(1, () => startTask(1));
      });
    });

    render();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(betweenT);
    };
  },
};
