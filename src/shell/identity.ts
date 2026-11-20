/**
 * Player identity without personal data:
 *  - a nickname (public, unique) to appear on leaderboards,
 *  - a secret claim code (shown once) that proves "this nickname is me" when claiming a prize.
 * The nickname gate appears before the first ranked game; players can also play without ranking.
 */
import { esc } from '../lib/dom';
import type { Backend } from '../lib/leaderboard';
import { storage, today } from '../lib/storage';
import { BOOK, bookHtml } from './book';
import { toast } from './chrome';

const ADJ = ['Swift', 'Quiet', 'Brave', 'Lucky', 'Clever', 'Rapid', 'Steady', 'Bold', 'Sharp', 'Cosmic', 'Turbo', 'Chill'];
const NOUN = ['Panda', 'Packet', 'Raccoon', 'Falcon', 'Router', 'Otter', 'Tiger', 'Quorum', 'Kernel', 'Comet', 'Gecko', 'Cache'];
export function suggestNickname(rnd = Math.random): string {
  return `${ADJ[Math.floor(rnd() * ADJ.length)]}${NOUN[Math.floor(rnd() * NOUN.length)]}${10 + Math.floor(rnd() * 90)}`;
}

/** Should the gate be shown before this game? Only once a day if the player chose to play without ranking. */
export const gateSkippedToday = (): boolean => storage.get<string>('nickSkip', '') === today();

/** The claim-code card: big, screenshot-friendly, with copy and download. */
export function claimCardHtml(nick: string, code: string): string {
  return `<div class="claimcard" id="claim-card">
    <p class="eyebrow">📸 Your claim code · take a screenshot now</p>
    <div class="claim-who">Playing as <b id="claim-nick">${esc(nick)}</b></div>
    <div class="claim-code" id="claim-code">${esc(code)}</div>
    <p class="claim-warn"><b>In a competition? You need this code to collect a prize.</b> The organiser asks for your nickname and this code. It proves the nickname is yours, without any email or phone number.</p>
    <p class="small">It is shown only once. Screenshot it, copy it or download the player card. Keep playing in this same browser (not incognito).</p>
    <div class="row"><button class="btn" type="button" id="claim-copy">Copy code</button><button class="btn ghost" type="button" id="claim-dl">Download player card</button></div>
  </div>`;
}

/**
 * Shows the claim code in its own window, above the page, so nothing on the page can redraw it away.
 * It stays until the player confirms they saved it. Resolves when they press Continue.
 */
export function showClaimDialog(nick: string, code: string): Promise<void> {
  return new Promise((resolve) => {
    document.getElementById('claim-ov')?.remove();
    const ov = document.createElement('div');
    ov.className = 'claim-ov';
    ov.id = 'claim-ov';
    ov.innerHTML = `<div class="card claim-dialog" role="dialog" aria-modal="true" aria-labelledby="claim-title">
      <h2 id="claim-title">Save your claim code</h2>
      ${claimCardHtml(nick, code)}
      ${bookHtml('claim-book')}
      <label class="claim-ack"><input type="checkbox" id="claim-ack"> I took a screenshot (or copied or downloaded it)</label>
      <div class="row"><button class="btn go" type="button" id="claim-done" disabled>Continue →</button></div>
    </div>`;
    document.body.appendChild(ov);
    document.body.classList.add('claim-open');
    bindClaimCard(ov, nick, code);
    const ack = ov.querySelector<HTMLInputElement>('#claim-ack')!;
    const go = ov.querySelector<HTMLButtonElement>('#claim-done')!;
    // Copying or downloading counts as saving it.
    const saved = () => {
      ack.checked = true;
      go.disabled = false;
    };
    ov.querySelector('#claim-copy')!.addEventListener('click', saved);
    ov.querySelector('#claim-dl')!.addEventListener('click', saved);
    ack.addEventListener('change', () => (go.disabled = !ack.checked));
    go.addEventListener('click', () => {
      ov.remove();
      document.body.classList.remove('claim-open');
      resolve();
    });
    // Keep keyboard focus inside the window.
    ov.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = [...ov.querySelectorAll<HTMLElement>('button:not([disabled]), input, a[href]')];
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) (e.preventDefault(), f[f.length - 1].focus());
      else if (!e.shiftKey && i === f.length - 1) (e.preventDefault(), f[0].focus());
    });
    ov.querySelector<HTMLElement>('#claim-copy')!.focus({ preventScroll: true });
  });
}

export function bindClaimCard(root: ParentNode, nick: string, code: string): void {
  root.querySelector('#claim-copy')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(`${nick} ${code}`).then(() => toast('Copied. Keep it somewhere safe.')).catch(() => toast(code));
    if (!navigator.clipboard) toast(code);
  });
  root.querySelector('#claim-dl')?.addEventListener('click', () => downloadPlayerCard(nick, code));
}

/** A PNG “player card” with the nickname and claim code. */
export function downloadPlayerCard(nick: string, code: string): void {
  const c = document.createElement('canvas');
  c.width = 1000;
  c.height = 560;
  const g = c.getContext('2d');
  if (!g) return;
  g.fillStyle = '#e9edf1';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#d6dde5';
  for (let x = 0; x < c.width; x += 28) g.strokeRect(x, 0, 0.5, c.height);
  for (let y = 0; y < c.height; y += 28) g.strokeRect(0, y, c.width, 0.5);
  g.fillStyle = '#f8fafc';
  g.fillRect(50, 50, 900, 460);
  g.strokeStyle = '#d9480f';
  g.lineWidth = 4;
  g.strokeRect(50, 50, 900, 460);
  g.fillStyle = '#152033';
  g.font = '900 44px Archivo, sans-serif';
  g.fillText('Break the', 90, 130);
  g.fillStyle = '#d9480f';
  g.fillText('Cloud', 320, 130);
  g.fillStyle = '#5b6878';
  g.font = '22px "IBM Plex Mono", monospace';
  g.fillText('PLAYER CARD · KEEP THIS SAFE', 90, 180);
  g.fillStyle = '#152033';
  g.font = '600 34px "IBM Plex Sans", sans-serif';
  g.fillText(`Nickname: ${nick}`, 90, 260);
  g.fillStyle = '#d9480f';
  g.font = '700 64px "IBM Plex Mono", monospace';
  g.fillText(code, 90, 360);
  g.fillStyle = '#5b6878';
  g.font = '20px "IBM Plex Sans", sans-serif';
  g.fillText('To claim a prize, show the organiser your nickname and this claim code.', 90, 420);
  g.fillText(`Issued ${new Date().toLocaleString()}`, 90, 452);
  g.fillStyle = '#d9480f';
  g.font = '600 19px "IBM Plex Sans", sans-serif';
  g.fillText(`Free book: ${BOOK.title} · ${BOOK.short}`, 90, 488);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `break-the-cloud-${nick}.png`;
  a.click();
}

/**
 * Pick a nickname (or play without ranking), then save the claim code (shown once, in its own window).
 * Shown when a game page or a competition page opens and the player has no nickname. Resolves when they are done.
 */
export function nicknameGate(
  slot: HTMLElement,
  b: Backend,
  onBlock: () => void,
  onUnblock: () => void,
  labels: { save?: string; skip?: string; skipToast?: string; rememberSkip?: boolean } = {},
): Promise<void> {
  return new Promise((resolve) => {
    onBlock();
    const p = document.createElement('section');
    p.className = 'card tpanel gate-card';
    p.id = 'nick-gate';
    const suggestion = suggestNickname();
    p.innerHTML = `<div class="tp-head"><p class="eyebrow">Get on the leaderboard</p></div>
      <h2>Pick a nickname</h2>
      <p class="tp-text" style="font-size:16px">Your nickname is how you appear on the leaderboards and how a prize winner is found. No email, no phone number, nothing else. Next you get a secret claim code: <b>screenshot it</b>, because competition prizes need it.</p>
      <label class="small" for="gate-nick">Nickname (3–20 letters, digits, _ . -)</label>
      <div class="row"><input id="gate-nick" class="joinnick" maxlength="20" autocomplete="nickname" value="${esc(suggestion)}"><button class="btn ghost" type="button" id="gate-shuffle" title="Suggest another">🎲</button></div>
      <p class="small" id="gate-msg" role="status"></p>
      <div class="row"><button class="btn go" type="button" id="gate-save">${esc(labels.save ?? 'Save and play')}</button><button class="linkbtn" type="button" id="gate-skip">${esc(labels.skip ?? 'Play without ranking')}</button></div>`;
    slot.appendChild(p);
    p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const input = p.querySelector<HTMLInputElement>('#gate-nick')!;
    const msg = p.querySelector('#gate-msg')!;
    const done = () => {
      p.remove();
      onUnblock();
      resolve();
    };
    p.querySelector('#gate-shuffle')!.addEventListener('click', () => (input.value = suggestNickname()));
    p.querySelector('#gate-skip')!.addEventListener('click', () => {
      if (labels.rememberSkip !== false) storage.set('nickSkip', today());
      toast(labels.skipToast ?? 'Playing without ranking. You can pick a nickname after any game.');
      done();
    });
    p.querySelector('#gate-save')!.addEventListener('click', async () => {
      msg.textContent = 'Saving…';
      const r = await b.setNickname(input.value);
      if (!r.ok) {
        msg.textContent = `${r.reason ?? 'Could not save.'}${/taken/i.test(r.reason ?? '') ? ` Try ${suggestNickname()}?` : ''}`;
        return;
      }
      const nick = input.value.trim();
      const code = await b.issueClaimCode();
      p.remove();
      if (code) await showClaimDialog(nick, code);
      else toast('Nickname saved, but the claim code could not be created. Get one from your competition report card.');
      done();
    });
    input.focus({ preventScroll: true });
  });
}
