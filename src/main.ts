import './styles/tokens.css';
import './styles/app.css';
import { findGame } from './games/registry';
import { showNoticeOnce } from './shell/chrome';
import { renderClassReport, renderJoin, renderNewClass } from './shell/classes';
import { renderCompetition, renderCompetitionAdmin, renderCompetitionMe, renderNewCompetition } from './shell/competition';
import { renderDeck } from './shell/deck';
import { renderHome } from './shell/home';
import { renderHost } from './shell/host';
import { trackVisit } from './lib/telemetry';
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
  trackVisit(r.page, r.page === 'play' || r.page === 'comp' || r.page === 'join' ? r.id : null);
  if (r.page === 'host') {
    unmount = renderHost(app);
    document.title = 'Teach or host · Break the Cloud';
    return;
  }
  if (r.page === 'privacy') {
    unmount = renderPrivacy(app);
    document.title = 'Privacy · Break the Cloud';
    return;
  }
  if (r.page === 'join') {
    unmount = renderJoin(app, r.id!);
    document.title = 'Join a class · Break the Cloud';
    return;
  }
  if (r.page === 'newclass') {
    unmount = renderNewClass(app);
    document.title = 'Create a class · Break the Cloud';
    return;
  }
  if (r.page === 'class') {
    unmount = renderClassReport(app, r.id!, r.key);
    document.title = `Class ${r.id} · Break the Cloud`;
    return;
  }
  if (r.page === 'comp' || r.page === 'compme' || r.page === 'compadmin' || r.page === 'newcomp') {
    unmount = r.page === 'comp' ? renderCompetition(app, r.id!, r.code) : r.page === 'compme' ? renderCompetitionMe(app, r.id!) : r.page === 'compadmin' ? renderCompetitionAdmin(app, r.id!, r.key) : renderNewCompetition(app);
    document.title = `${r.page === 'newcomp' ? 'Host a competition' : 'Competition'} · Break the Cloud`;
    return;
  }
  if (r.page === 'deck') {
    unmount = renderDeck(app);
    document.title = 'Concept deck · Break the Cloud';
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
