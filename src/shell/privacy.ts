import { getBackend, withTimeout } from '../lib/leaderboard';
import { storage } from '../lib/storage';
import { bindTopbar, footer, refreshRankChip, toast, topbar } from './chrome';

export function renderPrivacy(app: HTMLElement): () => void {
  app.innerHTML =
    topbar() +
    `<article class="card prose" id="privacy"><p class="eyebrow">Privacy &amp; data</p><h2>What this site stores</h2>
    <p>This site sets <b>no cookies</b> and runs no advertising or tracking scripts.</p>
    <h3>In your browser</h3>
    <p>Your best score and time for each game, the concept cards you have unlocked, your daily streak, today’s stand-up answer, your sound setting, and whether you dismissed the privacy notice are kept in your browser's <b>local storage</b> (a small key-value store on your device). None of it leaves your device.</p>
    <h3>On the leaderboard</h3>
    <p>When you start a game, the site signs you in <b>anonymously</b>: no email, no password, just a random account id. That sign-in session is kept in local storage; it is strictly necessary for the leaderboard to work. The leaderboard stores your runs (game, start and finish time, points, stars, mistakes, moves) linked to that anonymous id, and the nickname you choose, if you choose one. Other players see your nickname, points, stars and time, never your id. Use a nickname you are happy to show publicly; avoid your full name.</p>
    <h3>Fonts</h3>
    <p>Typefaces (Archivo, IBM Plex Sans, IBM Plex Mono) load from Google Fonts. Google receives your IP address when the page loads, as with any web request.</p>
    <h3>Delete your data</h3>
    <p>This button deletes your runs and nickname from the leaderboard and clears everything this site saved in this browser.</p>
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
    const server = be.kind === 'offline' ? '' : serverOk ? ' Your leaderboard runs and nickname are deleted.' : ' Could not reach the leaderboard to delete your runs; try again later.';
    msgEl.textContent = local + server;
    toast(local + server);
    refreshRankChip();
    btn.disabled = false;
  });
  return () => {};
}
