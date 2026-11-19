/** Byzantine Generals view. Turn-based: general cards and controls are built once; render updates text and classes. */
import { el, onPress, setText } from '../../lib/dom';
import { makeFlow } from '../flow';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

const INFO = [
  { h: 'Tutorial: hear, then decide', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'You are the traitor', p: `Three generals: commander C and lieutenants L1, L2. You are the traitor. Each round the loyal generals use a rule (shown above the buttons). Pick your messages and press <b>Send</b>. You win the round if the loyal generals end up doing <b>different</b> things. <b>${sim.ROUNDS1.length} rounds.</b>` },
  { h: 'Loyal among four', p: `Now there are 4 generals and 1 traitor, and you are loyal lieutenant L1. Each round: <b>Hear the others</b>, then decide <b>Attack</b> or <b>Retreat</b>. You don’t know who the traitor is. <b>${sim.ROUNDS2.length} rounds.</b>` },
  { h: 'Seven generals', p: `Click generals to make them traitors, then press <b>Run</b> to see whether the honest ones still agree. Then answer: how many traitors can ${sim.N3} generals survive, and how many generals do you need to survive 3?` },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    let r1 = 0;
    const pick: { toL1?: sim.V; toL2?: sim.V; relay?: sim.V } = {};
    let r2 = 0;
    let round2: sim.Round2 = sim.TUTORIAL2;
    let relaysShown = false;
    const traitors = new Set<number>();
    let ran: { f: number; ok: boolean } | null = null;
    let maxOk = false;
    let needOk = false;
    const log: string[] = [];

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="bz-s1"></span><span id="bz-s2"></span>`);
    const board = el('div', { class: 'bz-board' });
    const cards = Object.fromEntries((['C', 'L1', 'L2', 'L3'] as sim.Gen[]).map((g) => {
      const c = el('div', { class: 'bz-gen', id: `bz-g-${g}` }, `<b>${g === 'C' ? 'Commander' : g}</b><span class="bz-tag"></span><span class="small bz-got"></span><span class="bz-act"></span>`);
      board.appendChild(c);
      return [g, c];
    })) as unknown as Record<sim.Gen, HTMLElement>;
    const panel = el('div', { class: 'bz-panel' });
    const ruleCard = el('div', { class: 'bz-rule', id: 'bz-rule' });

    // task 1 controls
    const t1 = el('div', { class: 'bz-ctl' });
    const choiceRow = (label: string, key: 'toL1' | 'toL2' | 'relay') => {
      const r = el('div', { class: 'row', role: 'group', 'aria-label': label }, `<span class="small bz-lbl">${label}</span>`);
      for (const v of ['A', 'R'] as sim.V[]) {
        const b = el('button', { class: 'chip', type: 'button', 'data-to': key, 'data-v': v }, sim.WORD[v]);
        b.addEventListener('click', () => setPick(key, v));
        r.appendChild(b);
      }
      t1.appendChild(r);
      return r;
    };
    const rowL1 = choiceRow('Order to L1', 'toL1');
    const rowL2 = choiceRow('Order to L2', 'toL2');
    const rowRelay = choiceRow('Tell L1 the commander said', 'relay');
    const send = el('button', { class: 'btn go', type: 'button', id: 'bz-send' }, 'Send');
    onPress(send, () => doSend());
    t1.appendChild(send);

    // tasks 0 and 2 controls
    const t2 = el('div', { class: 'bz-ctl' });
    const relayBtn = el('button', { class: 'btn go', type: 'button', id: 'bz-relay' }, 'Hear the others');
    onPress(relayBtn, () => doRelay());
    const dRow = el('div', { class: 'row' });
    for (const v of ['A', 'R'] as sim.V[]) {
      const b = el('button', { class: `btn ghost as-btn bz-${v}`, type: 'button', 'data-decide': v }, sim.WORD[v][0].toUpperCase() + sim.WORD[v].slice(1));
      onPress(b, () => doDecide(v, b));
      dRow.appendChild(b);
    }
    t2.append(relayBtn, dRow);

    // task 3 controls
    const t3 = el('div', { class: 'bz-ctl' });
    const ring = el('div', { class: 'bz-ring', role: 'group', 'aria-label': 'Generals (click to make a traitor)' });
    const genBtns = Array.from({ length: sim.N3 }, (_, i) => {
      const b = el('button', { class: 'bz-g7', type: 'button', 'data-gen': i, 'aria-pressed': 'false' }, `G${i + 1}`);
      onPress(b, () => toggleTraitor(i));
      ring.appendChild(b);
      return b;
    });
    const run = el('button', { class: 'btn go', type: 'button', id: 'bz-run' }, 'Run');
    run.addEventListener('click', doRun);
    const res = el('p', { class: 'bz-res', id: 'bz-res' });
    const qMax = el('div', { class: 'row', role: 'group', 'aria-label': 'Most traitors 7 generals survive' }, `<span class="small bz-lbl">${sim.N3} generals survive at most</span>`);
    for (const v of sim.MAX_CHOICES) {
      const b = el('button', { class: 'chip', type: 'button', 'data-max': v }, `${v}`);
      b.addEventListener('click', () => answer('max', v, b));
      qMax.appendChild(b);
    }
    qMax.appendChild(el('span', { class: 'small' }, 'traitors'));
    const qNeed = el('div', { class: 'row', role: 'group', 'aria-label': 'Generals needed for 3 traitors' }, '<span class="small bz-lbl">To survive 3 traitors you need</span>');
    for (const v of sim.NEED_CHOICES) {
      const b = el('button', { class: 'chip', type: 'button', 'data-need': v }, `${v}`);
      b.addEventListener('click', () => answer('need', v, b));
      qNeed.appendChild(b);
    }
    qNeed.appendChild(el('span', { class: 'small' }, 'generals'));
    t3.append(ring, run, res, qMax, qNeed);

    const feed = el('div', { class: 'feed' });
    const feedLines = Array.from({ length: 3 }, () => feed.appendChild(el('div')));
    panel.append(ruleCard, t1, t2, t3, feed);
    stage.append(status, board, panel);

    const flow = makeFlow(api, meta, INFO, (t) => {
      log.length = 0;
      if (t === 0) { round2 = sim.TUTORIAL2; relaysShown = false; }
      if (t === 1) { r1 = 0; clearPick(); }
      if (t === 2) { r2 = 0; round2 = sim.ROUNDS2[0]; relaysShown = false; }
      if (t === 3) { traitors.clear(); ran = null; maxOk = false; needOk = false; res.textContent = ''; }
    }, render);

    function clearPick() {
      delete pick.toL1;
      delete pick.toL2;
      delete pick.relay;
    }

    // ---------- render ----------
    function setCard(g: sim.Gen, tag: string, cls: string, got: string, act: string) {
      const c = cards[g];
      c.className = `bz-gen ${cls}`;
      setText(c.querySelector('.bz-tag')!, tag);
      setText(c.querySelector('.bz-got')!, got);
      setText(c.querySelector('.bz-act')!, act);
    }

    function render() {
      const t = flow.task;
      board.hidden = t === 3;
      t1.hidden = t !== 1;
      t2.hidden = !(t === 0 || t === 2);
      t3.hidden = t !== 3;
      ruleCard.hidden = t === 3;
      const s1 = stage.querySelector('#bz-s1')!, s2 = stage.querySelector('#bz-s2')!;
      if (t === 1) {
        const r = sim.ROUNDS1[Math.min(r1, sim.ROUNDS1.length - 1)];
        cards.L3.hidden = true;
        rowL1.hidden = rowL2.hidden = r.you !== 'C';
        rowRelay.hidden = r.you !== 'L2';
        stage.querySelectorAll<HTMLElement>('[data-to]').forEach((b) => b.setAttribute('aria-pressed', String(pick[b.dataset.to as keyof typeof pick] === b.dataset.v)));
        if (r.you === 'C') {
          setCard('C', 'you · traitor', 'you bad', 'choose an order for each lieutenant', '');
          setCard('L1', 'loyal', 'ok', pick.toL1 ? `you order: ${sim.WORD[pick.toL1]}` : '', '');
          setCard('L2', 'loyal', 'ok', pick.toL2 ? `you order: ${sim.WORD[pick.toL2]}` : '', '');
        } else {
          setCard('C', 'loyal', 'ok', `orders everyone: ${sim.WORD[r.order!]}`, `will ${sim.WORD[r.order!]}`);
          setCard('L1', 'loyal', 'ok', `heard from C: ${sim.WORD[r.order!]}`, '');
          setCard('L2', 'you · traitor', 'you bad', `heard from C: ${sim.WORD[r.order!]}`, pick.relay ? `you tell L1: “C said ${sim.WORD[pick.relay]}”` : '');
        }
        ruleCard.innerHTML = `<p class="eyebrow">Round ${Math.min(r1 + 1, sim.ROUNDS1.length)} of ${sim.ROUNDS1.length} · the loyal generals’ rule</p><p>${sim.RULE_TEXT[r.rule]}</p>`;
        s1.innerHTML = `broken <b>${r1}/${sim.ROUNDS1.length}</b>`;
        s2.innerHTML = '';
        flow.progress(`Broken: ${r1} / ${sim.ROUNDS1.length}`);
      } else if (t === 0 || t === 2) {
        cards.L3.hidden = false;
        const r = round2;
        const h = sim.heard(r, 'L1');
        setCard('C', '?', '', 'sent the orders', '');
        setCard('L1', 'you · loyal', 'you', `C ordered you: ${sim.WORD[h[0].v]}`, '');
        setCard('L2', '?', '', relaysShown ? `says C said: ${sim.WORD[h[1].v]}` : '', '');
        setCard('L3', '?', '', relaysShown ? `says C said: ${sim.WORD[h[2].v]}` : '', '');
        ruleCard.innerHTML = `<p class="eyebrow">${t === 2 ? `Round ${Math.min(r2 + 1, sim.ROUNDS2.length)} of ${sim.ROUNDS2.length} · ` : ''}one of C, L2, L3 is a traitor</p><p>${relaysShown ? `You heard: <b>${h.map((x) => sim.WORD[x.v]).join(', ')}</b>.` : 'You have only the commander’s order so far.'}</p>`;
        relayBtn.setAttribute('aria-disabled', String(relaysShown));
        s1.innerHTML = t === 2 ? `round <b>${Math.min(r2 + 1, sim.ROUNDS2.length)}/${sim.ROUNDS2.length}</b>` : '';
        s2.innerHTML = '';
        flow.progress(t === 2 ? `Decided: ${r2} / ${sim.ROUNDS2.length}` : '');
      } else {
        genBtns.forEach((b, i) => {
          b.classList.toggle('bad', traitors.has(i));
          b.classList.toggle('split-a', !!ran && !ran.ok && !traitors.has(i) && i % 2 === 0);
          b.classList.toggle('split-r', !!ran && !ran.ok && !traitors.has(i) && i % 2 === 1);
          b.classList.toggle('agree', !!ran && ran.ok && !traitors.has(i));
          b.setAttribute('aria-pressed', String(traitors.has(i)));
        });
        stage.querySelectorAll<HTMLElement>('[data-max]').forEach((b) => b.classList.toggle('ok', maxOk && Number(b.dataset.max) === sim.MAX_TRAITORS));
        stage.querySelectorAll<HTMLElement>('[data-need]').forEach((b) => b.classList.toggle('ok', needOk && Number(b.dataset.need) === sim.NEED_FOR_3));
        s1.innerHTML = `traitors <b>${traitors.size}</b> of ${sim.N3}`;
        s2.innerHTML = `answered <b>${Number(maxOk) + Number(needOk)}/2</b>`;
        flow.progress(`Answered: ${Number(maxOk) + Number(needOk)} / 2`);
      }
      feedLines.forEach((d, i) => setText(d, log[i] ?? ''));
      if (!flow.coachBetween() && flow.phase === 'play') api.coach.say(...coachLine());
    }

    function coachLine(): [string, 'act' | 'watch'] {
      const t = flow.task;
      if (t === 1) {
        const r = sim.ROUNDS1[Math.min(r1, sim.ROUNDS1.length - 1)];
        return [r.you === 'C' ? 'Pick an order for L1 and for L2, then <b>Send</b>. Make them do different things.' : 'Pick what you tell L1 the commander said, then <b>Send</b>. Make L1 act differently from C.', 'act'];
      }
      if (t === 2) return relaysShown ? ['Take the majority of the three reports: <b>Attack</b> or <b>Retreat</b>?', 'act'] : ['Click <b>Hear the others</b> first.', 'act'];
      if (t === 3) {
        if (!ran) return ['Click generals to make them traitors, then press <b>Run</b>.', 'act'];
        if (!maxOk) return ['Try different numbers of traitors. How many can 7 generals survive?', 'act'];
        return ['Now: how many generals do you need to survive 3 traitors?', 'act'];
      }
      return ['', 'watch'];
    }

    // ---------- actions ----------
    function setPick(key: 'toL1' | 'toL2' | 'relay', v: sim.V) {
      if (flow.guard()) return;
      if (flow.task !== 1) return;
      pick[key] = v;
      render();
    }

    function doSend() {
      if (flow.guard()) return;
      if (flow.task !== 1) return;
      const r = sim.ROUNDS1[r1];
      if (r.you === 'C' && (!pick.toL1 || !pick.toL2)) return api.toast('Pick an order for both L1 and L2 first.');
      if (r.you === 'L2' && !pick.relay) return api.toast('Pick what you tell L1 first.');
      api.move();
      const out = sim.play1(r, pick);
      const acts = Object.entries(out.actions).map(([g, v]) => `${g} ${sim.WORD[v]}s`).join(', ');
      if (!out.broken) {
        api.mistake('they agree', send);
        api.toast(`The loyal generals agree (${acts}). Make them do different things.`);
        log.unshift(`✕ ${acts}`);
        render();
        return;
      }
      api.hit('broken!', send);
      log.unshift(`✓ ${acts}`);
      api.toast(r.you === 'C'
        ? `${acts}: half an army attacks alone. The lieutenants each trusted a different order.`
        : `${acts}. L1 heard “attack” and “retreat” and couldn’t tell who lied, so its rule picked wrong.`);
      r1++;
      clearPick();
      render();
      if (r1 >= sim.ROUNDS1.length) flow.done();
    }

    function doRelay() {
      if (flow.guard()) return;
      if (flow.task !== 0 && flow.task !== 2) return;
      if (flow.phase === 'tutorial') {
        if (api.coach.step !== 'relay') return api.toast('Tutorial: click Attack (highlighted).');
        relaysShown = true;
        api.hit('reports in', relayBtn);
        api.coach.did('relay');
        render();
        return;
      }
      if (relaysShown) return api.toast('You have all the reports. Now decide.');
      api.move();
      relaysShown = true;
      render();
    }

    function doDecide(v: sim.V, b: HTMLElement) {
      if (flow.guard()) return;
      if (flow.task !== 0 && flow.task !== 2) return;
      if (flow.phase === 'tutorial') {
        if (api.coach.step !== 'decide') return api.toast('Tutorial: click Hear the others first (highlighted).');
        if (v !== 'A') return api.toast('Tutorial: all three say attack. Click Attack.');
        api.hit('attack!', b);
        api.coach.did('decide');
        return;
      }
      if (!relaysShown) {
        api.mistake('decided blind', b);
        return api.toast('The commander might be the traitor. Hear what L2 and L3 were told before deciding.');
      }
      api.move();
      const want = sim.decide2(round2, 'L1');
      const others = sim.loyalLts(round2).filter((l) => l !== 'L1').map((l) => `${l} ${sim.WORD[sim.decide2(round2, l)]}s`).join(', ');
      const who = round2.traitor === 'C' ? 'the commander' : round2.traitor;
      if (v !== want) {
        api.mistake('outvoted', b);
        api.toast(`The majority of what you heard was ${sim.WORD[want]}. Go with the majority: one liar can only spoil one report.`);
        return;
      }
      api.hit(sim.WORD[v], b);
      log.unshift(`✓ you ${sim.WORD[v]} · ${others} · traitor was ${who}`);
      api.toast(`All loyal lieutenants agree: ${others ? `${others}, ` : ''}you ${sim.WORD[v]}. The traitor was ${who}.`);
      r2++;
      relaysShown = false;
      if (r2 >= sim.ROUNDS2.length) {
        render();
        return flow.done();
      }
      round2 = sim.ROUNDS2[r2];
      render();
    }

    function toggleTraitor(i: number) {
      if (flow.guard()) return;
      if (flow.task !== 3) return;
      traitors.has(i) ? traitors.delete(i) : traitors.add(i);
      ran = null;
      res.textContent = '';
      render();
    }

    function doRun() {
      if (flow.guard()) return;
      if (flow.task !== 3) return;
      api.move();
      const f = traitors.size;
      const ok = sim.tolerates(sim.N3, f);
      ran = { f, ok };
      res.className = `bz-res ${ok ? 'okc' : 'badc'}`;
      res.textContent = `${f} traitor${f === 1 ? '' : 's'}: ${ok ? 'the honest generals agree.' : 'the honest generals SPLIT.'} ${sim.explainRun(sim.N3, f)}`;
      if (!ok) api.hit('broken!', run);
      render();
    }

    function answer(kind: 'max' | 'need', v: number, b: HTMLElement) {
      if (flow.guard()) return;
      if (flow.task !== 3) return;
      if ((kind === 'max' && maxOk) || (kind === 'need' && needOk)) return api.toast('Already answered.');
      api.move();
      const want = kind === 'max' ? sim.MAX_TRAITORS : sim.NEED_FOR_3;
      if (v !== want) {
        api.mistake('not quite', b);
        api.toast(kind === 'max'
          ? (sim.tolerates(sim.N3, v) ? `${v} traitors can’t break ${sim.N3} generals. Try more.` : `Run it with ${v} traitors: the honest generals split.`)
          : `${v} generals with 3 traitors: ${v} ≥ 3 × 3 + 1 = 10? ${v >= 10 ? 'Yes, but fewer would do.' : 'No.'} Find the smallest N that works.`);
        return;
      }
      if (kind === 'max') maxOk = true;
      else needOk = true;
      api.hit(kind === 'max' ? `${v} traitors` : `${v} generals`, b);
      render();
      if (maxOk && needOk) flow.done();
    }

    render();
    return () => flow.dispose();
  },
};
