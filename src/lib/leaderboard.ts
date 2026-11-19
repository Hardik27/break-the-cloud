/**
 * Leaderboard client. One interface, three backends:
 *   supabase  real shared leaderboard (needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY)
 *   mock      in-memory, for Playwright tests (set window.__BTC_LB__ = 'mock' before the app loads)
 *   offline   no shared board; the game still works and best scores stay in this browser
 * Scores are computed and checked on the server by the finish-run Edge Function.
 */
import type { FinishPayload } from '../../supabase/functions/_shared/validate.ts';
import { validateRun } from '../../supabase/functions/_shared/validate.ts';
import { checkNickname } from './nickname';

export type { FinishPayload };
export type Range = 'all' | 'week';

export interface LbRow {
  rank: number;
  nickname: string;
  points: number;
  ms: number;
  stars: number;
  me: boolean;
}

export interface FinishResult {
  ok: boolean;
  points?: number;
  stars?: number;
  reason?: string;
}

export interface Backend {
  kind: 'supabase' | 'mock' | 'offline';
  /** Records a run start on the server (server timestamp). Returns the run id, or null if offline. */
  startRun(gameId: string): Promise<string | null>;
  finishRun(runId: string, payload: FinishPayload): Promise<FinishResult>;
  top(gameId: string, range: Range): Promise<LbRow[] | null>;
  myRank(gameId: string, range: Range): Promise<{ rank: number; points: number; of: number } | null>;
  nickname(): Promise<string | null>;
  setNickname(n: string): Promise<{ ok: boolean; reason?: string }>;
  stats(): Promise<{ started: number; finished: number } | null>;
  /** Deletes the player's runs and nickname from the server. */
  deleteMyData(): Promise<boolean>;
}

export const offlineBackend: Backend = {
  kind: 'offline',
  startRun: async () => null,
  finishRun: async () => ({ ok: false, reason: 'offline' }),
  top: async () => null,
  myRank: async () => null,
  nickname: async () => null,
  setNickname: async () => ({ ok: false, reason: 'The shared leaderboard is not available right now.' }),
  stats: async () => null,
  deleteMyData: async () => true,
};

/** In-memory backend that behaves like the real one, including server-side validation. */
export function mockBackend(): Backend {
  interface Run { id: string; user: string; game: string; started: number; status: 'started' | 'finished' | 'rejected'; points: number; ms: number; stars: number; at: number }
  const me = 'me';
  const runs: Run[] = [];
  const names = new Map<string, string>([['bot1', 'packet_pusher'], ['bot2', 'raft_raccoon'], ['bot3', 'quorum_queen']]);
  // A few rivals so the board is not empty.
  [['bot1', 2400, 61000], ['bot2', 1900, 75000], ['bot3', 1500, 90000]].forEach(([u, p, ms], i) => {
    for (const game of ['traffic-cop', 'replica-diff', 'split-brain']) {
      runs.push({ id: `seed${i}${game}`, user: u as string, game, started: 0, status: 'finished', points: p as number, ms: ms as number, stars: 2, at: Date.now() });
    }
  });
  let seq = 0;
  const board = (game: string) => {
    const best = new Map<string, Run>();
    for (const r of runs) {
      if (r.game !== game || r.status !== 'finished') continue;
      const b = best.get(r.user);
      if (!b || r.points > b.points || (r.points === b.points && r.ms < b.ms)) best.set(r.user, r);
    }
    return [...best.values()].sort((a, b) => b.points - a.points || a.ms - b.ms);
  };
  return {
    kind: 'mock',
    async startRun(game) {
      const id = `run${++seq}`;
      runs.push({ id, user: me, game, started: performance.now(), status: 'started', points: 0, ms: 0, stars: 0, at: Date.now() });
      return id;
    },
    async finishRun(id, payload) {
      const r = runs.find((x) => x.id === id && x.user === me);
      if (!r || r.status !== 'started') return { ok: false, reason: 'run not found' };
      const v = validateRun(r.game, performance.now() - r.started, payload);
      if (!v.ok) {
        r.status = 'rejected';
        return { ok: false, reason: v.reason };
      }
      Object.assign(r, { status: 'finished', points: v.total, ms: v.ms, stars: v.stars });
      return { ok: true, points: v.total, stars: v.stars };
    },
    async top(game) {
      return board(game).slice(0, 20).map((r, i) => ({ rank: i + 1, nickname: names.get(r.user) ?? 'anonymous', points: r.points, ms: r.ms, stars: r.stars, me: r.user === me }));
    },
    async myRank(game) {
      const b = board(game);
      const i = b.findIndex((r) => r.user === me);
      return i < 0 ? null : { rank: i + 1, points: b[i].points, of: b.length };
    },
    async nickname() {
      return names.get(me) ?? null;
    },
    async setNickname(n) {
      const c = checkNickname(n);
      if (!c.ok) return { ok: false, reason: c.reason };
      if ([...names.entries()].some(([u, x]) => u !== me && x.toLowerCase() === c.value.toLowerCase())) return { ok: false, reason: 'That nickname is taken.' };
      names.set(me, c.value);
      return { ok: true };
    },
    async stats() {
      return { started: runs.length, finished: runs.filter((r) => r.status === 'finished').length };
    },
    async deleteMyData() {
      for (let i = runs.length - 1; i >= 0; i--) if (runs[i].user === me) runs.splice(i, 1);
      names.delete(me);
      return true;
    },
  };
}

let backend: Promise<Backend> | null = null;

export function getBackend(): Promise<Backend> {
  if (backend) return backend;
  backend = (async () => {
    const w = window as unknown as { __BTC_LB__?: string };
    if (w.__BTC_LB__ === 'mock') return mockBackend();
    if (w.__BTC_LB__ === 'offline') return offlineBackend;
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url || !key) return offlineBackend;
    try {
      const { supabaseBackend } = await import('./leaderboard-supabase');
      return supabaseBackend(url, key);
    } catch {
      return offlineBackend;
    }
  })();
  return backend;
}

/** Never let a leaderboard call hang the UI: resolve to `fallback` after ms. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}
