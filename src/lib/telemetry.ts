/**
 * Learning telemetry: what a learner did and for how long, linked to their anonymous id (see #/privacy).
 * No cookies, no IP addresses, no names. Events are batched and sent every 20 s and when the tab is hidden.
 * Active time counts only while the tab is visible and the learner clicked, typed, scrolled or touched in the last minute.
 */
import { getBackend, type TelemetryEvent } from './leaderboard';

type EvType =
  | 'visit' | 'game_open' | 'learn_done' | 'check' | 'predict' | 'hint' | 'tutorial_done'
  | 'task_done' | 'game_finish' | 'abandon' | 'active' | 'book_click';

const FLUSH_MS = 20_000;
const TICK_MS = 5_000;
const IDLE_MS = 60_000;

const uuid = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
  }
};

const session = uuid();
const queue: TelemetryEvent[] = [];
const ctx: { game: string | null; task: number | null } = { game: null, task: null };
let activeMs = 0;
let lastInput = Date.now();
let started = false;
let flushing = false;
let country: Promise<string | null> | null = null;

/** Phone or computer (coarse pointer = touch screen). */
const device = (): string => {
  try {
    return matchMedia('(pointer: coarse)').matches ? 'phone' : 'computer';
  } catch {
    return 'unknown';
  }
};

/** Country code from the site's own Cloudflare endpoint (never the IP address). Cached per tab. */
function getCountry(): Promise<string | null> {
  if (country) return country;
  country = (async () => {
    try {
      const cached = sessionStorage.getItem('btc:country');
      if (cached) return cached === '-' ? null : cached;
    } catch {
      /* ignore */
    }
    try {
      const r = await fetch('/api/geo', { cache: 'no-store' });
      const j = r.ok && (r.headers.get('content-type') ?? '').includes('json') ? ((await r.json()) as { country?: string | null }) : null;
      const c = j?.country && /^[A-Z]{2}$/.test(j.country) ? j.country : null;
      try {
        sessionStorage.setItem('btc:country', c ?? '-');
      } catch {
        /* ignore */
      }
      return c;
    } catch {
      return null;
    }
  })();
  return country;
}

async function flush(): Promise<void> {
  if (activeMs >= 1000) {
    const s = Math.min(120, Math.round(activeMs / 1000));
    activeMs = 0;
    queue.push({ session_id: session, type: 'active', data: { s } });
  }
  if (flushing || !queue.length) return;
  flushing = true;
  try {
    const b = await getBackend();
    while (queue.length) {
      const rows = queue.splice(0, 50);
      if (b.kind !== 'offline') await b.logEvents(rows).catch(() => {});
    }
  } finally {
    flushing = false;
  }
}

function start(): void {
  if (started) return;
  started = true;
  const input = () => (lastInput = Date.now());
  for (const t of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) window.addEventListener(t, input, { passive: true, capture: true });
  setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastInput < IDLE_MS) activeMs += TICK_MS;
  }, TICK_MS);
  setInterval(() => void flush(), FLUSH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
  // The free book: count every click on a link to it, wherever it appears.
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href*="zenodo.org/records/"]');
      if (a) track('book_click', { where: a.id || 'link' });
    },
    true,
  );
  // Tests call this to send what is queued now.
  (window as unknown as { __btcFlush?: () => Promise<void> }).__btcFlush = flush;
}

/** Record one event. Game and task come from the current context unless given. */
export function track(type: EvType, data: Record<string, unknown> = {}, at: { game?: string | null; task?: number | null } = {}): void {
  start();
  queue.push({ session_id: session, type, game_id: at.game !== undefined ? at.game : ctx.game, task: at.task !== undefined ? at.task : ctx.task, data });
}

/** A page was opened: adds the device type and (once per tab) the country. */
export function trackVisit(page: string, id?: string | null): void {
  start();
  const ev: TelemetryEvent = { session_id: session, type: 'visit', game_id: null, task: null, data: { page, ...(id ? { id } : {}), device: device() } };
  queue.push(ev);
  void getBackend().then(async (b) => {
    if (b.kind !== 'supabase') return;
    const c = await getCountry();
    if (c) ev.data = { ...ev.data, country: c };
  });
}

/** The game (and task) being played now, attached to later events. */
export function setGameContext(game: string | null, task: number | null = null): void {
  ctx.game = game;
  ctx.task = task;
}
export function setTaskContext(task: number | null): void {
  ctx.task = task;
}
