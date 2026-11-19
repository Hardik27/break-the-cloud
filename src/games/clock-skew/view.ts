/** Clock Skew view. Turn-based: chat rows, the SVG diagram and the answer buttons are built once; render updates text and classes. */
import { el, esc, onPress, setText, svgEl } from '../../lib/dom';
import { makeFlow } from '../flow';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

const INFO = [
  { h: 'Tutorial: two messages', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'Fix the group chat', p: 'Your chat server sorts messages by the timestamp each phone attached. Three phones, three clocks, none of them right. Click the messages <b>in the order they were really sent</b>: read what each one replies to.' },
  { h: 'Lamport clocks', p: 'Three servers, A, B and C, each keep a counter. Rule: on a local event or a send, add 1. A message carries the sender’s counter; on a receive, take <b>max(own, message) + 1</b>. Pick the timestamp of each highlighted event, in order.' },
  { h: 'Vector clocks', p: 'Now each event carries a <b>vector</b>: one counter per server [A,B,C]. x happened before y if every entry of x is ≤ the same entry of y. If each one is bigger somewhere, they are <b>concurrent</b>. Classify each pair.' },
];

const Y = [40, 110, 180];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    let chat = sim.TUTORIAL_CHAT;
    let placed = 0;
    let ei = 0;
    let pi = 0;
    const L = sim.lamport();
    const V = sim.vector();

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="ck-s1"></span><span id="ck-s2"></span>`);
    const p1 = el('div', { class: 'ck-panel' });
    const list = el('div', { class: 'ck-chat', role: 'group', 'aria-label': 'Chat sorted by timestamp' });
    const slots = Array.from({ length: sim.CHAT.length }, (_, s) => {
      const b = el('button', { class: 'ck-msg', type: 'button' }, '<span class="ck-ts"></span><b class="ck-who"></b><span class="ck-text"></span><span class="ck-n"></span>');
      onPress(b, () => pickMsg(s));
      list.appendChild(b);
      return b;
    });
    p1.append(el('p', { class: 'eyebrow', style: 'margin:0' }, 'Sorted by the phone’s timestamp'), list);

    const p2 = el('div', { class: 'ck-panel', hidden: true });
    const svg = svgEl('svg', { viewBox: '0 0 530 210', class: 'ck-svg', role: 'img', 'aria-label': 'Events on servers A, B and C, with messages between them' });
    const defs = svgEl('defs', {}, svg);
    const mk = svgEl('marker', { id: 'ck-arr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, defs);
    svgEl('path', { d: 'M0 0 10 5 0 10z', class: 'ck-arrhead' }, mk);
    sim.PROCS.forEach((p, i) => {
      svgEl('text', { x: 12, y: Y[i] + 5, class: 'ck-proc' }, svg).textContent = p;
      svgEl('line', { x1: 34, y1: Y[i], x2: 515, y2: Y[i], class: 'ck-line' }, svg);
    });
    for (const e of sim.EVENTS) {
      if (e.kind !== 'recv') continue;
      const s = sim.byId(e.from!);
      const dy = Y[e.p] > Y[s.p] ? 1 : -1;
      svgEl('line', { x1: s.x, y1: Y[s.p] + dy * 8, x2: e.x, y2: Y[e.p] - dy * 10, class: 'ck-msgline', 'marker-end': 'url(#ck-arr)' }, svg);
    }
    const evEls = new Map<string, { c: SVGElement; v: SVGElement }>();
    for (const e of sim.EVENTS) {
      const g = svgEl('g', { 'data-ev': e.id }, svg);
      const c = svgEl('circle', { cx: e.x, cy: Y[e.p], r: 8, class: 'ck-ev' }, g);
      svgEl('text', { x: e.x, y: Y[e.p] - 14, 'text-anchor': 'middle', class: 'ck-evname' }, g).textContent = e.id;
      const v = svgEl('text', { x: e.x, y: Y[e.p] + 24, 'text-anchor': 'middle', class: 'ck-evval' }, g);
      evEls.set(e.id, { c, v });
    }
    const q = el('div', { class: 'ck-q', id: 'ck-q', 'aria-live': 'polite' });
    const lvRow = el('div', { class: 'row', role: 'group', 'aria-label': 'Lamport timestamp' });
    Array.from({ length: 9 }, (_, k) => {
      const b = el('button', { class: 'chip ck-lv', type: 'button', 'data-lv': k + 1 }, String(k + 1));
      onPress(b, () => answerLamport(k + 1, b));
      lvRow.appendChild(b);
    });
    const relRow = el('div', { class: 'row', role: 'group', 'aria-label': 'Relation' });
    const relBtns = (['before', 'after', 'concurrent'] as sim.Rel[]).map((r) => {
      const b = el('button', { class: 'btn ghost as-btn', type: 'button', 'data-rel': r }, r);
      onPress(b, () => answerRel(r, b));
      relRow.appendChild(b);
      return b;
    });
    p2.append(svg as unknown as HTMLElement, q, lvRow, relRow);
    stage.append(status, p1, p2);

    const flow = makeFlow(api, meta, INFO, (t) => {
      if (t === 0) { chat = sim.TUTORIAL_CHAT; placed = 0; }
      if (t === 1) { chat = sim.CHAT; placed = 0; }
      if (t === 2) ei = 0;
      if (t === 3) pi = 0;
    }, render);

    // ---------- render ----------
    function render() {
      const t = flow.task;
      p1.hidden = t > 1;
      p2.hidden = t < 2;
      const s1 = stage.querySelector('#ck-s1')!, s2 = stage.querySelector('#ck-s2')!;
      if (t <= 1) {
        const order = sim.byTimestamp(chat);
        slots.forEach((b, s) => {
          const i = order[s];
          b.hidden = i === undefined;
          if (i === undefined) {
            b.setAttribute('data-msg', '-');
            return;
          }
          const m = chat[i];
          b.setAttribute('data-msg', String(i));
          b.classList.toggle('done', i < placed);
          b.setAttribute('aria-pressed', String(i < placed));
          setText(b.querySelector('.ck-ts')!, sim.fmtStamp(sim.stamp(m)));
          setText(b.querySelector('.ck-who')!, m.who);
          setText(b.querySelector('.ck-text')!, m.text);
          setText(b.querySelector('.ck-n')!, i < placed ? `#${i + 1}` : '');
        });
        s1.innerHTML = `placed <b>${placed}/${chat.length}</b>`;
        s2.innerHTML = '';
        flow.progress(t === 1 ? `Placed: ${placed} / ${chat.length}` : '');
      } else {
        lvRow.hidden = t !== 2;
        relRow.hidden = t !== 3;
        const cur = t === 2 ? sim.EVENTS[Math.min(ei, sim.EVENTS.length - 1)].id : '';
        const pair = sim.PAIRS[Math.min(pi, sim.PAIRS.length - 1)];
        sim.EVENTS.forEach((e, k) => {
          const u = evEls.get(e.id)!;
          const done = t === 2 && k < ei;
          const focus = t === 2 ? e.id === cur && ei < sim.EVENTS.length : pair.includes(e.id);
          u.c.setAttribute('class', `ck-ev${done ? ' done' : ''}${focus ? ' focus' : ''}${e.kind === 'recv' ? ' recv' : ''}`);
          setText(u.v, t === 2 ? (done ? String(L[e.id]) : '?') : `[${V[e.id].join(',')}]`);
        });
        if (t === 2) {
          const e = sim.byId(cur);
          const what = e.kind === 'recv' ? `receives the message from ${e.from}` : e.kind === 'send' ? 'sends a message' : 'is a local event';
          q.innerHTML = `<b>${esc(e.id)}</b> on ${sim.PROCS[e.p]} ${what}. Its Lamport timestamp?`;
          s1.innerHTML = `event <b>${Math.min(ei + 1, sim.EVENTS.length)}/${sim.EVENTS.length}</b>`;
          flow.progress(`Timestamped: ${ei} / ${sim.EVENTS.length}`);
        } else {
          const [x, y] = pair;
          q.innerHTML = `<b>${x}</b> [${V[x].join(',')}] vs <b>${y}</b> [${V[y].join(',')}]: how are they related?`;
          relBtns.forEach((b) => setText(b, b.dataset.rel === 'before' ? `${x} before ${y}` : b.dataset.rel === 'after' ? `${x} after ${y}` : 'concurrent'));
          s1.innerHTML = `pair <b>${Math.min(pi + 1, sim.PAIRS.length)}/${sim.PAIRS.length}</b>`;
          flow.progress(`Classified: ${pi} / ${sim.PAIRS.length}`);
        }
        s2.innerHTML = '';
      }
      if (!flow.coachBetween() && flow.phase === 'play') api.coach.say(...coachLine());
    }

    function coachLine(): [string, 'act' | 'watch'] {
      const t = flow.task;
      if (t === 1) return [placed ? `Click the message sent right after “${esc(chat[placed - 1].text)}”.` : 'Click the message that started the conversation.', 'act'];
      if (t === 2) return [`Pick the Lamport timestamp of <b>${sim.EVENTS[Math.min(ei, sim.EVENTS.length - 1)].id}</b>.`, 'act'];
      if (t === 3) return ['Compare the vectors entry by entry: <b>before</b>, <b>after</b> or <b>concurrent</b>?', 'act'];
      return ['', 'watch'];
    }

    // ---------- actions ----------
    function pickMsg(s: number) {
      if (flow.guard()) return;
      if (flow.task > 1) return;
      const i = sim.byTimestamp(chat)[s];
      if (i === undefined) return;
      if (flow.phase === 'tutorial') {
        const want = api.coach.step === 'first' ? 0 : 1;
        if (i !== want) return api.toast(want === 0 ? 'Tutorial: click Alice’s question (highlighted). Bob can’t answer a question before it is asked.' : 'Tutorial: click Bob’s reply (highlighted).');
        placed = i + 1;
        api.hit(i === 0 ? 'first!' : 'in order', slots[s]);
        api.coach.did(want === 0 ? 'first' : 'second');
        render();
        return;
      }
      if (i < placed) return api.toast('Already placed. Click the next message.');
      api.move();
      const r = sim.place(chat, placed, i);
      if (!r.ok) {
        api.mistake('out of order', slots[s]);
        api.toast(r.why);
        return;
      }
      placed++;
      api.hit(`#${placed}`, slots[s]);
      render();
      if (placed >= chat.length) flow.done();
    }

    function answerLamport(v: number, b: HTMLElement) {
      if (flow.guard()) return;
      if (flow.task !== 2) return;
      if (ei >= sim.EVENTS.length) return;
      api.move();
      const id = sim.EVENTS[ei].id;
      const r = sim.checkLamport(id, v);
      if (!r.ok) {
        api.mistake('wrong tick', b);
        api.toast(r.why);
        return;
      }
      api.hit(`${id} = ${v}`, b);
      ei++;
      render();
      if (ei >= sim.EVENTS.length) flow.done();
    }

    function answerRel(rel: sim.Rel, b: HTMLElement) {
      if (flow.guard()) return;
      if (flow.task !== 3) return;
      if (pi >= sim.PAIRS.length) return;
      api.move();
      const [x, y] = sim.PAIRS[pi];
      if (sim.relation(x, y) !== rel) {
        api.mistake('look again', b);
        api.toast(sim.explainRel(x, y));
        return;
      }
      api.hit(rel === 'concurrent' ? 'concurrent!' : rel, b);
      pi++;
      render();
      if (pi >= sim.PAIRS.length) flow.done();
    }

    render();
    return () => flow.dispose();
  },
};
