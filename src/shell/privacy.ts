import { storage } from '../lib/storage';
import { footer, toast, topbar } from './chrome';

export function renderPrivacy(app: HTMLElement): () => void {
  app.innerHTML =
    topbar() +
    `<article class="card prose" id="privacy"><p class="eyebrow">Privacy &amp; data</p><h2>What this site stores</h2>
    <p>This site sets <b>no cookies</b> and runs no advertising or tracking scripts.</p>
    <h3>In your browser</h3>
    <p>Your best time for each game, and whether you dismissed the privacy notice, are kept in your browser's <b>local storage</b> (a small key-value store that stays on your device). They never leave your device.</p>
    <h3>On the leaderboard</h3>
    <p>The shared leaderboard is coming soon. When it arrives, it will store only: the nickname you choose, your run times and move counts, and an anonymous account id that lets you replace your own entries. No email address, no real name. The sign-in session for that anonymous account is kept in local storage; it is strictly necessary for the leaderboard to work.</p>
    <h3>Fonts</h3>
    <p>Typefaces (Archivo, IBM Plex Sans, IBM Plex Mono) load from Google Fonts. Google receives your IP address when the page loads, as with any web request.</p>
    <h3>Delete your data</h3>
    <p>This button clears everything this site saved in this browser. When the leaderboard launches, it will also delete your runs from it.</p>
    <p><button class="btn" id="delete-data" type="button">Delete my data</button></p>
    <p class="small" id="delete-msg" role="status"></p>
    </article>` +
    footer();
  const btn = app.querySelector<HTMLButtonElement>('#delete-data')!;
  btn.addEventListener('click', () => {
    const n = storage.clearAll();
    const msg = n ? `Deleted ${n} saved item${n === 1 ? '' : 's'} from this browser.` : 'Nothing was stored in this browser.';
    app.querySelector('#delete-msg')!.textContent = msg;
    toast(msg);
  });
  return () => {};
}
