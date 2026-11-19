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
  { h: 'One server for the world', p: `<b>Goal:</b> at least ${sim.ONE_SERVER_GOAL_PEOPLE}M of ${sim.TOTAL_PEOPLE}M people load the page in under ${sim.ONE_SERVER_GOAL_MS} ms.<br><b>Your tools:</b> click a data center to move your only server there. Click a city to see how its time adds up.` },
  { h: 'Three CDN edges', p: `<b>Goal:</b> as many people as possible load static pages in under ${sim.EDGE_GOAL_MS} ms. Two rounds.<br><b>Your tools:</b> click a data center to put an edge there (the ring shows its ${sim.EDGE_GOAL_MS} ms reach), click it again to remove it. Budget: ${sim.EDGE_BUDGET} edges. The origin stays in Virginia.` },
  { h: 'What can an edge keep?', p: '<b>Goal:</b> sort every request.<br><b>Your tools:</b> for each one, choose “Edge can serve it” or “Must go to origin”.' },
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
    let er = 0;
    const round = () => sim.EDGE_ROUNDS[Math.min(er, sim.EDGE_ROUNDS.length - 1)];
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
    const gRings = svgEl('g', {}, svg);
    const DEG = sim.EDGE_REACH_KM / 111;
    const rings = sim.SITES.map((s) => svgEl('ellipse', { cx: X(s.lon), cy: Y(s.lat), rx: (2 * DEG) / Math.cos((s.lat * Math.PI) / 180), ry: 3 * DEG, fill: 'var(--accent)', 'fill-opacity': 0.12, stroke: 'var(--accent)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3', class: 'lb-ring', visibility: 'hidden' }, gRings));
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
        const r = round();
        s1.innerHTML = `${r.title} · edges <b>${edges.length} / ${sim.EDGE_BUDGET}</b>`;
        s2.innerHTML = `fast <b>${sim.coveredPeople(edges, r)}M</b> of ${sim.roundPeople(r)}M · goal ${r.goal}M`;
      } else {
        s1.innerHTML = `sorted <b>${answered.size} / ${sim.REQUESTS.length}</b>`;
        s2.innerHTML = '';
      }
      sim.USERS.forEach((u, i) => {
        const sv = served(u);
        const fast = sv.ms < g;
        const m = userMarks[i];
        setAttr(m.c, 'fill', fast ? 'var(--ok)' : 'var(--bad)');
        setText(m.t, task === 2 ? `${round().people[u.id]}M` : `${sv.ms}`);
        const sp = sim.site(sv.from);
        setAttr(lines[i], 'x1', X(u.lon));
        setAttr(lines[i], 'y1', Y(u.lat));
        setAttr(lines[i], 'x2', X(sp.lon));
        setAttr(lines[i], 'y2', Y(sp.lat));
        setAttr(lines[i], 'stroke', fast ? 'var(--ok)' : 'var(--muted)');
        const r = userRows[i];
        r.b.classList.toggle('fast', fast);
        if (task === 2) setText(r.b.querySelector('.pp')!, `${round().people[u.id]}M`);
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
      sim.SITES.forEach((s, i) => setAttr(rings[i], 'visibility', task === 2 && edges.includes(s.id) ? 'visible' : 'hidden'));
      const prog = api.side.querySelector('#lb-prog');
      if (prog) prog.textContent = task <= 1 ? `People under ${sim.ONE_SERVER_GOAL_MS} ms: ${sim.fastPeople(origin)}M / goal ${sim.ONE_SERVER_GOAL_PEOPLE}M` : task === 2 ? `Round ${er + 1} of 2 · ${round().title}: ${sim.coveredPeople(edges, round())}M fast / goal ${round().goal}M` : `Sorted: ${answered.size} / ${sim.REQUESTS.length}`;
      if (phase === 'play') api.coach.say(...coachLine());
      if (phase === 'between') api.coach.say('Task clear! Read the lesson; press Next above.', 'watch');
    }

    function coachLine(): [string, 'act' | 'watch'] {
      if (task === 1) return [`Click a data center to move the only server. Goal: ${sim.ONE_SERVER_GOAL_PEOPLE}M people under ${sim.ONE_SERVER_GOAL_MS} ms (now ${sim.fastPeople(origin)}M).`, 'act'];
      if (task === 2) {
        const r = round();
        const need = r.goal - sim.coveredPeople(edges, r);
        return edges.length < sim.EDGE_BUDGET
          ? [`${r.title}: place an edge (${edges.length} of ${sim.EDGE_BUDGET} used). ${need}M more people to reach the goal.`, 'act']
          : [`All ${sim.EDGE_BUDGET} edges used, ${need}M people short. <b>Move one</b>: click an edge to remove it, then place it somewhere better.`, 'act'];
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
      er = 0;
      bestPeople = sim.fastPeople(origin);
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
      if (edges.length >= sim.EDGE_BUDGET) return api.toast(`The budget is ${sim.EDGE_BUDGET} edges. Click one of yours to remove it first.`);
      const r = round();
      const gains = sim.edgeGains(edges, id);
      edges = [...edges, id];
      const ppl = gains.reduce((a, g) => a + r.people[g], 0);
      if (gains.length) api.hit(`+${ppl}M ${gains.map((g) => sim.user(g).name).join(', ')}`, b);
      else {
        api.mistake('nobody new', b);
        api.toast(`No city is within ${sim.EDGE_GOAL_MS} ms of ${sim.site(id).name} that isn’t fast already. Click it again to get the edge back.`);
      }
      render();
      if (sim.edgeRoundOk(edges, r)) {
        if (er === 0) {
          er = 1;
          api.toast(`${sim.coveredPeople(edges, r)}M people are fast. Round 2: São Paulo just tripled to 30M users.`);
          render();
        } else taskDone();
      }
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
        api.ready(1, () => startTask(1));
      });
    });

    render();
    return () => clearTimeout(betweenT);
  },
};
