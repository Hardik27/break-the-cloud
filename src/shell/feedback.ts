/**
 * Feedback: a small window with a 1-4 rating and a message. Opened from the top bar on every page
 * and from the result card after a game. Anonymous; sent with the page (and game) it came from.
 */
import { getBackend, withTimeout } from '../lib/leaderboard';
import { esc } from '../lib/dom';
import { toast } from './chrome';
import { parseHash } from './router';

const RATINGS = [
  { n: 1, face: '😕', label: 'Confusing' },
  { n: 2, face: '😐', label: 'OK' },
  { n: 3, face: '🙂', label: 'Good' },
  { n: 4, face: '🤩', label: 'Loved it' },
];

/** Opens the feedback window. `title` names what it is about (e.g. a game). */
export function openFeedback(title?: string): void {
  if (document.getElementById('fb-ov')) return;
  const r = parseHash(location.hash);
  const page = r.page;
  const gameId = r.page === 'play' ? (r.id ?? null) : null;
  let rating: number | null = null;
  const opener = document.activeElement as HTMLElement | null;
  const ov = document.createElement('div');
  ov.className = 'claim-ov';
  ov.id = 'fb-ov';
  ov.innerHTML = `<form class="card claim-dialog fb-dialog" role="dialog" aria-modal="true" aria-labelledby="fb-title" id="fb-form" novalidate>
      <p class="eyebrow">Feedback${title ? ` · ${esc(title)}` : ''}</p>
      <h2 id="fb-title">How is it going?</h2>
      <div class="fb-rates" role="group" aria-label="Rating">${RATINGS.map((x) => `<button class="fb-rate" type="button" data-rate="${x.n}" aria-pressed="false"><span aria-hidden="true">${x.face}</span>${x.label}</button>`).join('')}</div>
      <label class="small" for="fb-msg">What should we fix, add or keep? Bugs, confusing steps, ideas: all welcome.</label>
      <textarea id="fb-msg" rows="5" maxlength="2000" placeholder="e.g. In task 3 I did not know what to click."></textarea>
      <p class="small fb-note">Anonymous. Please don’t include your name, phone number or email.</p>
      <p class="small" id="fb-out" role="status"></p>
      <div class="row"><button class="btn go" type="submit" id="fb-send">Send feedback</button><button class="btn ghost" type="button" id="fb-cancel">Cancel</button></div>
    </form>`;
  document.body.appendChild(ov);
  document.body.classList.add('claim-open');
  const close = () => {
    ov.remove();
    document.body.classList.remove('claim-open');
    opener?.focus?.({ preventScroll: true });
  };
  ov.querySelectorAll<HTMLButtonElement>('[data-rate]').forEach((b) =>
    b.addEventListener('click', () => {
      rating = Number(b.dataset.rate);
      ov.querySelectorAll('[data-rate]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }),
  );
  ov.querySelector('#fb-cancel')!.addEventListener('click', close);
  ov.addEventListener('click', (e) => e.target === ov && close());
  ov.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return close();
    if (e.key !== 'Tab') return;
    const f = [...ov.querySelectorAll<HTMLElement>('button:not([disabled]), textarea')];
    const i = f.indexOf(document.activeElement as HTMLElement);
    if (e.shiftKey && i <= 0) (e.preventDefault(), f[f.length - 1].focus());
    else if (!e.shiftKey && i === f.length - 1) (e.preventDefault(), f[0].focus());
  });
  ov.querySelector('#fb-form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = ov.querySelector<HTMLElement>('#fb-out')!;
    const message = ov.querySelector<HTMLTextAreaElement>('#fb-msg')!.value.trim();
    if (message.length < 3) {
      out.textContent = 'Write a few words first, so we know what to fix.';
      ov.querySelector<HTMLTextAreaElement>('#fb-msg')!.focus();
      return;
    }
    const send = ov.querySelector<HTMLButtonElement>('#fb-send')!;
    send.disabled = true;
    out.textContent = 'Sending…';
    const b = await getBackend();
    const res = await withTimeout(b.sendFeedback({ message, rating, page, game_id: gameId }), 8000, { ok: false as const, reason: 'The server did not answer. Try again.' });
    send.disabled = false;
    if (!res.ok) {
      out.textContent = res.reason;
      return;
    }
    close();
    toast('Thank you! Every message is read.');
  });
  ov.querySelector<HTMLElement>('[data-rate]')!.focus({ preventScroll: true });
}

/** Any element with data-feedback opens the window (top bar, footer, result card). One listener for every page. */
export function listenForFeedback(): void {
  document.addEventListener('click', (e) => {
    const t = (e.target as Element | null)?.closest?.<HTMLElement>('[data-feedback]');
    if (t) openFeedback(t.dataset.feedback || undefined);
  });
}
