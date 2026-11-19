/** Shared page chrome: toast, top bar, footer, privacy notice. */
import { el } from '../lib/dom';
import { storage } from '../lib/storage';

let toastTimer = 0;
export function toast(msg: string): void {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 3400);
}

export const topbar = (): string =>
  `<div class="topbar"><a class="brand" href="#/">Break the <span>Cloud</span></a>
   <nav><a href="#/">All games</a><a href="#/privacy">Privacy</a></nav></div>`;

export const footer = (): string =>
  `<footer><span>Break the Cloud: learn distributed systems by breaking them. Free, for students and engineers.</span><a href="#/privacy">Privacy &amp; data</a></footer>`;

/** One-time dismissible notice about local storage (no cookies are used). */
export function showNoticeOnce(): void {
  if (storage.get('noticeOk', false)) return;
  const n = el(
    'div',
    { class: 'notice', role: 'region', 'aria-label': 'Privacy notice' },
    `<p><b>No cookies here.</b> Your progress and best times are saved in this browser only. <a href="#/privacy">Privacy &amp; data</a></p>`,
  );
  const ok = el('button', { class: 'btn', type: 'button' }, 'Got it');
  ok.addEventListener('click', () => {
    storage.set('noticeOk', true);
    n.remove();
  });
  n.appendChild(ok);
  document.body.appendChild(n);
}
