/**
 * Player identity without personal data:
 *  - a nickname (public, unique) to appear on the global leaderboards. No code needed.
 *  - when joining a competition or a class: a claim code for that competition or class (shown once).
 *    It proves "this nickname is me" to the organiser (prizes) and restores progress on another device.
 * After picking a nickname every player sees a welcome window with the free companion book.
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

/** What a claim code belongs to. */
export interface ClaimScope { kind: 'competition' | 'class'; name: string }

/** The claim-code card: big, screenshot-friendly, with copy and download. */
export function claimCardHtml(nick: string, code: string, scope: ClaimScope): string {
  const why = scope.kind === 'competition'
    ? `<b>You need this code to collect a prize in ${esc(scope.name)}.</b> The organiser asks for your nickname and this code. It proves the nickname is yours, without any email or phone number.`
    : `<b>This code keeps your progress in ${esc(scope.name)} safe.</b> On a new phone or laptop, or after clearing the browser, enter your nickname and this code on the class page to get everything back.`;
  return `<div class="claimcard" id="claim-card">
    <p class="eyebrow">📸 Your claim code · take a screenshot now</p>
    <div class="claim-who">Playing as <b id="claim-nick">${esc(nick)}</b> · <span id="claim-scope">${esc(scope.name)}</span></div>
    <div class="claim-code" id="claim-code">${esc(code)}</div>
    <p class="claim-warn">${why}</p>
    <p class="small">It is shown only once and works only for ${esc(scope.name)}. Screenshot it, copy it or download the player card.</p>
    <div class="row"><button class="btn" type="button" id="claim-copy">Copy code</button><button class="btn ghost" type="button" id="claim-dl">Download player card</button></div>
  </div>`;
}
export function bindClaimCard(root: ParentNode, nick: string, code: string, scope: ClaimScope): void {
  root.querySelector('#claim-copy')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(`${nick} ${code} (${scope.name})`).then(() => toast('Copied. Keep it somewhere safe.')).catch(() => toast(code));
    if (!navigator.clipboard) toast(code);
  });
  root.querySelector('#claim-dl')?.addEventListener('click', () => downloadPlayerCard(nick, code, scope));
}

/** A PNG “player card” with the nickname, the claim code and what it is for. */
export function downloadPlayerCard(nick: string, code: string, scope: ClaimScope): void {
  const c = document.createElement('canvas');
  c.width = 1000;
  c.height = 600;
  const g = c.getContext('2d');
  if (!g) return;
  g.fillStyle = '#e9edf1';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#d6dde5';
  for (let x = 0; x < c.width; x += 28) g.strokeRect(x, 0, 0.5, c.height);
  for (let y = 0; y < c.height; y += 28) g.strokeRect(0, y, c.width, 0.5);
  g.fillStyle = '#f8fafc';
  g.fillRect(50, 50, 900, 500);
  g.strokeStyle = '#d9480f';
  g.lineWidth = 4;
  g.strokeRect(50, 50, 900, 500);
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
  g.fillText(`Nickname: ${nick}`, 90, 250);
  g.font = '24px "IBM Plex Sans", sans-serif';
  g.fillText(`For: ${scope.name}`, 90, 292);
  g.fillStyle = '#d9480f';
  g.font = '700 64px "IBM Plex Mono", monospace';
  g.fillText(code, 90, 380);
  g.fillStyle = '#5b6878';
  g.font = '20px "IBM Plex Sans", sans-serif';
  g.fillText(scope.kind === 'competition' ? 'To claim a prize, show the organiser your nickname and this claim code.' : 'To restore your progress on another device, enter your nickname and this code.', 90, 440);
  g.fillText(`Issued ${new Date().toLocaleString()}`, 90, 472);
  g.fillStyle = '#d9480f';
  g.font = '600 19px "IBM Plex Sans", sans-serif';
  g.fillText(`Free book: ${BOOK.title} · ${BOOK.short}`, 90, 515);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `break-the-cloud-${nick}.png`;
  a.click();
}

/** A window above the page (nothing on the page can redraw it away). Keeps keyboard focus inside. */
function modal(id: string, inner: string, labelledBy: string): { ov: HTMLElement; close: () => void } {
  document.getElementById(id)?.remove();
  const ov = document.createElement('div');
  ov.className = 'claim-ov';
  ov.id = id;
  ov.innerHTML = `<div class="card claim-dialog" role="dialog" aria-modal="true" aria-labelledby="${labelledBy}">${inner}</div>`;
  document.body.appendChild(ov);
  document.body.classList.add('claim-open');
  ov.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...ov.querySelectorAll<HTMLElement>('button:not([disabled]), input, a[href]')];
    const i = f.indexOf(document.activeElement as HTMLElement);
    if (e.shiftKey && i <= 0) (e.preventDefault(), f[f.length - 1].focus());
    else if (!e.shiftKey && i === f.length - 1) (e.preventDefault(), f[0].focus());
  });
  return {
    ov,
    close: () => {
      ov.remove();
      document.body.classList.remove('claim-open');
    },
  };
}

/**
 * The claim code for a competition or class, in its own window. It stays until the player confirms they saved it.
 * Resolves when they press Continue.
 */
export function showClaimDialog(nick: string, code: string, scope: ClaimScope): Promise<void> {
  return new Promise((resolve) => {
    const { ov, close } = modal(
      'claim-ov',
      `<h2 id="claim-title">Save your claim code</h2>
      ${claimCardHtml(nick, code, scope)}
      ${bookHtml('claim-book')}
      <label class="claim-ack"><input type="checkbox" id="claim-ack"> I took a screenshot (or copied or downloaded it)</label>
      <div class="row"><button class="btn go" type="button" id="claim-done" disabled>Continue →</button></div>`,
      'claim-title',
    );
    bindClaimCard(ov, nick, code, scope);
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
      close();
      resolve();
    });
    ov.querySelector<HTMLElement>('#claim-copy')!.focus({ preventScroll: true });
  });
}

/** Right after picking a nickname: you are on the leaderboards, and here is the free book. */
export function showWelcomeDialog(nick: string): Promise<void> {
  return new Promise((resolve) => {
    const { ov, close } = modal(
      'welcome-ov',
      `<p class="eyebrow">Nickname saved</p><h2 id="welcome-title">Welcome, <span id="welcome-nick">${esc(nick)}</span></h2>
      <p>You are on the public leaderboards now. Every game you finish counts, and your best score per game climbs the board.</p>
      <p class="small">Joining a class or a competition? Open the link your instructor or organiser gave you, or use <b>Join with a code</b> under <a href="#/host">Teach or host</a>.</p>
      ${bookHtml('welcome-book')}
      <div class="row"><button class="btn go" type="button" id="welcome-go">Let’s play →</button></div>`,
      'welcome-title',
    );
    const finish = () => {
      close();
      resolve();
    };
    ov.querySelector('#welcome-go')!.addEventListener('click', finish);
    ov.querySelector('a[href="#/host"]')!.addEventListener('click', finish);
    ov.querySelector<HTMLElement>('#welcome-go')!.focus({ preventScroll: true });
  });
}

/** Nickname input with a shuffle button (for join forms). */
export function nickFieldHtml(id: string, label = 'Pick a nickname (3–20 letters, digits, _ . -). It is public: avoid your full name.'): string {
  return `<label class="small" for="${id}">${label}</label>
    <div class="row"><input id="${id}" class="joinnick" maxlength="20" autocomplete="nickname" value="${esc(suggestNickname())}"><button class="btn ghost" type="button" data-shuffle="${id}" title="Suggest another">🎲</button></div>`;
}
export function bindNickField(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>('[data-shuffle]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = root.querySelector<HTMLInputElement>('#' + b.dataset.shuffle);
      if (i) i.value = suggestNickname();
    }),
  );
}

/**
 * Pick a nickname (or play without ranking), then the welcome window with the free book.
 * Shown when a game page opens and the player has no nickname. Resolves when they are done.
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
      <p class="tp-text" style="font-size:16px">Your nickname is how you appear on the public leaderboards. No email, no phone number, nothing else. Pick one you are happy to show: avoid your full name.</p>
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
      p.remove();
      await showWelcomeDialog(input.value.trim());
      done();
    });
    input.focus({ preventScroll: true });
  });
}
