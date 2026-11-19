/** Cache Hit view. Slots, key bars and the hit strip are built once; frames update text and classes. */
import { el, onPress, setAttr, setText } from '../../lib/dom';
import { mulberry32 } from '../../lib/rng';
import { makeFlow } from '../flow';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

const INFO = [
  { h: 'Tutorial: fill the cache', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'You are the cache', p: `Requests keep coming. Hits are served automatically. On a <b>miss</b>, click a slot to keep that page (evicting whatever is there), or press Skip. Reach a <b>${sim.HIT_GOAL * 100}% hit rate</b> over the last ${sim.WINDOW} requests. Watch the “seen” counts: they tell you which pages are popular.` },
  { h: 'LRU or LFU?', p: 'Real caches evict automatically. <b>LRU</b> throws out the page used longest ago; <b>LFU</b> throws out the page used least often. Read each traffic pattern, pick the policy that keeps the most hits, and press <b>Run</b>.' },
  { h: 'Stale prices', p: `The cache holds the price of shoes for an hour. Three times, an admin changes the price in the database. Each time, <b>invalidate</b> (delete) the cached price before a shopper reads the old one.` },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    const rng = mulberry32(api.seed);
    let bh = sim.createByHand(0, rng);
    let st = sim.createStale(rng);
    const chosen: (sim.Policy | null)[] = [null, null];
    const solved = [false, false];
    let alive = true;

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="ch-s1"></span><span id="ch-s2"></span>`);
    // tasks 0–1
    const p1 = el('div', { class: 'ch-panel' });
    const req = el('div', { class: 'ch-req', id: 'ch-req', 'aria-live': 'polite' });
    const skipBtn = el('button', { class: 'btn ghost', type: 'button', id: 'ch-skip' }, 'Skip (don’t cache)');
    skipBtn.addEventListener('click', () => doSkip());
    const reqRow = el('div', { class: 'row ch-reqrow' });
    reqRow.append(req, skipBtn);
    const slotsBox = el('div', { class: 'ch-slots', role: 'group', 'aria-label': 'Cache slots' });
    const slotBtns = Array.from({ length: sim.SLOTS }, (_, i) => {
      const b = el('button', { class: 'ch-slot', type: 'button', 'data-slot': i }, `<span class="k"></span><span class="n"></span>`);
      onPress(b, () => clickSlot(i));
      slotsBox.appendChild(b);
      return b;
    });
    const db = el('div', { class: 'ch-db' }, '<b>Database</b><span class="small">300 ms per read</span>');
    const keyBars = el('div', { class: 'ch-keys', 'aria-label': 'How often each page was requested' });
    const bars = sim.KEYS.map((k) => {
      const r = el('div', { class: 'ch-key' }, `<span class="nm">${k}</span><span class="bar"><i></i></span><span class="c"></span>`);
      keyBars.appendChild(r);
      return { r, i: r.querySelector('i')!, c: r.querySelector<HTMLElement>('.c')! };
    });
    const strip = el('div', { class: 'strip ch-strip', 'aria-label': `Last ${sim.WINDOW} requests: green hit, red miss` });
    const cells = Array.from({ length: sim.WINDOW }, () => strip.appendChild(el('span')));
    p1.append(reqRow, el('div', { class: 'ch-cachebox' }), keyBars, strip);
    p1.querySelector('.ch-cachebox')!.append(el('p', { class: 'eyebrow', style: 'margin:0 0 6px' }, 'Cache (4 slots · 2 ms)'), slotsBox, db);
    // task 2
    const p2 = el('div', { class: 'ch-panel', hidden: true });
    const patUi = sim.PATTERNS.map((pat, i) => {
      const card = el('div', { class: 'ch-pat' }, `<h3>${pat.title}</h3><p class="small">${pat.text}</p>`);
      const row = el('div', { class: 'row' });
      const pol = (['lru', 'lfu'] as sim.Policy[]).map((p) => {
        const b = el('button', { class: 'chip', type: 'button', 'data-pat': i, 'data-pol': p, 'aria-pressed': 'false' }, p.toUpperCase());
        b.addEventListener('click', () => pick(i, p));
        row.appendChild(b);
        return b;
      });
      const run = el('button', { class: 'btn go', type: 'button', 'data-run': i }, 'Run');
      run.addEventListener('click', () => runPat(i));
      row.appendChild(run);
      const out = el('p', { class: 'ch-out', 'data-out': i });
      card.append(row, out);
      p2.appendChild(card);
      return { card, pol, run, out };
    });
    // task 3
    const p3 = el('div', { class: 'ch-panel', hidden: true });
    const stCache = el('div', { class: 'ch-stbox' }, `<p class="eyebrow">Cache</p><div class="big" id="ch-cprice"></div>`);
    const inv = el('button', { class: 'btn go', type: 'button', id: 'ch-inv' }, 'Invalidate price:shoes');
    onPress(inv, () => doInvalidate());
    stCache.appendChild(inv);
    const stDb = el('div', { class: 'ch-stbox db' }, `<p class="eyebrow">Database</p><div class="big" id="ch-dprice"></div>`);
    const stRow = el('div', { class: 'ch-strow' });
    stRow.append(stCache, stDb);
    const feed = el('div', { class: 'feed', id: 'ch-feed' });
    const feedLines = Array.from({ length: 6 }, () => feed.appendChild(el('div')));
    p3.append(stRow, feed);
    stage.append(status, p1, p2, p3);

    // ---------- flow ----------
    const flow = makeFlow(api, meta, INFO, (t) => {
      if (t <= 1) bh = sim.createByHand(t, rng);
      if (t === 3) st = sim.createStale(rng);
    }, render);

    // ---------- render ----------
    function render() {
      const t = flow.task;
      p1.hidden = t > 1;
      p2.hidden = t !== 2;
      p3.hidden = t !== 3;
      const s1 = stage.querySelector('#ch-s1')!, s2 = stage.querySelector('#ch-s2')!;
      if (t <= 1) {
        const hr = sim.hitRate(bh);
        s1.innerHTML = `hit rate <b>${Math.round(hr * 100)}%</b> of last ${bh.window.length}`;
        s2.innerHTML = `avg read <b>${bh.window.length ? Math.round(hr * sim.CACHE_MS + (1 - hr) * sim.DB_MS) : '–'} ms</b>`;
        drawByHand();
        flow.progress(`Hit rate: ${Math.round(hr * 100)}% over the last ${bh.window.length} / ${sim.WINDOW} requests (goal ${sim.HIT_GOAL * 100}%)`);
      } else if (t === 2) {
        s1.innerHTML = `patterns solved <b>${solved.filter(Boolean).length}/2</b>`;
        s2.innerHTML = '';
        patUi.forEach((u, i) => {
          u.pol.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pol === chosen[i])));
          u.card.classList.toggle('done', solved[i]);
        });
        flow.progress(`Patterns solved: ${solved.filter(Boolean).length} / 2`);
      } else {
        s1.innerHTML = `price changes <b>${st.updatesDone}/${sim.PRICE_UPDATES}</b>`;
        s2.innerHTML = `stale reads <b>${st.staleReads}</b>`;
        drawStale();
        flow.progress(`Price changes handled: ${Math.min(st.freshAfterUpdate, st.updatesDone)} / ${sim.PRICE_UPDATES}`);
      }
      if (!flow.coachBetween() && flow.phase === 'play') api.coach.say(...coachLine());
    }

    function drawByHand() {
      const maxSeen = Math.max(1, ...Object.values(bh.seen));
      slotBtns.forEach((b, i) => {
        const k = bh.slots[i];
        setText(b.querySelector('.k')!, k ?? 'empty');
        setText(b.querySelector('.n')!, k ? `seen ${bh.seen[k]}×` : '');
        b.classList.toggle('empty', !k);
        b.classList.toggle('pick', !!bh.pending);
        b.classList.toggle('lit', !!bh.last?.hit && bh.last.key === k && !bh.pending);
        setAttr(b, 'aria-label', `Slot ${i + 1}: ${k ? `${k}, seen ${bh.seen[k]} times` : 'empty'}. ${bh.pending ? `Activate to store ${bh.pending} here.` : ''}`);
      });
      bars.forEach((b, i) => {
        const k = sim.KEYS[i];
        b.i.style.width = `${(100 * bh.seen[k]) / maxSeen}%`;
        setText(b.c, String(bh.seen[k]));
        b.r.classList.toggle('cached', bh.slots.includes(k));
      });
      cells.forEach((c, i) => {
        const v = bh.window[i];
        const cls = v === undefined ? '' : v ? 'ok' : 'x';
        if (c.className !== cls) c.className = cls;
      });
      req.innerHTML = bh.pending
        ? `<span class="tag bad">MISS</span> <b>${bh.pending}</b> came from the database (300 ms). Keep it?`
        : bh.last
          ? `<span class="tag ${bh.last.hit ? 'okt' : ''}">${bh.last.hit ? 'HIT' : 'MISS'}</span> <b>${bh.last.key}</b> ${bh.last.hit ? 'served from the cache in 2 ms' : ''}`
          : 'Waiting for requests…';
      skipBtn.hidden = !bh.pending || flow.phase === 'tutorial';
    }

    function drawStale() {
      setText(stage.querySelector('#ch-cprice')!, st.cached === null ? '(empty)' : `$${st.cached}`);
      setText(stage.querySelector('#ch-dprice')!, `$${st.dbPrice}`);
      stCache.classList.toggle('stale', st.cached !== null && st.cached !== st.dbPrice);
      feedLines.forEach((d, i) => setText(d, st.log[i] ?? ''));
    }

    function coachLine(): [string, 'act' | 'watch'] {
      const t = flow.task;
      if (t === 1) return bh.pending ? [`MISS: <b>${bh.pending}</b>. Click a slot to keep it (evicting the page there), or Skip. Keep the popular pages!`, 'act'] : ['Requests keep coming. Hits are served from the cache in 2 ms.', 'watch'];
      if (t === 2) return ['For each traffic pattern, pick <b>LRU</b> or <b>LFU</b>, then press <b>Run</b>.', 'act'];
      if (t === 3) return st.cached !== null && st.cached !== st.dbPrice ? ['The database changed but the cache still has the old price. <b>Invalidate it now!</b>', 'act'] : ['Shoppers are reading the shoe price. Watch for changes in the database.', 'watch'];
      return ['', 'watch'];
    }

    // ---------- actions ----------
    function clickSlot(i: number) {
      if (flow.guard()) return;
      if (flow.task > 1) return;
      if (flow.phase === 'tutorial') {
        const want = api.coach.step === 'slot0' ? 0 : 1;
        if (i !== want) return api.toast('Tutorial: click the highlighted slot.');
      }
      if (!bh.pending) return api.toast('Nothing to store right now. Wait for a miss.');
      api.move();
      const key = bh.pending;
      const r = sim.place(bh, i)!;
      if (r.badEviction) {
        api.mistake('evicted a hot page', slotBtns[i]);
        api.toast(`You evicted ${r.evicted} (seen ${bh.seen[r.evicted!]}×) for ${key} (seen ${bh.seen[key]}×). Keep the popular pages, evict the rare ones.`);
      } else if (flow.phase === 'tutorial') {
        api.hit('cached', slotBtns[i]);
        api.coach.did(api.coach.step!);
        if (api.coach.step === 'slot1') sim.miss(bh, 'shoes');
      } else api.toast(r.evicted ? `Stored ${key}, evicted ${r.evicted}.` : `Stored ${key}.`);
      render();
    }

    function doSkip() {
      if (flow.guard()) return;
      if (!bh.pending) return;
      api.move();
      sim.skip(bh);
      render();
    }

    function pick(i: number, p: sim.Policy) {
      if (flow.guard()) return;
      if (flow.task !== 2) return api.toast('Policies come in the next task.');
      chosen[i] = p;
      render();
    }

    function runPat(i: number) {
      if (flow.guard()) return;
      if (flow.task !== 2) return api.toast('Policies come in the next task.');
      if (solved[i]) return api.toast('Already solved. Try the other pattern.');
      const p = chosen[i];
      if (!p) return api.toast('Pick LRU or LFU first.');
      api.move();
      const pat = sim.PATTERNS[i];
      const rate = sim.policyRate(p, pat);
      const best = sim.bestPolicy(pat);
      const u = patUi[i];
      if (p === best) {
        solved[i] = true;
        u.out.innerHTML = `<b class="okc">${p.toUpperCase()}: ${Math.round(rate * 100)}% hits.</b> The other policy gets ${Math.round(sim.policyRate(p === 'lru' ? 'lfu' : 'lru', pat) * 100)}%.`;
        api.hit(`${Math.round(rate * 100)}% hits`, u.run);
        render();
        if (solved.every(Boolean)) flow.done();
        return;
      }
      u.out.innerHTML = `<b class="badc">${p.toUpperCase()}: only ${Math.round(rate * 100)}% hits.</b>`;
      api.mistake('wrong policy', u.run);
      api.toast(pat.id === 'scan' ? 'LRU treats every archive page as “recently used”, so the one-off scan pushes the hot pages out.' : 'LFU keeps yesterday’s pages because they were used so often; the new sale pages never stay long enough to count.');
      render();
    }

    function doInvalidate() {
      if (flow.guard()) return;
      if (flow.task !== 3) return api.toast('Invalidation is used in the last task.');
      api.move();
      const r = sim.invalidate(st);
      if (r === 'fixed') api.hit('invalidated', inv);
      else api.toast('The cached price was already correct. Deleting it just costs the next shopper a 300 ms database read.');
      render();
    }

    // ---------- loop ----------
    let last = performance.now();
    let raf = 0;
    function frame(t: number) {
      if (!alive) return;
      const dt = Math.min(100, t - last);
      last = t;
      if (flow.phase === 'play' && flow.task === 1) {
        let changed = false;
        for (const e of sim.stepByHand(bh, dt)) {
          changed = true;
          if (e.type === 'hit') api.hit('hit', slotBtns[bh.slots.indexOf(e.key)]);
          if (e.type === 'timeout') api.toast(`Too slow: ${e.key} was not cached.`);
        }
        if (changed) render();
        if (sim.byHandDone(bh)) flow.done();
      }
      if (flow.phase === 'play' && flow.task === 3) {
        const ev = sim.stepStale(st, dt);
        for (const e of ev) {
          if (e.type === 'update') api.toast(`An admin changed the price to $${e.price} in the database. The cache does not know!`);
          if (e.type === 'read' && e.stale) {
            api.mistake('stale price', stCache);
            api.toast(`A shopper saw the old price ($${e.price}). Invalidate the cached price!`);
          }
        }
        if (ev.length) render();
        if (sim.staleDone(st)) flow.done();
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    render();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      flow.dispose();
    };
  },
};
