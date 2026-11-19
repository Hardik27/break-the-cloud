/** Split Brain view. Every SVG node and panel cell is created once; frames only update attributes and text. */
import { el, onActivateKey, setAttr, setText, svgEl, themeColors } from '../../lib/dom';
import { mulberry32 } from '../../lib/rng';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

type Phase = 'pre' | 'tutorial' | 'play' | 'between' | 'done';

const TERM_COLORS = ['#7B8794', '#D9480F', '#2563C9', '#1F8A5B', '#A341B8', '#B98900', '#0E8FA3', '#C2255C', '#5F7A1F', '#7048E8'];
const tc = (t: number) => TERM_COLORS[t % TERM_COLORS.length];

const TASKS = [
  { label: 'Tutorial', goal: 'Follow the highlighted steps. The clock starts after the tutorial.', hint: '' },
  { label: 'Depose', goal: 'Make the cluster elect a new leader, twice.', hint: 'Crash the leader (the server with the crown), or cut every link it has. The others stop hearing heartbeats and hold an election. Then do it again to the new leader.' },
  { label: 'Two crowns', goal: 'Make two servers believe they lead at the same time, then reconnect the old one.', hint: 'Cut all 4 links of the leader, but do not crash it: it keeps thinking it leads. When a second crown appears, restore one of its links.' },
  { label: 'Silence', goal: 'Keep the cluster without a working leader for 10 seconds. Links only.', hint: 'A server can win with just two neighbours that vote for it. Cut links until no server has two. How many of the 10 must go?' },
  { label: 'Storm', goal: `Force ${sim.STORM_COUNT} elections within 20 seconds.`, hint: 'Each time a leader disappears, the others need a few seconds to elect a new one. Crash the leader, restart it, and repeat as soon as the next crown appears.' },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    const r = new sim.Raft(mulberry32(api.seed));
    let phase: Phase = 'pre';
    let task = 0;
    let betweenUntil = 0;
    let speed = 1;
    let alive = true;
    const theme = themeColors();
    const C = theme.C;

    // ---------- build DOM once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' },
      `<span>leader <b id="sb-leader"></b></span><span>commit index <b id="sb-commit"></b></span><span>write success <b id="sb-writes"></b></span>`);
    const slow = el('button', { class: 'chip', type: 'button', id: 'sb-slow', 'aria-pressed': 'false', style: 'margin-left:auto' }, 'Slow motion');
    slow.addEventListener('click', () => {
      speed = speed === 1 ? 0.4 : 1;
      setAttr(slow, 'aria-pressed', String(speed !== 1));
      api.toast(speed === 1 ? 'Normal speed.' : 'Slow motion: messages move at 0.4× speed.');
    });
    status.appendChild(slow);
    const svg = svgEl('svg', { class: 'net', viewBox: '0 0 600 560', role: 'group', 'aria-label': 'Five Raft servers connected by ten network links' }) as SVGSVGElement;
    const reqs = el('div', { class: 'reqs', 'aria-label': 'Recent client writes: green committed, red failed, outlined pending' });
    const reqCells = Array.from({ length: 60 }, () => reqs.appendChild(el('span', { class: 'req' })));
    const foot = el('div', { class: 'stagefoot' },
      `<span class="key"><span class="dot" style="background:var(--vote)"></span>vote request</span><span class="key"><span class="dot" style="background:var(--ok)"></span>vote granted</span><span class="key"><span class="dot" style="background:var(--append)"></span>heartbeat / write</span><span class="key"><span class="dot" style="background:var(--reply)"></span>reply</span><span class="key"><span class="req ok"></span>write committed</span><span class="key"><span class="req fail"></span>write failed</span>`);
    const tape = el('div', { class: 'tape' },
      `<div class="tapehead"><p class="eyebrow" style="margin:0">Replicated logs</p><p>Solid = committed. Dashed = written but not committed, can still be thrown away. Colour = term.</p></div>`);
    const logs = el('div', { class: 'logs', id: 'sb-logs' });
    tape.appendChild(logs);
    const panes = el('div', { class: 'panes' },
      `<div><p class="eyebrow">Safety monitor</p><div class="monitor" id="sb-monitor"></div></div><div><p class="eyebrow">Event log</p><div class="feed" id="sb-feed"></div></div>`);
    stage.append(status, svg, reqs, foot, tape, panes);
    const $ = (id: string) => stage.querySelector<HTMLElement>('#' + id)!;

    // log grid: header + 5 rows × W cells, built once
    const W = 12;
    const hdr = el('div', { class: 'lrow' }, `<span class="lname"></span>`);
    const hdrCells = el('div', { class: 'cells' });
    const idxCells = Array.from({ length: W }, () => hdrCells.appendChild(el('div', { class: 'cell idx' })));
    hdr.appendChild(hdrCells);
    logs.appendChild(hdr);
    const logRows = r.nodes.map((n) => {
      const row = el('div', { class: 'lrow' });
      const name = el('span', { class: 'lname' }, `<b>${n.name}</b>`);
      const cells = el('div', { class: 'cells' });
      const cs = Array.from({ length: W }, () => cells.appendChild(el('div', { class: 'cell empty' })));
      row.append(name, cells);
      logs.appendChild(row);
      return { name, cs };
    });
    const monitor = $('sb-monitor');
    const monRows = ['One leader per term', 'Committed writes never change', 'Safety violations'].map((label) => {
      const row = el('div', { class: 'mrow' }, `<span>${label}</span>`);
      const pill = el('span', { class: 'ok-pill' });
      row.appendChild(pill);
      monitor.appendChild(row);
      return pill;
    });
    const feed = $('sb-feed');
    const feedLines = Array.from({ length: 6 }, () => feed.appendChild(el('div')));

    // SVG
    const CX = 300, CY = 292, R = 200, NR = 40;
    const pos = Array.from({ length: sim.N }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / sim.N;
      return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
    });
    const gLinks = svgEl('g', {}, svg);
    const gFx = svgEl('g', { class: 'fx' }, svg);
    const gMsgs = svgEl('g', { class: 'msgs' }, svg);
    const gNodes = svgEl('g', {}, svg);
    const linkEls: Record<string, { g: SVGElement; vis: SVGElement; x: SVGElement }> = {};
    for (const [a, b] of sim.ALL_LINKS) {
      const k = sim.linkKey(a, b);
      const g = svgEl('g', { tabindex: 0, role: 'button', 'data-link': k, 'data-cut': '0', 'aria-label': `Link between S${a + 1} and S${b + 1}`, style: 'cursor:pointer' }, gLinks);
      svgEl('line', { class: 'focusring', x1: pos[a].x, y1: pos[a].y, x2: pos[b].x, y2: pos[b].y, 'stroke-width': 10, stroke: 'var(--accent)', 'stroke-linecap': 'round' }, g);
      const vis = svgEl('line', { x1: pos[a].x, y1: pos[a].y, x2: pos[b].x, y2: pos[b].y, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, g);
      const mx = (pos[a].x + pos[b].x) / 2, my = (pos[a].y + pos[b].y) / 2;
      const x = svgEl('path', { d: `M${mx - 7},${my - 7}L${mx + 7},${my + 7}M${mx + 7},${my - 7}L${mx - 7},${my + 7}`, 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none' }, g);
      svgEl('line', { x1: pos[a].x, y1: pos[a].y, x2: pos[b].x, y2: pos[b].y, stroke: 'transparent', 'stroke-width': 24 }, g);
      g.addEventListener('click', () => clickLink(a, b));
      onActivateKey(g, () => clickLink(a, b));
      linkEls[k] = { g, vis, x };
    }
    const nodeEls = pos.map((p, i) => {
      const g = svgEl('g', { tabindex: 0, role: 'button', 'data-node': i, 'data-role': 'follower', style: 'cursor:pointer' }, gNodes);
      svgEl('circle', { class: 'focusring', cx: p.x, cy: p.y, r: NR + 13, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 3, 'stroke-dasharray': '6 5' }, g);
      const timer = svgEl('circle', { cx: p.x, cy: p.y, r: NR + 7, fill: 'none', 'stroke-width': 3, transform: `rotate(-90 ${p.x} ${p.y})` }, g);
      const body = svgEl('circle', { cx: p.x, cy: p.y, r: NR, 'stroke-width': 2 }, g);
      const crown = svgEl('path', { d: `M${p.x - 17},${p.y - NR - 14}l5,-15l7,9l5,-13l5,13l7,-9l5,15z`, 'stroke-width': 1.5 }, g);
      const name = svgEl('text', { x: p.x, y: p.y - 3, 'text-anchor': 'middle', 'font-family': 'Archivo, Arial Narrow, sans-serif', 'font-weight': 800, 'font-size': 22 }, g);
      name.textContent = 'S' + (i + 1);
      const term = svgEl('text', { x: p.x, y: p.y + 16, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono, monospace', 'font-size': 11 }, g);
      const xm = svgEl('path', { d: `M${p.x - 22},${p.y - 22}L${p.x + 22},${p.y + 22}M${p.x + 22},${p.y - 22}L${p.x - 22},${p.y + 22}`, 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none' }, g);
      g.addEventListener('click', () => clickNode(i));
      onActivateKey(g, () => clickNode(i));
      return { g, timer, body, crown, name, term, xm };
    });
    const msgPool: SVGElement[] = [];
    const fxPool: SVGElement[] = [];

    // ---------- side card ----------
    let showHint = false;
    function renderSide() {
      const t = TASKS[task];
      api.side.innerHTML = `<p class="eyebrow">${task === 0 ? 'Tutorial' : `Task ${task + 1} of ${meta.tasks.length}`}</p><h2>${t.label}</h2><p style="margin:0">${t.goal}</p><div class="progress" id="sb-prog"></div>
        <p class="lesson" id="sb-hint" hidden>${t.hint}</p>
        <div class="row" style="margin-top:10px">${t.hint ? '<button class="btn ghost" type="button" id="sb-hintbtn">Hint</button>' : ''}<button class="btn ghost" type="button" id="sb-heal">Heal all</button></div>`;
      showHint = false;
      api.side.querySelector('#sb-hintbtn')?.addEventListener('click', () => {
        showHint = !showHint;
        (api.side.querySelector('#sb-hint') as HTMLElement).hidden = !showHint;
        (api.side.querySelector('#sb-hintbtn') as HTMLElement).textContent = showHint ? 'Hide hint' : 'Hint';
      });
      api.side.querySelector('#sb-heal')!.addEventListener('click', () => {
        if (phase === 'tutorial') return api.toast('Finish the tutorial first, or press Skip tutorial.');
        if (phase === 'between') return api.toast('The next task starts in a moment with a fresh cluster.');
        r.healAll();
        api.move();
        api.toast('All links restored and all servers restarted.');
      });
    }

    // ---------- flow ----------
    api.onBegin(() => {
      phase = 'tutorial';
      task = 0;
      renderSide();
      api.coach.tutorial(meta.walkthrough, () => {
        api.task(0);
        phase = 'between';
        betweenUntil = performance.now() + 1500;
      });
    });

    function enterTask(t: number) {
      task = t;
      r.reset();
      phase = 'play';
      renderSide();
    }

    function blocked(): boolean {
      if (phase === 'pre') {
        api.toast('Press Start first. It is in the brief, and above the game.');
        return true;
      }
      if (phase === 'between') {
        api.toast('Task done. The next task starts in a moment with a fresh cluster.');
        return true;
      }
      return false;
    }

    function clickLink(a: number, b: number) {
      if (blocked()) return;
      const k = sim.linkKey(a, b);
      if (phase === 'tutorial') {
        const st = api.coach.step;
        if ((st !== 'cut' && st !== 'restore') || k !== '2-3') return api.toast(st === 'crash' || st === 'restart' ? 'Tutorial: click server S4 (highlighted).' : 'Tutorial: click the highlighted link between S3 and S4.');
      }
      const nowCut = r.toggleLink(a, b);
      api.move();
      if (phase === 'tutorial') {
        if (api.coach.step === 'cut' && nowCut) api.coach.did('cut');
        else if (api.coach.step === 'restore' && !nowCut) api.coach.did('restore');
      } else api.toast(`Link S${a + 1}–S${b + 1} ${nowCut ? 'cut' : 'restored'}.`);
    }

    function clickNode(i: number) {
      if (blocked()) return;
      if (phase === 'tutorial') {
        const st = api.coach.step;
        if ((st !== 'crash' && st !== 'restart') || i !== 3) return api.toast(st === 'cut' || st === 'restore' ? 'Tutorial: click the highlighted link between S3 and S4.' : 'Tutorial: click server S4 (highlighted).');
      }
      if (phase === 'play' && task === 3) return api.toast('Links only in this task. Cut links instead of crashing servers.');
      const up = r.toggleNode(i);
      api.move();
      if (phase === 'tutorial') {
        if (api.coach.step === 'crash' && !up) api.coach.did('crash');
        else if (api.coach.step === 'restart' && up) api.coach.did('restart');
      } else api.toast(`S${i + 1} ${up ? 'restarted' : 'crashed'}.`);
    }

    // ---------- coach ----------
    function coachLine(): [string, 'act' | 'watch'] {
      if (phase === 'between') return ['Task done. Read the lesson; the next task starts in a moment with a fresh cluster.', 'watch'];
      const L = r.leaders()[0];
      const down = r.nodes.find((n) => !n.alive);
      if (task === 1) {
        if (!L) return ['Watch: the others time out and elect a new leader.', 'watch'];
        return [`Crash the leader, <b>${L.name}</b> (the server with the crown).`, 'act'];
      }
      if (task === 2) {
        if (r.staleLeader !== null) {
          const st = r.nodes[r.staleLeader];
          if (!st.alive) return [`Restart <b>${st.name}</b> (click it) so it can rejoin.`, 'act'];
          return [`Two crowns! ${st.name} is stranded in term ${st.term}. Restore one of its links so it hears the new leader.`, 'act'];
        }
        if (down) return [`A crashed server cannot think it leads. Click <b>${down.name}</b> to restart it, then cut the leader’s links instead.`, 'act'];
        if (!L) return ['Watch: the cluster is electing a leader.', 'watch'];
        const open = sim.ALL_LINKS.filter(([a, b]) => (a === L.id || b === L.id) && r.linked(a, b)).length;
        if (open > 0) return [`Cut every link of the leader, <b>${L.name}</b> (${open} left). Do not crash it.`, 'act'];
        return [`${L.name} is cut off. Watch the other four elect a second leader.`, 'watch'];
      }
      if (task === 3) {
        if (!r.workingLeader() && r.quiet > 0) return [`Hold it: no leader can reach a majority. ${(r.quiet / 1000).toFixed(1)} of 10 s.`, 'watch'];
        return [`Cut links until no server is linked to two others (${r.cut.size} of 10 cut).`, 'act'];
      }
      if (task === 4) {
        const n = r.electionsWithin(sim.STORM_WINDOW);
        if (down) return [`Restart <b>${down.name}</b> (click it), then go after the next leader. ${n} of ${sim.STORM_COUNT} elections.`, 'act'];
        if (!L) return [`Watch the election. ${n} of ${sim.STORM_COUNT} elections in the last 20 s.`, 'watch'];
        return [`Knock out the leader, <b>${L.name}</b>. ${n} of ${sim.STORM_COUNT} elections in the last 20 s.`, 'act'];
      }
      return ['', 'watch'];
    }

    function progressText(): string {
      if (phase === 'tutorial') return `Tutorial step ${Math.max(1, meta.walkthrough.findIndex((w) => w.id === api.coach.step) + 1)} of ${meta.walkthrough.length}`;
      if (phase === 'between' || phase === 'done') return 'Done.';
      if (task === 1) return `New leaders elected: ${Math.min(r.elections.length, sim.DEPOSE_COUNT)} / ${sim.DEPOSE_COUNT}`;
      if (task === 2) return r.staleLeader === null ? `Leaders right now: ${r.leaders().length} / 2` : 'Two crowns seen. Now reconnect the stranded one.';
      if (task === 3) return `No working leader for ${(r.quiet / 1000).toFixed(1)} / 10 s`;
      if (task === 4) return `${r.electionsWithin(sim.STORM_WINDOW)} / ${sim.STORM_COUNT} elections in the last 20 s`;
      return '';
    }

    // ---------- drawing ----------
    const msgColor = (m: sim.Msg) => (m.type === 'RV' ? C.vote : m.type === 'RVR' ? (m.p.grant ? C.ok : C.reply) : m.type === 'AE' ? C.append : C.reply);
    const edgePt = (a: number, b: number, t: number) => {
      const A = pos[a], B = pos[b];
      const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy);
      const s = (NR + 2) / L;
      const u = s + (1 - 2 * s) * t;
      return { x: A.x + dx * u, y: A.y + dy * u };
    };

    function render() {
      for (const k in linkEls) {
        const c = r.cut.has(k);
        const e = linkEls[k];
        setAttr(e.vis, 'stroke', c ? C.bad : C.line);
        setAttr(e.vis, 'stroke-dasharray', c ? '4 7' : 'none');
        setAttr(e.vis, 'opacity', c ? 0.75 : 1);
        setAttr(e.x, 'stroke', C.bad);
        setAttr(e.x, 'opacity', c ? 1 : 0);
        setAttr(e.g, 'data-cut', c ? '1' : '0');
        const [a, b] = k.split('-').map(Number);
        setAttr(e.g, 'aria-label', `Link between S${a + 1} and S${b + 1}, ${c ? 'cut' : 'up'}. Activate to ${c ? 'restore' : 'cut'}.`);
      }
      r.nodes.forEach((n, i) => {
        const e = nodeEls[i];
        const lead = n.alive && n.role === 'leader', cand = n.alive && n.role === 'candidate';
        setAttr(e.g, 'data-role', n.alive ? n.role : 'down');
        setAttr(e.body, 'fill', n.alive ? (lead ? C.ink : C.panel) : C.bg);
        setAttr(e.body, 'stroke', n.alive ? (cand ? C.vote : C.ink) : C.line);
        setAttr(e.body, 'stroke-dasharray', n.alive ? 'none' : '5 5');
        setAttr(e.name, 'fill', n.alive ? (lead ? C.bg : C.ink) : C.muted);
        setText(e.term, n.alive ? `term ${n.term}` : 'down');
        setAttr(e.term, 'fill', n.alive ? (lead ? C.bg : C.muted) : C.muted);
        setAttr(e.crown, 'fill', C.accent);
        setAttr(e.crown, 'stroke', C.accent);
        setAttr(e.crown, 'opacity', lead ? 1 : 0);
        setAttr(e.xm, 'stroke', C.muted);
        setAttr(e.xm, 'opacity', n.alive ? 0 : 0.6);
        const circ = 2 * Math.PI * (NR + 7);
        let frac = 0, col = C.line;
        if (n.alive && !lead) {
          frac = Math.max(0, Math.min(1, (n.deadline - r.now) / sim.CFG.etMax));
          col = cand ? C.vote : C.muted;
        }
        if (lead) { frac = 1; col = C.accent; }
        setAttr(e.timer, 'stroke', col);
        setAttr(e.timer, 'stroke-dasharray', `${(circ * frac).toFixed(1)} ${circ.toFixed(1)}`);
        setAttr(e.timer, 'opacity', n.alive ? 0.8 : 0);
        setAttr(e.g, 'aria-label', `Server ${n.name}, ${n.alive ? `${n.role} in term ${n.term}` : 'crashed'}. Activate to ${n.alive ? 'crash' : 'restart'}.`);
      });
      while (msgPool.length < r.msgs.length) msgPool.push(svgEl('circle', { r: 5.5 }, gMsgs));
      msgPool.forEach((c, i) => {
        const m = r.msgs[i];
        if (!m) return setAttr(c, 'opacity', 0);
        const t = (r.now - m.t0) / (m.t1 - m.t0);
        if (r.cut.has(sim.linkKey(m.from, m.to)) && t > 0.5) return setAttr(c, 'opacity', 0);
        const p = edgePt(m.from, m.to, Math.max(0, Math.min(1, t)));
        c.setAttribute('cx', p.x.toFixed(1));
        c.setAttribute('cy', p.y.toFixed(1));
        setAttr(c, 'fill', msgColor(m));
        setAttr(c, 'opacity', 1);
      });
      const fx = r.drops.filter((f) => r.now - f.t < 600 && f.t <= r.now);
      while (fxPool.length < fx.length) fxPool.push(svgEl('circle', { fill: 'none', 'stroke-width': 2 }, gFx));
      fxPool.forEach((c, i) => {
        const f = fx[i];
        if (!f) return setAttr(c, 'opacity', 0);
        const k = (r.now - f.t) / 600;
        const p = r.cut.has(sim.linkKey(f.from, f.to)) ? edgePt(f.from, f.to, 0.5) : edgePt(f.from, f.to, 1);
        c.setAttribute('cx', p.x.toFixed(1));
        c.setAttribute('cy', p.y.toFixed(1));
        c.setAttribute('r', (4 + 12 * k).toFixed(1));
        setAttr(c, 'stroke', C.bad);
        c.setAttribute('opacity', (1 - k).toFixed(2));
      });
    }

    function renderPanels() {
      const wl = r.workingLeader(), ls = r.leaders();
      const fin = r.requests.filter((q) => q.st !== 'pend');
      const ok = fin.filter((q) => q.st === 'ok').length;
      setText($('sb-leader'), wl ? `${wl.name} (term ${wl.term})` : ls.length ? 'stranded' : 'none');
      setText($('sb-commit'), String(r.maxCommitted()));
      setText($('sb-writes'), `${fin.length ? Math.round((100 * ok) / fin.length) : 100}%`);
      const recent = r.requests.slice(-60);
      reqCells.forEach((c, i) => {
        const q = recent[i];
        const cls = q ? `req ${q.st}` : 'req';
        if (c.className !== cls) c.className = cls;
      });
      const v = r.violations;
      const two = v.some((x) => x.startsWith('Two leaders'));
      const lost = v.some((x) => !x.startsWith('Two leaders'));
      const pill = (e: HTMLElement, bad: boolean, txt: string) => {
        e.className = bad ? 'bad-pill' : 'ok-pill';
        setText(e, txt);
      };
      pill(monRows[0], two, two ? 'BROKEN' : 'holds');
      pill(monRows[1], lost, lost ? 'BROKEN' : 'holds');
      pill(monRows[2], v.length > 0, String(v.length));
      feedLines.forEach((d, i) => setText(d, r.feed[i] ?? ''));
      // logs
      const maxLen = Math.max(1, ...r.nodes.map((n) => n.log.length));
      const from = Math.max(1, maxLen - W + 1);
      idxCells.forEach((c, j) => setText(c, from + j <= maxLen ? String(from + j) : ''));
      r.nodes.forEach((n, ni) => {
        const row = logRows[ni];
        const nm = `<b>${n.name}</b>${n.alive ? (n.role === 'leader' ? ' ♦' : '') : ' ✕'}`;
        if (row.name.innerHTML !== nm) row.name.innerHTML = nm;
        row.cs.forEach((c, j) => {
          const i = from + j;
          const e = n.log[i - 1];
          let key: string, cls: string;
          if (!e) {
            key = 'empty';
            cls = 'cell empty';
          } else {
            const unc = !(r.committed[i] && r.committed[i].uid === e.uid);
            key = `${e.uid}|${unc}`;
            cls = unc ? 'cell unc' : 'cell';
          }
          if (c.dataset.k === key) return;
          c.dataset.k = key;
          c.className = cls;
          if (!e) {
            c.innerHTML = '';
            c.removeAttribute('style');
            c.removeAttribute('title');
          } else {
            const col = tc(e.term);
            c.setAttribute('style', `--c:${col};background:${col}`);
            c.title = `index ${i}, term ${e.term}, ${cls === 'cell unc' ? 'not committed' : 'committed'}`;
            c.innerHTML = `${e.cmd === 'noop' ? '·' : e.cmd}<i>t${e.term}</i>`;
          }
        });
      });
      const prog = api.side.querySelector<HTMLElement>('#sb-prog');
      if (prog) {
        setText(prog, progressText());
        prog.classList.toggle('win', phase === 'between' || phase === 'done');
      }
      if (phase === 'play' || phase === 'between') {
        const [t, m] = coachLine();
        api.coach.say(t, m);
      }
    }

    // ---------- loop ----------
    let last = performance.now();
    let lastPanel = 0;
    let raf = 0;
    function frame(t: number) {
      if (!alive) return;
      const d = Math.min(80, t - last);
      last = t;
      r.step(d * speed);
      if (phase === 'play' && sim.TASK_CHECKS[task](r)) {
        api.task(task);
        api.toast(`Done: ${TASKS[task].label}`);
        if (task >= TASKS.length - 1) {
          phase = 'done';
          api.side.innerHTML = `<p class="eyebrow">Free play</p><h2>Break anything</h2><p style="margin:0">All tasks are done. The cluster is yours: cut, crash and heal as you like, and watch the safety monitor. It should never show a violation.</p>`;
        } else {
          phase = 'between';
          betweenUntil = t + 2500;
        }
      }
      if (phase === 'between' && t >= betweenUntil) enterTask(task + 1);
      render();
      if (t - lastPanel > 120) {
        lastPanel = t;
        renderPanels();
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    renderPanels();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      theme.dispose();
    };
  },
};
