import './styles/tokens.css';
import './styles/app.css';
import { findGame } from './games/registry';
import { showNoticeOnce } from './shell/chrome';
import { renderHome } from './shell/home';
import { renderPlay } from './shell/play';
import { renderPrivacy } from './shell/privacy';
import { parseHash } from './shell/router';

const app = document.getElementById('app')!;
let unmount: (() => void) | null = null;
let routeSeq = 0;

async function route() {
  const seq = ++routeSeq;
  unmount?.();
  unmount = null;
  const r = parseHash(location.hash);
  if (r.page === 'privacy') {
    unmount = renderPrivacy(app);
    document.title = 'Privacy · Break the Cloud';
    return;
  }
  if (r.page === 'play') {
    const entry = findGame(r.id!);
    if (entry?.load) {
      const handle = await renderPlay(app, entry, r.seed, () => route());
      if (seq !== routeSeq) {
        handle.unmount();
        return;
      }
      unmount = handle.unmount;
      document.title = `${entry.title} · Break the Cloud`;
      window.scrollTo(0, 0);
      return;
    }
  }
  unmount = renderHome(app);
  document.title = 'Break the Cloud';
}

window.addEventListener('hashchange', () => {
  route();
  window.scrollTo(0, 0);
});
showNoticeOnce();
route();
