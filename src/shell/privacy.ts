import { getBackend, withTimeout } from '../lib/leaderboard';
import { storage } from '../lib/storage';
import { bindTopbar, footer, refreshRankChip, toast, topbar } from './chrome';

export function renderPrivacy(app: HTMLElement): () => void {
  app.innerHTML =
    topbar() +
    `<article class="card prose" id="privacy"><p class="eyebrow">Privacy &amp; data</p><h2>What this site stores</h2>
    <p>This site sets <b>no cookies</b> and runs no advertising or third-party tracking scripts. We never ask for your name, email or phone number.</p>
    <h3>In your browser</h3>
    <p>Your best score and time for each game, the concept cards you have unlocked, your daily streak, today’s stand-up answer, your sound setting, the class you joined, and whether you dismissed the privacy notice are kept in your browser's <b>local storage</b> (a small key-value store on your device).</p>
    <h3>Your anonymous account</h3>
    <p>The site signs you in <b>anonymously</b>: no email, no password, just a random account id. That session is kept in local storage; it is strictly necessary for leaderboards, classes and competitions. Everything below is linked to that random id, and to your nickname if you pick one.</p>
    <h3 id="activity">Learning activity</h3>
    <p>To see what helps people learn and to improve the games, we record what you do on the site, linked to your anonymous id:</p>
    <ul>
      <li>pages and games you open, explainers you read or skip, your answers to quick-check questions and predictions (right or wrong), hints you open, tasks you clear, games you finish or leave part-way;</li>
      <li><b>active time</b>: counted only while the page is visible and you clicked, typed, scrolled or touched in the last minute;</li>
      <li>clicks on the free book link;</li>
      <li>your <b>device type</b> (phone or computer) and your <b>country</b>, as our hosting provider Cloudflare sees it. We do not store your IP address.</li>
    </ul>
    <p>We use it for statistics such as how many people learned here, for how long and from how many countries, and to find games that are too hard. It is not sold, not shared with advertisers and not used to identify you. Only the site owner can read it; other players cannot.</p>
    <h3>Nickname and leaderboards</h3>
    <p>To appear on leaderboards you pick a nickname; it is public. Other players see your nickname, points, stars and time, never your id. Use a nickname you are happy to show; avoid your full name. The leaderboard stores your runs (game, start and finish time, points, stars, mistakes, moves, time per task).</p>
    <h3>Classes</h3>
    <p>If you join a class with a code from your instructor, the runs you start afterwards are tagged with that class. Its instructor sees your nickname, the games you finished, your points, your active minutes and concepts learned since you joined, and when you last played. When you join you get a <b>claim code</b> for that class, shown once; it lets you restore your progress on another device. We store only a one-way fingerprint (hash) of it, so nobody, including us, can read it back. You can leave a class at any time from the class chip at the top of the page.</p>
    <h3>Competitions</h3>
    <p>A competition ranks only players who joined it with its join code, by the games they finish between its start and end. When you join you get a claim code for that competition, shown once (only a fingerprint is stored). A prize winner shows the organiser their nickname and claim code to prove the nickname is theirs. The organiser sees nicknames, scores and per-task times (to check fair play), and can remove a player from the competition for cheating or an offensive nickname. If you win, you choose what contact details to give the organiser to receive the prize.</p>
    <h3>Fonts</h3>
    <p>Typefaces (Archivo, IBM Plex Sans, IBM Plex Mono) load from Google Fonts. Google receives your IP address when the page loads, as with any web request.</p>
    <h3>Delete your data</h3>
    <p>This button deletes everything linked to you on the server (runs, nickname, class and competition memberships, learning activity) and clears everything this site saved in this browser.</p>
    <p><button class="btn" id="delete-data" type="button">Delete my data</button></p>
    <p class="small" id="delete-msg" role="status"></p>
    </article>` +
    footer();
  bindTopbar(app);
  const btn = app.querySelector<HTMLButtonElement>('#delete-data')!;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const msgEl = app.querySelector('#delete-msg')!;
    msgEl.textContent = 'Deleting…';
    const be = await getBackend();
    const serverOk = be.kind === 'offline' ? true : await withTimeout(be.deleteMyData(), 8000, false);
    const n = storage.clearAll();
    const local = n ? `Deleted ${n} saved item${n === 1 ? '' : 's'} from this browser.` : 'Nothing was stored in this browser.';
    const server = be.kind === 'offline' ? '' : serverOk ? ' Your runs, nickname, memberships and learning activity are deleted from the server.' : ' Could not reach the leaderboard to delete your runs; try again later.';
    msgEl.textContent = local + server;
    toast(local + server);
    refreshRankChip();
    btn.disabled = false;
  });
  return () => {};
}
