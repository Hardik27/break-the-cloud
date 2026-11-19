/**
 * Latency Budget view. The map is a picture (not interactive); controls are large buttons below it,
 * built once, so they work well on phones. Nothing animates per frame.
 */
import { el, onPress, setAttr, setText, svgEl } from '../../lib/dom';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

type Phase = 'pre' | 'tutorial' | 'play' | 'between' | 'done';

const INFO = [
  { h: 'Tutorial: distance is time', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'One server for the world', p: `You can afford one server. Move it (click a data center) until at least <b>${sim.ONE_SERVER_GOAL_PEOPLE} of ${sim.TOTAL_PEOPLE}</b> people load the page in under <b>${sim.ONE_SERVER_GOAL_MS} ms</b>. The number next to each city is how many people (in millions) live there.` },
  { h: 'CDN edges', p: `The origin stays in Virginia. Add CDN edges (click a data center) so static pages load in under <b>${sim.EDGE_GOAL_MS} ms</b> in every city. Budget: <b>${sim.EDGE_BUDGET} edges</b>. Click an edge again to remove it.` },
  { h: 'What can an edge keep?', p: 'Edges are fast, but they can only answer with a stored copy. For each request, decide: can an edge serve it, or must it go to the origin?' },
];

// Map: equirectangular, lon -180..180 → x 0..720, lat 70..-50 → y 0..360.
const X = (lon: number) => (lon + 180) * 2;
const Y = (lat: number) => (70 - lat) * 3;
const LAND: [number, number][][] = [
  [[-165, 65], [-140, 70], [-95, 70], [-65, 60], [-55, 50], [-75, 35], [-80, 25], [-97, 18], [-105, 20], [-118, 32], [-125, 48], [-140, 58]],
  [[-97, 18], [-83, 9], [-77, 8], [-81, -5], [-75, -15], [-71, -30], [-74, -45], [-68, -50], [-58, -38], [-48, -28], [-40, -22], [-35, -8], [-50, 0], [-60, 10], [-75, 11], [-83, 15]],
  [[-10, 36], [-9, 44], [-2, 48], [-6, 58], [5, 62], [15, 70], [30, 70], [40, 65], [40, 45], [28, 41], [20, 40], [12, 44], [3, 42]],
  [[-17, 15], [-17, 22], [-10, 30], [-5, 36], [10, 37], [32, 31], [35, 28], [43, 12], [51, 12], [40, -5], [40, -15], [33, -27], [20, -35], [17, -28], [12, -15], [9, 0], [5, 5], [-8, 4], [-15, 10]],
  [[40, 45], [40, 65], [70, 70], [110, 70], [140, 68], [170, 65], [160, 55], [142, 48], [140, 36], [128, 34], [122, 30], [120, 22], [110, 18], [108, 10], [103, 1], [100, 13], [95, 16], [90, 22], [80, 15], [77, 8], [72, 20], [66, 25], [57, 25], [52, 30], [48, 30], [43, 40]],
  [[35, 30], [43, 12], [51, 12], [57, 22], [56, 26], [48, 30]],
  [[130, 31], [135, 34], [141, 38], [142, 45], [140, 41], [136, 36]],
  [[114, -22], [122, -17], [131, -12], [142, -11], [146, -19], [153, -26], [151, -34], [145, -39], [138, -35], [131, -31], [117, -35], [115, -30]],
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    let task = 0;
    let phase: Phase = 'pre';
    let origin = 'us-east';
    let edges: string[] = [];
    let bestPeople = 0;
    const answered = new Set<number>();
    let betweenT = 0;

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="lb-s1"></span><span id="lb-s2"></span>`);
    const svg = svgEl('svg', { class: 'lb-map', viewBox: '0 0 720 360', role: 'img', 'aria-label': 'World map with cities, data centers and lines to the server each city uses' }) as SVGSVGElement;
    for (let lon = -180; lon <= 180; lon += 30) svgEl('line', { x1: X(lon), y1: 0, x2: X(lon), y2: 360, stroke: 'var(--grid)', 'stroke-width': 1 }, svg);
    for (let lat = 60; lat >= -40; lat -= 20) svgEl('line', { x1: 0, y1: Y(lat), x2: 720, y2: Y(lat), stroke: 'var(--grid)', 'stroke-width': 1 }, svg);
    LAND.forEach((poly) => svgEl('polygon', { points: poly.map(([lo, la]) => `${X(lo)},${Y(la)}`).join(' '), fill: 'var(--grid)', stroke: 'var(--line)', 'stroke-width': 1.2 }, svg));
    const gLines = svgEl('g', {}, svg);
    const lines = sim.USERS.map(() => svgEl('line', { stroke: 'var(--muted)', 'stroke-width': 1.2, 'stroke-dasharray': '3 4' }, gLines));
    const siteMarks = sim.SITES.map((s) => svgEl('rect', { x: X(s.lon) - 5, y: Y(s.lat) - 5, width: 10, height: 10, rx: 2, fill: 'var(--panel)', stroke: 'var(--muted)', 'stroke-width': 1.5 }, svg));
    const userMarks = sim.USERS.map((u) => {
      const c = svgEl('circle', { cx: X(u.lon), cy: Y(u.lat), r: 9, fill: 'var(--ok)', stroke: 'var(--panel)', 'stroke-width': 2 }, svg);
      const t = svgEl('text', { x: X(u.lon), y: Y(u.lat) - 14, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono, monospace', 'font-size': 13, 'font-weight': 600, fill: 'var(--ink)' }, svg);
      return { c, t };
    });
    const mapWrap = el('div', { class: 'lb-mapwrap' });
    mapWrap.appendChild(svg);

    const sitesBox = el('div', { class: 'lb-sites', role: 'group', 'aria-label': 'Data centers' });
    const siteBtns = sim.SITES.map((s) => {
      const b = el('button', { class: 'lb-site', type: 'button', 'data-site': s.id }, `<b>${s.name}</b><span>${s.id}</span>`);
      onPress(b, () => clickSite(s.id));
      sitesBox.appendChild(b);
      return b;
    });
    const usersBox = el('div', { class: 'lb-users', role: 'group', 'aria-label': 'Cities' });
    const userRows = sim.USERS.map((u) => {
      const b = el('button', { class: 'lb-user', type: 'button', 'data-user': u.id }, `<span class="nm">${u.name}</span><span class="pp">${u.people}M</span><span class="bar"><i></i></span><span class="ms"></span>`);
      onPress(b, () => clickUser(u.id));
      usersBox.appendChild(b);
      return { b, bar: b.querySelector('i')!, ms: b.querySelector<HTMLElement>('.ms')! };
    });
    const mapPanel = el('div', { class: 'lb-panel' });
    mapPanel.append(mapWrap, el('p', { class: 'eyebrow' }, 'Data centers'), sitesBox, el('p', { class: 'eyebrow', style: 'margin-top:12px' }, 'Cities (page load time)'), usersBox);

    const reqPanel = el('div', { class: 'lb-panel', hidden: true });
    const reqRows = sim.REQUESTS.map((r, i) => {
      const row = el('div', { class: 'lb-req', 'data-req': i }, `<div class="path"><b>${r.path}</b><span class="small">${r.detail}</span></div>`);
      const edgeB = el('button', { class: 'chip', type: 'button', 'data-req': i, 'data-choice': 'edge' }, 'Edge can serve it');
      const originB = el('button', { class: 'chip', type: 'button', 'data-req': i, 'data-choice': 'origin' }, 'Must go to origin');
      onPress(edgeB, () => answer(i, true));
      onPress(originB, () => answer(i, false));
      const why = el('p', { class: 'small why', hidden: true }, r.why);
      row.append(el('div', { class: 'row' }), why);
      row.querySelector('.row')!.append(edgeB, originB);
      reqPanel.appendChild(row);
      return { row, edgeB, originB, why };
    });
    stage.append(status, mapPanel, reqPanel);

    // ---------- render ----------
    const goalMs = () => (task === 2 ? sim.EDGE_GOAL_MS : sim.ONE_SERVER_GOAL_MS);
    const served = (u: (typeof sim.USERS)[number]) => (task === 2 ? sim.staticLoad(u, sim.EDGE_ORIGIN, edges) : { ms: sim.loadMs(u, sim.site(origin)), from: origin });

    function render() {
      mapPanel.hidden = task === 3;
      reqPanel.hidden = task !== 3;
      const s1 = stage.querySelector('#lb-s1')!, s2 = stage.querySelector('#lb-s2')!;
      const g = goalMs();
      if (task <= 1) {
        const fp = sim.fastPeople(origin);
        s1.innerHTML = `server <b>${sim.site(origin).name}</b>`;
        s2.innerHTML = `under ${g} ms <b>${fp} / ${sim.TOTAL_PEOPLE}M people</b>`;
      } else if (task === 2) {
        s1.innerHTML = `edges <b>${edges.length} / ${sim.EDGE_BUDGET}</b>`;
        s2.innerHTML = `cities under ${g} ms <b>${sim.fastCities(edges).length} / ${sim.USERS.length}</b>`;
      } else {
        s1.innerHTML = `sorted <b>${answered.size} / ${sim.REQUESTS.length}</b>`;
        s2.innerHTML = '';
      }
      sim.USERS.forEach((u, i) => {
        const sv = served(u);
        const fast = sv.ms < g;
        const m = userMarks[i];
        setAttr(m.c, 'fill', fast ? 'var(--ok)' : 'var(--bad)');
        setText(m.t, `${sv.ms}`);
        const sp = sim.site(sv.from);
        setAttr(lines[i], 'x1', X(u.lon));
        setAttr(lines[i], 'y1', Y(u.lat));
        setAttr(lines[i], 'x2', X(sp.lon));
        setAttr(lines[i], 'y2', Y(sp.lat));
        setAttr(lines[i], 'stroke', fast ? 'var(--ok)' : 'var(--muted)');
        const r = userRows[i];
        r.b.classList.toggle('fast', fast);
        r.bar.style.width = `${Math.min(100, (100 * sv.ms) / 900)}%`;
        r.ms.textContent = `${sv.ms} ms`;
        r.b.setAttribute('aria-label', `${u.name}, ${u.people} million people, ${sv.ms} ms from ${sim.site(sv.from).name}. Activate for details.`);
      });
      sim.SITES.forEach((s, i) => {
        const isOrigin = task === 2 ? s.id === sim.EDGE_ORIGIN : s.id === origin;
        const isEdge = task === 2 && edges.includes(s.id);
        const b = siteBtns[i];
        b.classList.toggle('origin', isOrigin);
        b.classList.toggle('edge', isEdge);
        b.setAttribute('aria-pressed', String(isOrigin || isEdge));
        b.setAttribute('aria-label', `${s.name} data center (${s.id})${isOrigin ? ', origin' : isEdge ? ', CDN edge' : ''}. Activate to ${task === 2 ? (isEdge ? 'remove the edge' : 'add an edge') : 'move the server here'}.`);
        setAttr(siteMarks[i], 'fill', isOrigin ? 'var(--ink)' : isEdge ? 'var(--accent)' : 'var(--panel)');
        setAttr(siteMarks[i], 'width', isOrigin || isEdge ? 14 : 10);
        setAttr(siteMarks[i], 'height', isOrigin || isEdge ? 14 : 10);
        setAttr(siteMarks[i], 'x', X(s.lon) - (isOrigin || isEdge ? 7 : 5));
        setAttr(siteMarks[i], 'y', Y(s.lat) - (isOrigin || isEdge ? 7 : 5));
      });
      const prog = api.side.querySelector('#lb-prog');
      if (prog) prog.textContent = task <= 1 ? `People under ${sim.ONE_SERVER_GOAL_MS} ms: ${sim.fastPeople(origin)}M / goal ${sim.ONE_SERVER_GOAL_PEOPLE}M` : task === 2 ? `Cities under ${sim.EDGE_GOAL_MS} ms: ${sim.fastCities(edges).length} / ${sim.USERS.length}` : `Sorted: ${answered.size} / ${sim.REQUESTS.length}`;
      if (phase === 'play') api.coach.say(...coachLine());
      if (phase === 'between') api.coach.say('Task clear! Read the lesson; the next task starts in a moment.', 'watch');
    }

    function coachLine(): [string, 'act' | 'watch'] {
      if (task === 1) return [`Click a data center to move the only server. Goal: ${sim.ONE_SERVER_GOAL_PEOPLE}M people under ${sim.ONE_SERVER_GOAL_MS} ms (now ${sim.fastPeople(origin)}M).`, 'act'];
      if (task === 2) {
        const slow = sim.USERS.filter((u) => sim.staticLoad(u, sim.EDGE_ORIGIN, edges).ms >= sim.EDGE_GOAL_MS).map((u) => u.name);
        return [`Add an edge near a red city (${edges.length} of ${sim.EDGE_BUDGET} used). Still slow: <b>${slow.join(', ')}</b>.`, 'act'];
      }
      if (task === 3) return ['For each request: can an edge serve a stored copy, or must it go to the origin?', 'act'];
      return ['', 'watch'];
    }

    function renderSide() {
      const t = INFO[task];
      api.side.innerHTML = `<p class="eyebrow">${task === 0 ? 'Tutorial' : `Task ${task + 1} of ${meta.tasks.length}`}</p><h2>${t.h}</h2><p style="margin:0">${t.p}</p><div class="progress" id="lb-prog"></div>`;
    }

    // ---------- flow ----------
    function startTask(t: number) {
      task = t;
      phase = t === 0 ? 'tutorial' : 'play';
      origin = 'us-east';
      edges = [];
      bestPeople = sim.fastPeople(origin);
      renderSide();
      render();
    }
    function taskDone() {
      api.task(task);
      if (task >= meta.tasks.length - 1) { phase = 'done'; render(); return; }
      phase = 'between';
      render();
      betweenT = window.setTimeout(() => startTask(task + 1), 2400);
    }
    function guard(): boolean {
      if (phase === 'pre') { api.toast('Press Start first. It is in the brief, and above the game.'); return true; }
      if (phase === 'done') { api.toast('All tasks done. Press Play again to start a new run.'); return true; }
      if (phase === 'between') { api.toast('Task done. The next task starts in a moment.'); return true; }
      return false;
    }

    function clickUser(id: string) {
      if (guard()) return;
      if (phase === 'tutorial') {
        const want = api.coach.step === 'mumbai' ? 'mumbai' : api.coach.step === 'newyork' ? 'newyork' : null;
        if (want !== id) return api.toast(want ? `Tutorial: click ${sim.user(want).name} (highlighted).` : 'Tutorial: click the highlighted data center.');
      }
      if (task === 3) return;
      const u = sim.user(id);
      const sv = served(u);
      const r = sim.rtt(u, sim.site(sv.from));
      api.toast(`${u.name}: ${sim.ROUND_TRIPS} round trips × ${r} ms + ${sim.SERVER_MS} ms server time = ${sv.ms} ms (from ${sim.site(sv.from).name}, ${Math.round(sim.km(u, sim.site(sv.from))).toLocaleString('en-US')} km away).`);
      if (phase === 'tutorial') {
        api.hit('measured', userRows[sim.USERS.indexOf(u)].b);
        api.coach.did(api.coach.step!);
      }
    }

    function clickSite(id: string) {
      if (guard()) return;
      const b = siteBtns[sim.SITES.findIndex((s) => s.id === id)];
      if (phase === 'tutorial') {
        if (api.coach.step !== 'move' || id !== 'ap-south') return api.toast(api.coach.step === 'move' ? 'Tutorial: click the Mumbai data center (highlighted).' : 'Tutorial: click the highlighted city.');
        origin = id;
        api.hit('moved', b);
        api.coach.did('move');
        render();
        return;
      }
      if (task === 3) return;
      api.move();
      if (task === 1) {
        if (id === origin) return api.toast(`The server is already in ${sim.site(id).name}.`);
        origin = id;
        const fp = sim.fastPeople(origin);
        if (fp > bestPeople) {
          bestPeople = fp;
          api.hit(`${fp}M fast`, b);
        } else api.toast(`From ${sim.site(id).name}, ${fp}M people load in under ${sim.ONE_SERVER_GOAL_MS} ms.`);
        render();
        if (sim.oneServerOk(origin)) taskDone();
        return;
      }
      // task 2: edges
      if (id === sim.EDGE_ORIGIN) return api.toast('Virginia is the origin. It already serves New York fast.');
      if (edges.includes(id)) {
        edges = edges.filter((e) => e !== id);
        api.toast(`Removed the ${sim.site(id).name} edge.`);
        render();
        return;
      }
      if (edges.length >= sim.EDGE_BUDGET) return api.toast(`The budget is ${sim.EDGE_BUDGET} edges. Remove one first (click it again).`);
      const gains = sim.edgeGains(edges, id);
      edges = [...edges, id];
      if (gains.length) api.hit(`+${gains.map((g) => sim.user(g).name).join(', ')}`, b);
      else {
        api.mistake('no city gained', b);
        api.toast(`An edge in ${sim.site(id).name} gets no new city under ${sim.EDGE_GOAL_MS} ms. Click it again to free up the budget.`);
      }
      render();
      if (sim.allFast(edges)) taskDone();
    }

    function answer(i: number, edge: boolean) {
      if (guard()) return;
      if (task !== 3) return;
      if (answered.has(i)) return api.toast('Already sorted. Pick another request.');
      const r = sim.REQUESTS[i];
      const row = reqRows[i];
      const b = edge ? row.edgeB : row.originB;
      api.move();
      if (edge !== r.edge) {
        api.mistake(edge ? 'not cacheable' : 'cacheable!', b);
        api.toast(r.why);
        return;
      }
      answered.add(i);
      api.hit(edge ? 'edge' : 'origin', b);
      row.row.classList.add('done');
      row.why.hidden = false;
      b.setAttribute('aria-pressed', 'true');
      render();
      if (answered.size >= sim.REQUESTS.length) taskDone();
    }

    api.onBegin(() => {
      startTask(0);
      api.coach.tutorial(meta.walkthrough, () => {
        api.task(0);
        phase = 'between';
        render();
        betweenT = window.setTimeout(() => startTask(1), 1800);
      });
    });

    render();
    return () => clearTimeout(betweenT);
  },
};
