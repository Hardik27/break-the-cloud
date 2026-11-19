/** Shared page chrome: toast, top bar (sound + rank), footer, privacy notice. */
import { rankFor } from '../../supabase/functions/_shared/scoring.ts';
import { el } from '../lib/dom';
import { sfx } from '../lib/sfx';
import { careerPoints, storage } from '../lib/storage';

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
   <nav><span class="rankchip" id="rankchip" title="Your career rank: the sum of your best score in every game">${r.title} · ${fmtPts(pts)} pts</span>
   <button class="chip" type="button" id="sound-toggle" aria-pressed="${!sfx.muted}">${sfx.muted ? 'Sound off' : 'Sound on'}</button>
   <a href="#/">All games</a><a href="#/privacy">Privacy</a></nav></div>`;
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
  `<footer><span>Break the Cloud: learn distributed systems by breaking them. Free, for students and engineers.</span><a href="#/privacy">Privacy &amp; data</a></footer>`;

/** One-time dismissible notice about local storage (no cookies are used). */
export function showNoticeOnce(): void {
  if (storage.get('noticeOk', false)) return;
  const n = el(
    'div',
    { class: 'notice', role: 'region', 'aria-label': 'Privacy notice' },
    `<p><b>No cookies here.</b> Your progress is saved in this browser. If you post to the leaderboard, only your nickname and scores are shared. <a href="#/privacy">Privacy &amp; data</a></p>`,
  );
  const ok = el('button', { class: 'btn', type: 'button' }, 'Got it');
  ok.addEventListener('click', () => {
    storage.set('noticeOk', true);
    n.remove();
  });
  n.appendChild(ok);
  document.body.appendChild(n);
}
