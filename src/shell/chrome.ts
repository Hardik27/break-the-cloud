/** Shared page chrome: toast, top bar (sound + rank), footer, privacy notice. */
import { rankFor } from '../../supabase/functions/_shared/scoring.ts';
import { el } from '../lib/dom';
import { sfx } from '../lib/sfx';
import { esc } from '../lib/dom';
import { careerPoints, myClass, storage } from '../lib/storage';

let toastTimer = 0;
export function toast(msg: string): void {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 3400);
}

export const fmtPts = (n: number): string => Math.round(n).toLocaleString('en-US');

export function topbar(): string {
  const pts = careerPoints();
  const r = rankFor(pts);
  return `<div class="topbar"><a class="brand" href="#/">Break the <span>Cloud</span></a>
   <nav>${(() => { const c = myClass(); return c ? `<a class="classchip" id="classchip" href="#/join/${c.code}" title="Your runs count for this class">🏫 ${esc(c.name)}</a>` : ''; })()}<span class="rankchip" id="rankchip" title="Your career rank: the sum of your best score in every game">${r.title} · ${fmtPts(pts)} pts</span>
   <button class="chip" type="button" id="sound-toggle" aria-pressed="${!sfx.muted}">${sfx.muted ? 'Sound off' : 'Sound on'}</button>
   <a href="#/">All games</a><a href="#/host" id="nav-host">Teach or host</a><a href="#/privacy">Privacy</a><button class="chip fbchip" type="button" id="nav-feedback" data-feedback="">💬 Feedback</button></nav></div>`;
}

/** Wire up controls in the top bar after it is rendered. */
export function bindTopbar(root: HTMLElement): void {
  const b = root.querySelector<HTMLButtonElement>('#sound-toggle');
  b?.addEventListener('click', () => {
    const m = sfx.toggle();
    b.setAttribute('aria-pressed', String(!m));
    b.textContent = m ? 'Sound off' : 'Sound on';
  });
}

export function refreshRankChip(): void {
  const c = document.getElementById('rankchip');
  if (!c) return;
  const pts = careerPoints();
  c.textContent = `${rankFor(pts).title} · ${fmtPts(pts)} pts`;
}

export const footer = (): string =>
  `<footer><span>Break the Cloud: learn distributed systems by breaking them. Free, for students and engineers.</span><span class="footlinks"><a href="#/host">Join with a code</a><a href="#/classes/new">For instructors: create a class</a><a href="#/competitions/new">Host a competition</a><a href="#/privacy">Privacy &amp; data</a><button class="linkbtn" type="button" data-feedback="">Send feedback</button></span></footer>`;

/** One-time dismissible notice about local storage (no cookies are used). */
export function showNoticeOnce(): void {
  if (storage.get('noticeOk', false)) return;
  const n = el(
    'div',
    { class: 'notice', role: 'region', 'aria-label': 'Privacy notice' },
    `<p><b>No cookies here.</b> Your progress is saved in this browser. To improve the games we record anonymous learning activity (pages, games, time spent), never your name or email. Leaderboards show only your nickname and scores. <a href="#/privacy">Privacy &amp; data</a></p>`,
  );
  const ok = el('button', { class: 'btn', type: 'button' }, 'Got it');
  ok.addEventListener('click', () => {
    storage.set('noticeOk', true);
    n.remove();
  });
  n.appendChild(ok);
  document.body.appendChild(n);
}
