/** DNS Detective view. Buttons are built once; each click updates text and classes. No animation loop. */
import { el, esc, onPress, setAttr, setText } from '../../lib/dom';
import { mulberry32 } from '../../lib/rng';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

type Phase = 'pre' | 'tutorial' | 'play' | 'between' | 'done';

const INFO = [
  { h: 'Tutorial: one lookup', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'Walk the tree', p: 'Resolve <b>4 names</b>. For each: laptop asks the resolver, the resolver asks the root, then the right TLD, then the name’s own server. Read the log: each server tells you where to go next.' },
  { h: 'Use the cache', p: 'The resolver now remembers answers. Some names come up twice. For a name already in the cache, click <b>Answer from cache</b> instead of walking the tree again.' },
  { h: 'The record moved', p: 'An hour ago, ops moved <b>api.shop.com</b> to a new server (198.51.100.99). Your cache was filled before that. Answer 4 lookups, and never send a user to the old server.' },
  { h: 'Pick the TTL', p: 'The TTL tells every resolver how long it may reuse an answer. Pick one for each record, then press <b>Run a day</b> to see what happens.' },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    const rng = mulberry32(api.seed);
    let task = 0;
    let s = sim.create(0, rng);
    let phase: Phase = 'pre';
    let scenario = 0;
    let pickedTtl: number | null = null;
    let betweenT = 0;

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span>looking up <b id="dns-name"></b></span><span>answered <b id="dns-done"></b></span><span>cache <b id="dns-cachen"></b></span>`);
    const notice = el('div', { class: 'dns-notice', id: 'dns-notice', hidden: true }, `⚠ Ops moved <b>api.shop.com</b> → ${sim.NEW_IP} an hour ago.`);
    const path = el('div', { class: 'dns-path', id: 'dns-path', 'aria-label': 'Lookup path so far' });
    const grid = el('div', { class: 'dns-grid' });
    const left = el('div', { class: 'dns-left' });
    const laptop = el('div', { class: 'dns-box dns-laptop' }, `<span class="nm">Your laptop</span><span class="small" id="dns-ask"></span>`);
    const btn: Partial<Record<sim.NodeId, HTMLButtonElement>> = {};
    const mk = (id: sim.NodeId, cls = '') => {
      const b = el('button', { class: `dns-node ${cls}`, type: 'button', 'data-node': id }, `<span class="nm">${sim.NODE_LABEL[id]}</span><span class="sub"></span>`);
      onPress(b, () => clickNode(id));
      btn[id] = b;
      return b;
    };
    const cacheBox = el('div', { class: 'dns-cache' }, `<p class="eyebrow" style="margin:0 0 6px">Resolver cache</p><ul id="dns-cache" class="dns-cachelist"></ul>`);
    const cacheBtn = mk('cache', 'cachebtn');
    btn.cache!.querySelector('.nm')!.textContent = 'Answer from cache';
    cacheBox.appendChild(cacheBtn);
    left.append(laptop, mk('resolver', 'resolver'), cacheBox);
    const tree = el('div', { class: 'dns-tree' });
    const row = (ids: sim.NodeId[], label: string) => {
      const r = el('div', { class: 'dns-row' }, `<span class="dns-lvl">${label}</span>`);
      ids.forEach((id) => r.appendChild(mk(id)));
      return r;
    };
    tree.append(row(['root'], 'root'), row(['tld-com', 'tld-io', 'tld-org'], 'TLD'), row(['auth-shop', 'auth-cloud', 'auth-learn'], 'authoritative'));
    grid.append(left, tree);
    const log = el('div', { class: 'feed dns-log', id: 'dns-log', 'aria-live': 'polite' });
    const logLines = Array.from({ length: 4 }, () => log.appendChild(el('div')));
    // TTL panel (task 4)
    const ttl = el('div', { class: 'dns-ttl', id: 'dns-ttl', hidden: true });
    const scTitle = el('h3', { id: 'dns-sc-title' });
    const scText = el('p', { id: 'dns-sc-text', style: 'margin:4px 0 10px' });
    const chips = el('div', { class: 'row', role: 'group', 'aria-label': 'TTL' }, `<span class="small">TTL</span>`);
    const ttlBtns = sim.TTL_OPTIONS.map((t) => {
      const b = el('button', { class: 'chip', type: 'button', 'data-ttl': t, 'aria-pressed': 'false' }, sim.ttlLabel(t));
      b.addEventListener('click', () => pickTtl(t));
      chips.appendChild(b);
      return b;
    });
    const run = el('button', { class: 'btn go', type: 'button', id: 'dns-run' }, 'Run a day');
    run.addEventListener('click', runDay);
    chips.appendChild(run);
    const result = el('div', { class: 'dns-result', id: 'dns-result' });
    ttl.append(scTitle, scText, chips, result);
    stage.append(status, notice, path, grid, ttl, log);

    // ---------- render ----------
    function render() {
      const q = s.current;
      setText(stage.querySelector('#dns-name')!, task === 4 ? 'choose a TTL' : q ? q.name : '—');
      setText(stage.querySelector('#dns-done')!, task === 4 ? `${scenario}/${sim.SCENARIOS.length}` : `${s.done}/${s.total}`);
      setText(stage.querySelector('#dns-cachen')!, s.cache.size ? `${s.cache.size} entr${s.cache.size === 1 ? 'y' : 'ies'}` : 'empty');
      setText(stage.querySelector('#dns-ask')!, q ? `wants ${q.name}` : 'idle');
      notice.hidden = task !== 3;
      grid.hidden = task === 4;
      path.hidden = task === 4;
      ttl.hidden = task !== 4;
      cacheBox.hidden = task < 2;
      // path chips
      const hops = q ? ['laptop', 'resolver', 'root', 'TLD', 'authoritative'].slice(0, q.hop + 1) : [];
      path.innerHTML = q ? `<span class="small">Path:</span> ${hops.map((h) => `<span class="hop">${h}</span>`).join('<span class="arr">→</span>')}` : '';
      // cache list (not interactive, rebuilt on change only)
      stage.querySelector('#dns-cache')!.innerHTML = s.cache.size
        ? [...s.cache].map(([n, c]) => `<li class="${c.stale ? 'stale' : ''}"><b>${esc(n)}</b> ${c.ip}</li>`).join('')
        : '<li class="small">empty</li>';
      const want = phase === 'tutorial' || task === 1 ? sim.expected(s) : [];
      (Object.keys(btn) as sim.NodeId[]).forEach((id) => {
        const b = btn[id]!;
        b.classList.toggle('next', phase === 'tutorial' && want.includes(id));
        setAttr(b, 'aria-label', `${id === 'cache' ? 'Answer from the resolver cache' : 'Ask ' + sim.NODE_LABEL[id]}${q ? ' about ' + q.name : ''}`);
      });
      logLines.forEach((d, i) => setText(d, s.log[i] ?? ''));
      // coach
      if (phase === 'play') api.coach.say(...coachLine());
      if (phase === 'between') api.coach.say('Task clear! Read the lesson; press Next above.', 'watch');
      const prog = api.side.querySelector('#dns-prog');
      if (prog) prog.textContent = task === 4 ? `Records set: ${scenario} / ${sim.SCENARIOS.length}` : `Answered: ${s.done} / ${s.total}`;
    }

    function coachLine(): [string, 'act' | 'watch'] {
      if (task === 4) {
        const sc = sim.SCENARIOS[scenario];
        return pickedTtl === null ? [`${sc.title}: pick a TTL, then press <b>Run a day</b>.`, 'act'] : [`TTL ${sim.ttlLabel(pickedTtl)} picked. Press <b>Run a day</b>.`, 'act'];
      }
      const q = s.current;
      if (!q) return ['', 'watch'];
      if (q.hop === 0) return [`Your laptop wants <b>${q.name}</b>. Click the <b>Resolver</b>.`, 'act'];
      if (q.hop === 1) {
        if (task === 2) return [`Is <b>${q.name}</b> in the cache? If so, click <b>Answer from cache</b>. If not, ask the Root.`, 'act'];
        if (task === 3) return [`Check the cache for <b>${q.name}</b>. Is that answer still right after the move?`, 'act'];
        return [`The resolver starts at the top: ask the <b>Root</b> about ${q.name}.`, 'act'];
      }
      if (q.hop === 2) return [`Root sent you to a TLD server. Click the one matching the end of <b>${q.name}</b>.`, 'act'];
      return [`Now ask the server that runs <b>${q.name.split('.').slice(-2).join('.')}</b>.`, 'act'];
    }

    function renderSide() {
      const t = INFO[task];
      api.side.innerHTML = `<p class="eyebrow">${task === 0 ? 'Tutorial' : `Task ${task + 1} of ${meta.tasks.length}`}</p><h2>${t.h}</h2><p style="margin:0">${t.p}</p><div class="progress" id="dns-prog"></div>`;
    }

    function flash(b: HTMLElement, cls: 'lit' | 'bad') {
      b.classList.remove(cls);
      void b.offsetWidth;
      b.classList.add(cls);
    }

    // ---------- flow ----------
    function startTask(t: number) {
      task = t;
      s = sim.create(t, rng);
      scenario = 0;
      pickedTtl = null;
      phase = t === 0 ? 'tutorial' : 'play';
      if (t === 4) showScenario();
      renderSide();
      render();
    }

    function taskDone() {
      api.task(task);
      if (task >= meta.tasks.length - 1) {
        phase = 'done';
        render();
        return;
      }
      phase = 'between';
      render();
      { const next = task + 1; api.ready(next, () => startTask(next)); }
    }

    const STEP_FOR_HOP = ['resolver', 'root', 'tld', 'auth'];

    function clickNode(id: sim.NodeId) {
      const b = btn[id]!;
      if (phase === 'pre') return api.toast('Press Start first. It is in the brief, and above the game.');
      if (phase === 'done') return api.toast('All tasks done. Press Play again to start a new run.');
      if (phase === 'between') return api.toast('Task done. Press Next above to go on.');
      if (task === 1 && id === 'cache') return api.toast('The cache unlocks in the next task.');
      if (phase === 'tutorial') {
        const want = sim.expected(s);
        if (!want.includes(id)) return api.toast(`Tutorial: click ${sim.NODE_LABEL[want[0]]}, the highlighted server.`);
      }
      if (!s.current) return api.toast('No lookup in progress.');
      const hopBefore = s.current.hop;
      const wasTutorial = phase === 'tutorial';
      api.move();
      const r = sim.click(s, id);
      if (r.kind === 'wrong') {
        flash(b, 'bad');
        api.mistake(id === 'cache' ? 'stale!' : 'wrong server', b);
        api.toast(r.msg);
      } else {
        flash(b, 'lit');
        api.hit(r.kind === 'cache-hit' ? 'cache hit' : r.finished ? 'answered' : undefined, b);
        if (phase === 'tutorial') api.coach.did(STEP_FOR_HOP[hopBefore]);
      }
      render();
      // In the tutorial, the coach's onDone reports task 0.
      if (sim.finished(s) && !wasTutorial) taskDone();
    }

    // ---------- task 4 ----------
    function showScenario() {
      const sc = sim.SCENARIOS[scenario];
      scTitle.textContent = `Record ${scenario + 1} of ${sim.SCENARIOS.length}: ${sc.title}`;
      scText.textContent = sc.text;
      pickedTtl = null;
      ttlBtns.forEach((b) => b.setAttribute('aria-pressed', 'false'));
      result.innerHTML = '';
    }
    function pickTtl(t: number) {
      if (phase !== 'play' || task !== 4) return api.toast(phase === 'pre' ? 'Press Start first.' : 'Wait for this task to start.');
      pickedTtl = t;
      ttlBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.ttl) === t)));
      render();
    }
    function runDay() {
      if (phase !== 'play' || task !== 4) return api.toast(phase === 'pre' ? 'Press Start first.' : 'Wait for this task to start.');
      if (pickedTtl === null) return api.toast('Pick a TTL first, then run the day.');
      api.move();
      const sc = sim.SCENARIOS[scenario];
      const r = sim.evaluateTtl(sc, pickedTtl);
      result.innerHTML = `<div class="mrow"><span>Users stuck on the old answer, worst case</span><span class="${r.staleOk ? 'ok-pill' : 'bad-pill'}">${sim.ttlLabel(r.staleS)}</span></div>
        <div class="mrow"><span>Queries per hour to your DNS servers</span><span class="${r.loadOk ? 'ok-pill' : 'bad-pill'}">${r.authPerHour.toLocaleString('en-US')}</span></div>`;
      if (!r.ok) {
        api.mistake(r.staleOk ? 'too many queries' : 'stale too long', run);
        api.toast(r.staleOk ? `With ${sim.ttlLabel(r.ttl)}, ${sim.RESOLVERS.toLocaleString('en-US')} resolvers re-ask too often: ${r.authPerHour.toLocaleString('en-US')} queries an hour. Try a longer TTL.` : `With ${sim.ttlLabel(r.ttl)}, some users would see the old address for ${sim.ttlLabel(r.ttl)}. Try a shorter TTL.`);
        return;
      }
      api.hit('good TTL', run);
      scenario++;
      if (scenario >= sim.SCENARIOS.length) return taskDone();
      api.toast(`${sim.ttlLabel(r.ttl)} works. Next record.`);
      window.setTimeout(() => phase === 'play' && task === 4 && (showScenario(), render()), 900);
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
