/** Partition view. Turn-based: buttons built once, text and classes updated after each decision. */
import { el, esc, onPress, setText } from '../../lib/dom';
import { makeFlow } from '../flow';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

const INFO = [
  { h: 'Tutorial: the partition', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'Accept or reject?', p: `The link is down. ${sim.PROMPTS.length} writes arrive, in both cities. For each one, decide: <b>Accept</b> it, or <b>Reject</b> it until the link heals. Think about where it arrived (majority or not) and what kind of data it is.` },
  { h: 'Merge the carts', p: 'The link is back. While it was down, both cities changed the same cart. Pick the items the merged cart should contain, then press <b>Merge</b>. Keep every change a user made. <b>2 carts.</b>' },
  { h: 'CP or AP?', p: 'Real systems make this choice for you. For each system, pick <b>CP</b> (refuses service without a majority) or <b>AP</b> (keeps answering and reconciles later).' },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    let cut = false;
    let pi = 0;
    let prompt: sim.Prompt = sim.TUTORIAL_PROMPT;
    let round = 0;
    let chosen = new Set<string>();
    const sorted = new Set<number>();
    const log: string[] = [];

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="pt-s1"></span><span id="pt-s2"></span>`);
    const map = el('div', { class: 'pt-map' }, `<div class="pt-city ny"><b>New York</b><span class="pt-reps"><i></i><i></i></span><span class="small">2 of 3 replicas · majority</span></div>
      <div class="pt-link" id="pt-link"><span class="line"></span><span class="x">✕</span></div>
      <div class="pt-city lon"><b>London</b><span class="pt-reps"><i></i></span><span class="small">1 of 3 replicas</span></div>`);
    const cutBtn = el('button', { class: 'btn ghost', type: 'button', id: 'pt-cut' }, 'Cut the link');
    onPress(cutBtn, () => doCut());
    const p1 = el('div', { class: 'pt-panel' });
    const card = el('div', { class: 'pt-prompt', id: 'pt-prompt', 'aria-live': 'polite' });
    const acc = el('button', { class: 'btn go as-btn', type: 'button', id: 'pt-accept' }, 'Accept');
    const rej = el('button', { class: 'btn ghost as-btn', type: 'button', id: 'pt-reject' }, 'Reject');
    onPress(acc, () => doDecide(true));
    onPress(rej, () => doDecide(false));
    const row = el('div', { class: 'row' });
    row.append(acc, rej);
    const feed = el('div', { class: 'feed' });
    const feedLines = Array.from({ length: 4 }, () => feed.appendChild(el('div')));
    p1.append(card, row, feed);

    const p2 = el('div', { class: 'pt-panel', hidden: true });
    const logs = el('div', { class: 'pt-logs' });
    const items = el('div', { class: 'row', role: 'group', 'aria-label': 'Items in the merged cart' });
    const itemBtns = new Map<string, HTMLButtonElement>();
    for (const it of [...new Set(sim.MERGE_ROUNDS.flatMap(sim.candidates))]) {
      const b = el('button', { class: 'chip', type: 'button', 'data-item': it, 'aria-pressed': 'false' }, it);
      b.addEventListener('click', () => toggleItem(it));
      items.appendChild(b);
      itemBtns.set(it, b);
    }
    const merge = el('button', { class: 'btn go', type: 'button', id: 'pt-merge' }, 'Merge');
    merge.addEventListener('click', doMerge);
    p2.append(logs, el('p', { class: 'eyebrow', style: 'margin:0' }, 'Merged cart (click to include)'), items, merge);

    const p3 = el('div', { class: 'pt-panel', hidden: true });
    const sysBtns = sim.SYSTEMS.map((s, i) => {
      const r = el('div', { class: 'pt-sys', 'data-sysrow': i }, `<div><b>${esc(s.name)}</b><span class="small">${esc(s.detail)}</span></div>`);
      const cp = el('button', { class: 'chip', type: 'button', 'data-sys': i, 'data-pick': 'cp' }, 'CP');
      const ap = el('button', { class: 'chip', type: 'button', 'data-sys': i, 'data-pick': 'ap' }, 'AP');
      onPress(cp, () => classify(i, true));
      onPress(ap, () => classify(i, false));
      const g = el('div', { class: 'row' });
      g.append(cp, ap);
      r.appendChild(g);
      p3.appendChild(r);
      return { r, cp, ap };
    });
    stage.append(status, map, cutBtn, p1, p2, p3);

    const flow = makeFlow(api, meta, INFO, (t) => {
      if (t === 0) { cut = false; prompt = sim.TUTORIAL_PROMPT; }
      if (t === 1) { cut = true; pi = 0; prompt = sim.PROMPTS[0]; log.length = 0; }
      if (t === 2) { cut = false; round = 0; chosen = new Set(); }
      if (t === 3) sorted.clear();
    }, render);

    // ---------- render ----------
    function render() {
      const t = flow.task;
      p1.hidden = t > 1;
      p2.hidden = t !== 2;
      p3.hidden = t !== 3;
      cutBtn.hidden = !(t === 0);
      map.hidden = t === 3;
      stage.querySelector('#pt-link')!.classList.toggle('cut', cut);
      const s1 = stage.querySelector('#pt-s1')!, s2 = stage.querySelector('#pt-s2')!;
      if (t <= 1) {
        card.innerHTML = cut || t === 1 ? `<span class="tag ${prompt.side === 'NY' ? 'okt' : 'vt'}">${prompt.side === 'NY' ? 'New York' : 'London'}</span> <span class="tag">${prompt.kind}</span><p>${esc(prompt.text)}</p>` : '<p class="small">The link is up. All replicas agree.</p>';
        s1.innerHTML = `link <b>${cut ? 'CUT' : 'up'}</b>`;
        s2.innerHTML = t === 1 ? `write <b>${Math.min(pi + 1, sim.PROMPTS.length)}/${sim.PROMPTS.length}</b>` : '';
        feedLines.forEach((d, i) => setText(d, log[i] ?? ''));
        flow.progress(t === 1 ? `Decided: ${pi} / ${sim.PROMPTS.length}` : '');
      } else if (t === 2) {
        const r = sim.MERGE_ROUNDS[Math.min(round, sim.MERGE_ROUNDS.length - 1)];
        const ops = (o: sim.MergeRound['ny']) => o.map((x) => `<li class="${x.op}">${x.op === 'add' ? '+ add' : '− remove'} ${x.item}</li>`).join('');
        logs.innerHTML = `<div class="pt-log"><p class="eyebrow">Before the partition</p><p>${r.before.join(', ')}</p></div>
          <div class="pt-log"><p class="eyebrow">New York did</p><ul>${ops(r.ny)}</ul><p class="small">NY cart: ${sim.sideCart(r, 'NY').join(', ')}</p></div>
          <div class="pt-log"><p class="eyebrow">London did</p><ul>${ops(r.london)}</ul><p class="small">London cart: ${sim.sideCart(r, 'London').join(', ')}</p></div>`;
        const cands = new Set(sim.candidates(r));
        itemBtns.forEach((b, it) => {
          b.hidden = !cands.has(it);
          b.setAttribute('aria-pressed', String(chosen.has(it)));
        });
        s1.innerHTML = `cart <b>${Math.min(round + 1, sim.MERGE_ROUNDS.length)}/${sim.MERGE_ROUNDS.length}</b>`;
        s2.innerHTML = `link <b>healed</b>`;
        flow.progress(`Carts merged: ${round} / ${sim.MERGE_ROUNDS.length}`);
      } else {
        sysBtns.forEach((u, i) => u.r.classList.toggle('done', sorted.has(i)));
        s1.innerHTML = `sorted <b>${sorted.size}/${sim.SYSTEMS.length}</b>`;
        s2.innerHTML = '';
        flow.progress(`Sorted: ${sorted.size} / ${sim.SYSTEMS.length}`);
      }
      if (!flow.coachBetween() && flow.phase === 'play') api.coach.say(...coachLine());
    }

    function coachLine(): [string, 'act' | 'watch'] {
      const t = flow.task;
      if (t === 1) return [`A ${prompt.kind} write arrived in <b>${prompt.side === 'NY' ? 'New York (majority)' : 'London (cut off)'}</b>. Accept or reject?`, 'act'];
      if (t === 2) return ['Pick every item the merged cart should hold, then press <b>Merge</b>.', 'act'];
      if (t === 3) return ['For each system: <b>CP</b> or <b>AP</b>?', 'act'];
      return ['', 'watch'];
    }

    // ---------- actions ----------
    function doCut() {
      if (flow.guard()) return;
      if (flow.task !== 0 || cut) return;
      cut = true;
      api.hit('partition!', cutBtn);
      api.coach.did('cut');
      render();
    }

    function doDecide(accept: boolean) {
      if (flow.guard()) return;
      if (flow.task > 1) return;
      if (flow.phase === 'tutorial') {
        if (api.coach.step !== 'accept') return api.toast('Tutorial: click Cut the link (highlighted).');
        if (!accept) return api.toast('Tutorial: New York has the majority. Click Accept.');
        api.hit('accepted', acc);
        api.coach.did('accept');
        return;
      }
      api.move();
      const r = sim.decide(prompt, accept);
      const b = accept ? acc : rej;
      log.unshift(`${accept ? 'Accepted' : 'Rejected'}: ${prompt.text}${r.ok ? '' : ' ✕'}`);
      if (r.ok) api.hit(accept ? 'accepted' : 'rejected', b);
      else {
        api.mistake(accept ? 'double-spend risk' : 'user refused', b);
        api.toast(r.why);
      }
      pi++;
      if (pi >= sim.PROMPTS.length) {
        render();
        return flow.done();
      }
      prompt = sim.PROMPTS[pi];
      render();
    }

    function toggleItem(it: string) {
      if (flow.guard()) return;
      if (flow.task !== 2) return;
      chosen.has(it) ? chosen.delete(it) : chosen.add(it);
      render();
    }

    function doMerge() {
      if (flow.guard()) return;
      if (flow.task !== 2) return;
      api.move();
      const r = sim.checkMerge(sim.MERGE_ROUNDS[round], [...chosen]);
      if (!r.ok) {
        api.mistake('lost a change', merge);
        api.toast(r.missing.length ? `Missing: ${r.missing.join(', ')}. A user added (or never removed) ${r.missing.length > 1 ? 'those' : 'that'}.` : `Shouldn’t be there: ${r.extra.join(', ')}. A user removed it and nobody added it back.`);
        return;
      }
      api.hit('merged', merge);
      round++;
      chosen = new Set();
      if (round >= sim.MERGE_ROUNDS.length) {
        render();
        return flow.done();
      }
      api.toast('Merged. Here is another cart.');
      render();
    }

    function classify(i: number, cp: boolean) {
      if (flow.guard()) return;
      if (flow.task !== 3) return;
      if (sorted.has(i)) return api.toast('Already sorted.');
      api.move();
      const s = sim.SYSTEMS[i];
      const b = cp ? sysBtns[i].cp : sysBtns[i].ap;
      if (cp !== s.cp) {
        api.mistake('other way', b);
        api.toast(s.why);
        return;
      }
      sorted.add(i);
      api.hit(cp ? 'CP' : 'AP', b);
      b.setAttribute('aria-pressed', 'true');
      render();
      if (sorted.size >= sim.SYSTEMS.length) flow.done();
    }

    render();
    return () => flow.dispose();
  },
};
