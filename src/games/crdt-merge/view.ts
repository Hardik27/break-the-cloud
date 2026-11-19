/** CRDT Merge view. Turn-based: device cards, slot pickers and item chips are built once; render updates text and classes. */
import { el, esc, onPress, setText } from '../../lib/dom';
import { makeFlow } from '../flow';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

const INFO = [
  { h: 'Tutorial: one like, one sync', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'Count the likes', p: `Both devices start at ${sim.BASE} likes, then go offline. Ana likes <b>${sim.WANT_INC[0]}</b> posts on her phone (+1 three times); Ben likes <b>${sim.WANT_INC[1]}</b> on his laptop. Then <b>Sync</b> and work out the right total.` },
  { h: 'G-counters', p: `Each device now keeps a list of counts, one per device: [Phone, Laptop, Tablet]. A device only ever increases its own entry. Merge two lists entry by entry: pick the right number for each, ${sim.G_ROUNDS.length} merges.` },
  { h: 'An OR-set shopping list', p: 'Every add gets a unique tag (like milk·l1). A remove deletes only the tags that device had seen. Read what each device did offline, pick the items in the merged list, and press <b>Merge</b>.' },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    let inc: [number, number] = [0, 0];
    let synced = false;
    let gi = 0;
    let slotDone = [false, false, false];
    let si = 0;
    let chosen = new Set<string>();
    const log: string[] = [];

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="cr-s1"></span><span id="cr-s2"></span>`);
    const p1 = el('div', { class: 'cr-panel' });
    const devs = el('div', { class: 'cr-devs' });
    const devEls = ['Phone', 'Laptop'].map((name, i) => {
      const d = el('div', { class: 'cr-dev', id: `cr-dev-${i}` }, `<b>${name}</b><span class="small">${i ? 'Ben' : 'Ana'} · <span class="cr-net">offline</span></span><span class="cr-val" id="cr-v-${i}"></span>`);
      const b = el('button', { class: 'btn ghost as-btn', type: 'button', 'data-inc': i }, '♥ +1');
      onPress(b, () => doInc(i));
      d.appendChild(b);
      devs.appendChild(d);
      return d;
    });
    const sync = el('button', { class: 'btn go', type: 'button', id: 'cr-sync' }, 'Sync');
    onPress(sync, () => doSync());
    const naive = el('div', { class: 'as-res', id: 'cr-naive' });
    const totRow = el('div', { class: 'row', role: 'group', 'aria-label': 'Correct total' }, '<span class="small">The right total is</span>');
    p1.append(devs, sync, naive, totRow);

    const p2 = el('div', { class: 'cr-panel', hidden: true });
    const vecA = el('div', { class: 'cr-vec', id: 'cr-va' });
    const vecB = el('div', { class: 'cr-vec', id: 'cr-vb' });
    const merged = el('div', { class: 'cr-merged' }, '<span class="small cr-lbl">merged</span>');
    const slotEls = sim.DEVICES.map((d, k) => {
      const s = el('div', { class: 'cr-slot', 'data-slotbox': k }, `<span class="small">${d}</span><span class="cr-picked"></span>`);
      const chips = el('div', { class: 'row cr-chips' });
      s.appendChild(chips);
      merged.appendChild(s);
      return { s, chips };
    });
    const gRes = el('p', { class: 'small', id: 'cr-gres', style: 'margin:0' });
    p2.append(vecA, vecB, merged, gRes);

    const p3 = el('div', { class: 'cr-panel', hidden: true });
    const logs = el('div', { class: 'pt-logs', id: 'cr-logs' });
    const items = el('div', { class: 'row', role: 'group', 'aria-label': 'Items in the merged list' });
    const itemBtns = new Map<string, HTMLButtonElement>();
    for (const it of [...new Set(sim.SET_ROUNDS.flatMap(sim.setCandidates))]) {
      const b = el('button', { class: 'chip', type: 'button', 'data-item': it, 'aria-pressed': 'false' }, it);
      b.addEventListener('click', () => toggleItem(it));
      items.appendChild(b);
      itemBtns.set(it, b);
    }
    const mergeBtn = el('button', { class: 'btn go', type: 'button', id: 'cr-merge' }, 'Merge');
    mergeBtn.addEventListener('click', doMerge);
    p3.append(logs, el('p', { class: 'eyebrow', style: 'margin:0' }, 'Merged list (click to include)'), items, mergeBtn);

    const feed = el('div', { class: 'feed cr-feed' });
    const feedLines = Array.from({ length: 3 }, () => feed.appendChild(el('div')));
    stage.append(status, p1, p2, p3, feed);

    const flow = makeFlow(api, meta, INFO, (t) => {
      log.length = 0;
      if (t <= 1) { inc = [0, 0]; synced = false; naive.innerHTML = ''; buildTotals(); }
      if (t === 2) { gi = 0; slotDone = [false, false, false]; buildSlots(); setText(gRes, ''); }
      if (t === 3) { si = 0; chosen = new Set(); }
    }, render);

    // Chips that change per round are rebuilt between rounds only, never in a loop.
    function buildTotals() {
      totRow.querySelectorAll('button').forEach((b) => b.remove());
      for (const v of sim.totalChoices(sim.WANT_INC)) {
        const b = el('button', { class: 'chip', type: 'button', 'data-total': v }, String(v));
        b.addEventListener('click', () => answerTotal(v, b));
        totRow.appendChild(b);
      }
    }
    function buildSlots() {
      const r = sim.G_ROUNDS[Math.min(gi, sim.G_ROUNDS.length - 1)];
      slotEls.forEach(({ chips }, k) => {
        chips.innerHTML = '';
        for (const v of sim.slotChoices(r.va[k], r.vb[k])) {
          const b = el('button', { class: 'chip', type: 'button', 'data-slot': k, 'data-val': v }, String(v));
          onPress(b, () => pickSlot(k, v, b));
          chips.appendChild(b);
        }
      });
    }

    // ---------- render ----------
    function render() {
      const t = flow.task;
      p1.hidden = t > 1;
      p2.hidden = t !== 2;
      p3.hidden = t !== 3;
      const s1 = stage.querySelector('#cr-s1')!, s2 = stage.querySelector('#cr-s2')!;
      if (t <= 1) {
        const n = sim.naiveMerges(inc);
        devEls.forEach((d, i) => {
          setText(d.querySelector('.cr-val')!, synced && t === 0 ? String(sim.BASE + inc[0] + inc[1]) : String(sim.BASE + inc[i]));
          setText(d.querySelector('.cr-net')!, synced ? 'synced' : 'offline');
          d.classList.toggle('synced', synced);
        });
        totRow.hidden = !(t === 1 && synced);
        naive.hidden = !(t === 1 && synced);
        if (t === 1 && synced) {
          naive.innerHTML = `<div class="mrow"><span>Last write wins (laptop synced last)</span><span class="bad-pill">${n.lww}</span></div>
            <div class="mrow"><span>Take the bigger number</span><span class="bad-pill">${n.max}</span></div>
            <div class="mrow"><span>Add the two numbers</span><span class="bad-pill">${n.sum}</span></div>`;
        }
        sync.setAttribute('aria-disabled', String(synced));
        s1.innerHTML = `phone <b>+${inc[0]}</b> · laptop <b>+${inc[1]}</b>`;
        s2.innerHTML = synced ? '<b>synced</b>' : 'offline';
        flow.progress(t === 1 ? (synced ? 'Pick the right total.' : `Likes: phone ${inc[0]}/${sim.WANT_INC[0]}, laptop ${inc[1]}/${sim.WANT_INC[1]}`) : '');
      } else if (t === 2) {
        const r = sim.G_ROUNDS[Math.min(gi, sim.G_ROUNDS.length - 1)];
        const cells = (v: number[]) => v.map((x) => `<i>${x}</i>`).join('');
        vecA.innerHTML = `<span class="small cr-lbl">${sim.DEVICES[r.a]}</span>${cells(r.va)}<span class="small">= ${sim.gValue(r.va)}</span>`;
        vecB.innerHTML = `<span class="small cr-lbl">${sim.DEVICES[r.b]}</span>${cells(r.vb)}<span class="small">= ${sim.gValue(r.vb)}</span>`;
        const m = sim.gMerge(r.va, r.vb);
        slotEls.forEach(({ s, chips }, k) => {
          s.classList.toggle('done', slotDone[k]);
          chips.hidden = slotDone[k];
          setText(s.querySelector('.cr-picked')!, slotDone[k] ? String(m[k]) : '?');
        });
        s1.innerHTML = `merge <b>${Math.min(gi + 1, sim.G_ROUNDS.length)}/${sim.G_ROUNDS.length}</b>`;
        s2.innerHTML = '';
        flow.progress(`Merged: ${gi} / ${sim.G_ROUNDS.length}`);
      } else {
        const r = sim.SET_ROUNDS[Math.min(si, sim.SET_ROUNDS.length - 1)];
        const tag = (x: sim.Tagged) => `${esc(x.item)}<span class="cr-tag">·${x.tag}</span>`;
        const ops = (o: sim.SetRound['phone']) => [...o.adds.map((x) => `<li class="add">+ add ${tag(x)}</li>`), ...o.removes.map((x) => `<li class="remove">− remove ${tag(x)}</li>`)].join('');
        logs.innerHTML = `<div class="pt-log"><p class="eyebrow">Before going offline</p><p>${r.before.map(tag).join(', ')}</p></div>
          <div class="pt-log"><p class="eyebrow">Phone did</p><ul>${ops(r.phone)}</ul></div>
          <div class="pt-log"><p class="eyebrow">Laptop did</p><ul>${ops(r.laptop)}</ul></div>`;
        const cands = new Set(sim.setCandidates(r));
        itemBtns.forEach((b, it) => {
          b.hidden = !cands.has(it);
          b.setAttribute('aria-pressed', String(chosen.has(it)));
        });
        s1.innerHTML = `list <b>${Math.min(si + 1, sim.SET_ROUNDS.length)}/${sim.SET_ROUNDS.length}</b>`;
        s2.innerHTML = '';
        flow.progress(`Lists merged: ${si} / ${sim.SET_ROUNDS.length}`);
      }
      feedLines.forEach((d, i) => setText(d, log[i] ?? ''));
      if (!flow.coachBetween() && flow.phase === 'play') api.coach.say(...coachLine());
    }

    function coachLine(): [string, 'act' | 'watch'] {
      const t = flow.task;
      if (t === 1) {
        if (synced) return ['None of the simple merges is right. What should the total be?', 'act'];
        if (inc[0] < sim.WANT_INC[0] || inc[1] < sim.WANT_INC[1]) return [`Like ${sim.WANT_INC[0]} times on the phone and ${sim.WANT_INC[1]} on the laptop.`, 'act'];
        return ['Both devices changed their copy offline. Click <b>Sync</b>.', 'act'];
      }
      if (t === 2) return ['For each entry, pick the merged count.', 'act'];
      if (t === 3) return ['Pick the items that survive, then press <b>Merge</b>.', 'act'];
      return ['', 'watch'];
    }

    // ---------- actions ----------
    function doInc(i: number) {
      if (flow.guard()) return;
      if (flow.task > 1) return;
      if (flow.phase === 'tutorial') {
        if (api.coach.step !== 'inc') return api.toast('Tutorial: click Sync (highlighted).');
        if (i !== 0) return api.toast('Tutorial: click +1 on the phone (highlighted).');
        inc[0]++;
        api.hit('+1', devEls[0]);
        api.coach.did('inc');
        render();
        return;
      }
      if (synced) return api.toast('Already synced. Now pick the right total.');
      if (inc[i] >= sim.WANT_INC[i]) return api.toast(`${i ? 'Ben' : 'Ana'} has liked ${sim.WANT_INC[i]} posts. Like on the other device, or Sync.`);
      api.move();
      inc[i]++;
      api.hit('+1', devEls[i]);
      render();
    }

    function doSync() {
      if (flow.guard()) return;
      if (flow.task > 1) return;
      if (flow.phase === 'tutorial') {
        if (api.coach.step !== 'sync') return api.toast('Tutorial: click +1 on the phone first (highlighted).');
        synced = true;
        api.coach.did('sync');
        return;
      }
      if (synced) return api.toast('Already synced.');
      if (inc[0] < sim.WANT_INC[0] || inc[1] < sim.WANT_INC[1]) return api.toast(`Finish the likes first: phone ${inc[0]}/${sim.WANT_INC[0]}, laptop ${inc[1]}/${sim.WANT_INC[1]}.`);
      api.move();
      synced = true;
      api.hit('synced', sync);
      render();
    }

    function answerTotal(v: number, b: HTMLElement) {
      if (flow.guard()) return;
      if (flow.task !== 1) return;
      if (!synced) return api.toast('Sync first.');
      api.move();
      const n = sim.naiveMerges(inc);
      if (v !== n.correct) {
        api.mistake('lost likes', b);
        api.toast(v === n.sum ? `${v} counts the starting ${sim.BASE} likes twice.` : `${v} loses likes: ${sim.BASE} + ${inc[0]} + ${inc[1]} = ${n.correct} people pressed like.`);
        return;
      }
      api.hit(`${v} likes`, b);
      api.toast(`${n.correct}. But no merge of two plain numbers gets there: you needed to know who added what.`);
      flow.done();
    }

    function pickSlot(k: number, v: number, b: HTMLElement) {
      if (flow.guard()) return;
      if (flow.task !== 2) return;
      if (slotDone[k]) return;
      api.move();
      const r = sim.G_ROUNDS[gi];
      const c = sim.checkSlot(r, k, v);
      if (!c.ok) {
        api.mistake('wrong count', b);
        api.toast(c.why);
        return;
      }
      slotDone[k] = true;
      api.hit('max', b);
      if (slotDone.every(Boolean)) {
        const m = sim.gMerge(r.va, r.vb);
        log.unshift(`${sim.DEVICES[r.a]} + ${sim.DEVICES[r.b]} → [${m.join(', ')}] = ${sim.gValue(m)}`);
        setText(gRes, `Merged: [${m.join(', ')}] = ${sim.gValue(m)} likes. Merging again changes nothing.`);
        gi++;
        if (gi >= sim.G_ROUNDS.length) {
          render();
          return flow.done();
        }
        slotDone = [false, false, false];
        buildSlots();
      }
      render();
    }

    function toggleItem(it: string) {
      if (flow.guard()) return;
      if (flow.task !== 3) return;
      chosen.has(it) ? chosen.delete(it) : chosen.add(it);
      render();
    }

    function doMerge() {
      if (flow.guard()) return;
      if (flow.task !== 3) return;
      api.move();
      const r = sim.SET_ROUNDS[si];
      const c = sim.checkSet(r, [...chosen]);
      if (!c.ok) {
        api.mistake('wrong list', mergeBtn);
        api.toast(c.why);
        return;
      }
      api.hit('converged', mergeBtn);
      log.unshift(`List ${si + 1}: ${sim.orMerge(r).join(', ')}`);
      si++;
      chosen = new Set();
      if (si >= sim.SET_ROUNDS.length) {
        render();
        return flow.done();
      }
      api.toast('Both devices now hold exactly this list. Next one.');
      render();
    }

    render();
    return () => flow.dispose();
  },
};
