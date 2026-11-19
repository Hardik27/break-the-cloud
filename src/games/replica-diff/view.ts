/** Replica Diff view. No animation loop: rows are built once per round and only their classes change. */
import { el, esc, onActivateKey } from '../../lib/dom';
import { mulberry32 } from '../../lib/rng';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

type Phase = 'pre' | 'tutorial' | 'play' | 'solved' | 'done';

const INFO = [
  { h: 'Something is missing', p: 'The replica should hold every object in the source. One did not make it across.' },
  { h: 'Something changed inside', p: '<b>Goal:</b> flag the replica copy that differs from its source.<br><b>Your tools:</b> click a row to flag it. A wrong flag costs points and 3 seconds.' },
  { h: 'Something changed again', p: '<b>Goal:</b> flag the replica copy that differs from its source.<br><b>Your tools:</b> click a row to flag it. Compare every column.' },
  { h: 'One more difference', p: '<b>Goal:</b> flag the replica copy that differs from its source.<br><b>Your tools:</b> click a row to flag it.' },
  { h: 'Speed round', p: 'Fourteen objects, three problems of different kinds. Find all three. Wrong clicks still cost points and 3 seconds.' },
];

const COACH = [
  '',
  'Compare the <b>etag</b> column row by row and click the copy that differs.',
  'All etags match. Compare the <b>tags</b> column and click the row that differs.',
  'Compare the <b>retention</b> column and click the row whose replica lost its lock.',
  'Find all three differences, in any column.',
];

const fmtSize = (kb: number) => (kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB');

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    const rng = mulberry32(api.seed);
    let round = sim.makeRound(0, rng);
    let phase: Phase = 'pre';
    let roundStart = performance.now();
    let hintOn = false;

    stage.innerHTML = '';
    const status = el(
      'div',
      { class: 'statusbar' },
      `<span>round <b id="rd-round"></b></span><span>problems left <b id="rd-left"></b></span><span id="rd-hint">click a row in either bucket to flag that object</span>`,
    );
    const next = el('button', { class: 'btn go', id: 'rd-next', type: 'button', hidden: true, style: 'margin-left:auto' }, 'Next round →');
    status.appendChild(next);
    const head = `<thead><tr><th>#</th><th>key</th><th>size</th><th>etag</th><th>tags</th><th>retention</th></tr></thead>`;
    const wrap = el(
      'div',
      { class: 'diffwrap' },
      `<div class="bucket"><h3>Source · us-west</h3><div class="scroll"><table class="objtbl">${head}<tbody id="rd-src"></tbody></table></div></div>
       <div class="bucket"><h3>Replica · eu-central</h3><div class="scroll"><table class="objtbl">${head}<tbody id="rd-dst"></tbody></table></div></div>`,
    );
    stage.append(status, wrap);
    const $ = (id: string) => stage.querySelector<HTMLElement>('#' + id)!;
    const srcBody = $('rd-src');
    const dstBody = $('rd-dst');

    let rowEls: { src: HTMLTableRowElement; dst: HTMLTableRowElement }[] = [];

    function buildRows() {
      const row = (o: sim.Obj, i: number, side: 'src' | 'dst') =>
        `<tr data-row="${side}-${i}" tabindex="0" aria-label="${side === 'src' ? 'Source' : 'Replica'} row ${i + 1}: ${esc(o.key)}. Activate to flag as different."><td class="n">${i + 1}</td><td>${esc(o.key)}</td><td>${fmtSize(o.size)}</td><td>${o.etag}</td><td>${o.tags}</td><td>${o.ret}</td></tr>`;
      srcBody.innerHTML = round.src.map((o, i) => row(o, i, 'src')).join('');
      dstBody.innerHTML = round.dst
        .map((o, i) =>
          o
            ? row(o, i, 'dst')
            : `<tr class="miss" data-row="dst-${i}" tabindex="0" aria-label="Replica row ${i + 1}: no object. Activate to flag as different."><td class="n">${i + 1}</td><td colspan="5">(no object)</td></tr>`,
        )
        .join('');
      rowEls = round.src.map((_, i) => ({
        src: srcBody.querySelector<HTMLTableRowElement>(`[data-row="src-${i}"]`)!,
        dst: dstBody.querySelector<HTMLTableRowElement>(`[data-row="dst-${i}"]`)!,
      }));
      rowEls.forEach((r, i) => {
        for (const tr of [r.src, r.dst]) {
          tr.addEventListener('click', () => flagRow(i));
          onActivateKey(tr, () => flagRow(i));
        }
      });
    }

    const COL_NAMES = ['', 'key', 'size', 'etag', 'tags', 'retention'];
    const cellsInCol = (col: number) => [...stage.querySelectorAll<HTMLElement>(`.objtbl tr > :nth-child(${col + 1})`)];
    function nextHintKind(): sim.Kind | null {
      for (const [i, k] of round.targets) if (!round.found.has(i)) return k;
      return null;
    }
    function clearHint() {
      hintOn = false;
      stage.querySelectorAll('.hintcol').forEach((e) => e.classList.remove('hintcol'));
    }
    function showHint() {
      const k = nextHintKind();
      if (!k || hintOn) return;
      hintOn = true;
      cellsInCol(sim.KIND_COL[k]).forEach((c) => c.classList.add('hintcol'));
      update();
    }
    const hintTimer = window.setInterval(() => {
      if (phase !== 'play' || hintOn) return;
      const wait = round.task === 4 ? 20000 : 12000;
      if (performance.now() - roundStart > wait) showHint();
    }, 500);
    function markCells(i: number) {
      const k = sim.diffKind(round.src[i], round.dst[i]);
      if (!k || k === 'miss') return;
      const col = sim.KIND_COL[k];
      for (const tr of [rowEls[i].src, rowEls[i].dst]) tr.children[col]?.classList.add('cellbad');
    }

    function renderSide() {
      const t = round.task;
      const info = INFO[t];
      api.side.innerHTML = `<p class="eyebrow">${t === 0 ? 'Tutorial' : `Task ${t + 1} of ${meta.tasks.length}`}</p><h2>${info.h}</h2><p style="margin:0">${info.p}</p><div class="progress" id="rd-prog"></div>`;
    }

    function update() {
      $('rd-round').textContent = `${round.task + 1}/${sim.ROUNDS.length}`;
      $('rd-left').textContent = String(sim.left(round));
      next.hidden = !(phase === 'solved' || (phase === 'tutorial' && sim.solved(round)));
      const prog = api.side.querySelector<HTMLElement>('#rd-prog');
      if (prog) {
        const done = sim.solved(round);
        prog.textContent = done ? 'Round done.' : `Problems left: ${sim.left(round)}`;
        prog.classList.toggle('win', done);
      }
      if (phase === 'solved') api.coach.say('Read the lesson, then click <b>Next round</b>.', 'act');
      else if (phase === 'play') {
        const leftTxt = round.task === 4 ? ` ${sim.left(round)} left.` : '';
        const k = hintOn ? nextHintKind() : null;
        api.coach.say(k ? `Psst: look closely at the <b>${COL_NAMES[sim.KIND_COL[k]]}</b> column (highlighted).${leftTxt}` : COACH[round.task] + leftTxt, 'act');
      }
    }

    function flagRow(i: number) {
      const rows = rowEls[i];
      if (phase === 'pre') return api.toast('Press Start first. It is in the brief, and above the game.');
      if (phase === 'done') return api.toast('All tasks done. Press Play again to start a new run.');
      if (phase === 'solved') return api.toast('This round is done. Click Next round to continue.');
      if (phase === 'tutorial') {
        if (api.coach.step === 'next') return api.toast('Tutorial: click Next round (highlighted).');
        if (i !== sim.TUTORIAL_ROW) return api.toast(`Tutorial: click row ${sim.TUTORIAL_ROW + 1}, the highlighted one.`);
      }
      const res = sim.flag(round, i);
      if (res === 'again') return api.toast(sim.solved(round) ? 'Already flagged.' : 'Already flagged. Look for another difference.');
      api.move();
      if (res === 'wrong') {
        api.penalty(sim.PENALTY_MS);
        api.mistake('match', rows.src);
        api.toast(`Row ${i + 1}: those two copies match. +3 s`);
        for (const tr of [rows.src, rows.dst]) {
          tr.classList.add('wrong');
          setTimeout(() => tr.classList.remove('wrong'), 600);
        }
        return;
      }
      rows.src.classList.add('flag');
      rows.dst.classList.add('flag');
      markCells(i);
      api.hit(phase === 'tutorial' ? 'Found it!' : 'found', rows.src);
      if (hintOn) {
        clearHint();
        roundStart = performance.now();
      }
      if (!sim.solved(round)) {
        api.toast(`Row ${i + 1} flagged. ${sim.left(round)} to go.`);
        update();
        return;
      }
      if (phase === 'tutorial') {
        update();
        api.coach.did('flag-missing');
        return;
      }
      api.task(round.task);
      phase = round.task >= sim.ROUNDS.length - 1 ? 'done' : 'solved';
      update();
      if (phase === 'solved') api.ready(round.task + 1, nextRound);
    }

    function nextRound() {
      round = sim.makeRound(round.task + 1, rng);
      phase = 'play';
      hintOn = false;
      roundStart = performance.now();
      buildRows();
      renderSide();
      update();
    }

    function onTutorialDone() {
      api.task(0);
      api.ready(1, nextRound);
    }

    next.addEventListener('click', () => {
      if (phase === 'tutorial') {
        if (api.coach.step === 'next') api.coach.did('next');
        return;
      }
      if (phase === 'solved') api.toast('Press Next above to go on.');
    });

    api.onBegin(() => {
      phase = 'tutorial';
      renderSide();
      update();
      api.coach.tutorial(meta.walkthrough, onTutorialDone);
    });

    buildRows();
    update();
    return () => clearInterval(hintTimer);
  },
};
