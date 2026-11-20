/**
 * Player identity without personal data:
 *  - a nickname (public, unique) to appear on leaderboards,
 *  - a secret claim code (shown once) that proves "this nickname is me" when claiming a prize.
 * The nickname gate appears before the first ranked game; players can also play without ranking.
 */
import { esc } from '../lib/dom';
import type { Backend } from '../lib/leaderboard';
import { storage, today } from '../lib/storage';
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
    <p class="eyebrow">Your claim code · screenshot this now</p>
    <div class="claim-who">Playing as <b id="claim-nick">${esc(nick)}</b></div>
    <div class="claim-code" id="claim-code">${esc(code)}</div>
    <p class="small">If you win a prize, the organiser asks for your <b>nickname and this code</b>. It proves you are you, without any email or phone number. It is shown only once: take a screenshot or download it. Keep playing in this same browser (not incognito).</p>
    <div class="row"><button class="btn" type="button" id="claim-copy">Copy code</button><button class="btn ghost" type="button" id="claim-dl">Download player card</button></div>
  </div>`;
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
  g.fillText(`Issued ${new Date().toLocaleString()}`, 90, 455);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `break-the-cloud-${nick}.png`;
  a.click();
}

/**
 * Before the first ranked game: pick a nickname (or play without ranking), then see the claim code once.
 * Resolves when the player is ready to play.
 */
export function nicknameGate(slot: HTMLElement, b: Backend, onBlock: () => void, onUnblock: () => void): Promise<void> {
  return new Promise((resolve) => {
    onBlock();
    const p = document.createElement('section');
    p.className = 'card tpanel gate-card';
    p.id = 'nick-gate';
    const suggestion = suggestNickname();
    p.innerHTML = `<div class="tp-head"><p class="eyebrow">Get on the leaderboard</p></div>
      <h2>Pick a nickname</h2>
      <p class="tp-text" style="font-size:16px">Your nickname is how you appear on the leaderboards and how a prize winner is found. No email, no phone number, nothing else.</p>
      <label class="small" for="gate-nick">Nickname (3–20 letters, digits, _ . -)</label>
      <div class="row"><input id="gate-nick" class="joinnick" maxlength="20" autocomplete="nickname" value="${esc(suggestion)}"><button class="btn ghost" type="button" id="gate-shuffle" title="Suggest another">🎲</button></div>
      <p class="small" id="gate-msg" role="status"></p>
      <div class="row"><button class="btn go" type="button" id="gate-save">Save and play</button><button class="linkbtn" type="button" id="gate-skip">Play without ranking</button></div>`;
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
      storage.set('nickSkip', today());
      toast('Playing without ranking. You can pick a nickname after any game.');
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
      if (!code) return done();
      p.innerHTML = `${claimCardHtml(nick, code)}<div class="row"><button class="btn go" type="button" id="gate-go">I saved it. Let’s play →</button></div>`;
      bindClaimCard(p, nick, code);
      p.querySelector<HTMLElement>('#gate-go')!.addEventListener('click', done);
      p.querySelector<HTMLElement>('#gate-go')!.focus({ preventScroll: true });
    });
    input.focus({ preventScroll: true });
  });
}
