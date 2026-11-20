/**
 * Teach or host: one place for "join with a code", "create a class" and "host a competition".
 * Shown on the home page (section #teach) and as its own page (#/host, linked from the top bar).
 */
import { esc } from '../lib/dom';
import { getBackend, withTimeout } from '../lib/leaderboard';
import { bindTopbar, footer, topbar } from './chrome';

export function teachHostHtml(): string {
  return `<section class="teach" id="teach" aria-labelledby="teach-h"><h2 class="teach-h" id="teach-h">Teach or host</h2>
    <form class="card joinany" id="jc-form" novalidate><p class="eyebrow">For players</p><h3>Join with a code</h3>
      <p class="small">Your instructor or organiser gave you a 6-character code for a class or a competition.</p>
      <div class="row"><input id="jc-code" class="joinnick codein" maxlength="6" autocomplete="off" spellcheck="false" placeholder="e.g. K7Q2XM" aria-label="Join code"><button class="btn go" type="submit" id="jc-go">Join</button></div>
      <p class="small" id="jc-msg" role="status"></p></form>
    <a class="card hostcard" href="#/classes/new" id="host-class"><p class="eyebrow">For instructors</p><h3>Create a class</h3>
      <p class="small">Learners join with a code. You see who played what, minutes spent and concepts learned, with a CSV export. Free.</p><span class="btn">Create a class →</span></a>
    <a class="card hostcard" href="#/competitions/new" id="host-comp"><p class="eyebrow">For clubs and colleges</p><h3>Host a competition</h3>
      <p class="small">A live leaderboard with a start and an end, a join code for your players, projector mode and winner checks. No personal data.</p><span class="btn">Host a competition →</span></a>
  </section>`;
}

export function bindTeachHost(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('#jc-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = form.querySelector('#jc-msg')!;
    const code = form.querySelector<HTMLInputElement>('#jc-code')!.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return void (msg.textContent = 'Type the 6-character code (letters and digits).');
    msg.textContent = 'Looking it up…';
    const b = await getBackend();
    if (b.kind === 'offline') return void (msg.textContent = 'Joining needs the shared leaderboard, which is not set up on this site yet.');
    const t = await withTimeout(b.findJoinCode(code), 6000, null);
    if (!t) return void (msg.textContent = `No class or competition has the code ${code}. Check it with your instructor or organiser.`);
    msg.innerHTML = `Found: <b>${esc(t.name)}</b>`;
    location.hash = t.kind === 'class' ? `#/join/${t.id}` : `#/c/${t.id}?code=${code}`;
  });
}

export function renderHost(app: HTMLElement): () => void {
  app.innerHTML = topbar() + `<section class="classpage"><p class="eyebrow"><a href="#/">← All games</a></p>${teachHostHtml()}</section>` + footer();
  bindTopbar(app);
  bindTeachHost(app);
  return () => {};
}
