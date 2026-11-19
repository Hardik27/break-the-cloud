/** localStorage wrapper. Every call is wrapped in try/catch: storage can be missing or blocked. */
const PREFIX = 'btc:';

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v === null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* storage full or blocked: the game still works */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  },
  /** Removes everything this site stored in this browser (our keys and any Supabase auth session). */
  clearAll(): number {
    let n = 0;
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith(PREFIX) || k.startsWith('sb-'))) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
      n = keys.length;
    } catch {
      /* ignore */
    }
    return n;
  },
};

export interface Best {
  ms: number;
  moves: number;
  at: string;
  /** Older saves (before scoring) have no points. */
  points?: number;
  stars?: number;
}

export const allBest = (): Record<string, Best> => storage.get<Record<string, Best>>('best', {});
export const getBest = (gameId: string): Best | undefined => allBest()[gameId];

/** Saves the run if it beats the stored best (more points; equal points, less time). */
export function saveBest(gameId: string, run: { ms: number; moves: number; points: number; stars: number }): { pb: boolean; prev?: Best } {
  const best = allBest();
  const prev = best[gameId];
  const better = !prev || run.points > (prev.points ?? 0) || (run.points === (prev.points ?? 0) && run.ms < prev.ms);
  if (!better) return { pb: false, prev };
  best[gameId] = { ms: Math.round(run.ms), moves: run.moves, points: run.points, stars: run.stars, at: new Date().toISOString() };
  storage.set('best', best);
  return { pb: true, prev };
}

/** Sum of your best score in every game: drives the career rank. */
export function careerPoints(): number {
  return Object.values(allBest()).reduce((a, b) => a + (b.points ?? 0), 0);
}
export function careerStars(): number {
  return Object.values(allBest()).reduce((a, b) => a + (b.stars ?? 0), 0);
}

// ---------- learning progress (all local, see #/privacy) ----------
/** Lessons unlocked per game (task indexes): the concept deck. */
export const deck = (): Record<string, number[]> => storage.get<Record<string, number[]>>('deck', {});
export function unlockLesson(gameId: string, task: number): void {
  const d = deck();
  const s = new Set(d[gameId] ?? []);
  s.add(task);
  d[gameId] = [...s].sort((a, b) => a - b);
  storage.set('deck', d);
}
export const deckCount = (): number => Object.values(deck()).reduce((a, x) => a + x.length, 0);

/** Local calendar day, YYYY-MM-DD. */
export function today(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return today(d);
}
export interface Streak { last: string; days: number }
/** Current streak of days with at least one finished game (0 if the chain broke). */
export function streak(): Streak {
  const s = storage.get<Streak>('streak', { last: '', days: 0 });
  return s.last === today() || s.last === yesterday() ? s : { last: s.last, days: 0 };
}
export function markPlayedToday(): Streak {
  const s = storage.get<Streak>('streak', { last: '', days: 0 });
  const t = today();
  const next = s.last === t ? s : { last: t, days: s.last === yesterday() ? s.days + 1 : 1 };
  storage.set('streak', next);
  return next;
}
/** Today's incident: set when the student finishes it. */
export const dailyDone = (): boolean => storage.get<string>('daily', '') === today();
export const markDailyDone = (): void => storage.set('daily', today());
/** Stand-up recall: the day it was answered and whether it was right. */
export const standup = (): { date: string; ok: boolean } | null => storage.get<{ date: string; ok: boolean } | null>('standup', null);
export const saveStandup = (ok: boolean): void => storage.set('standup', { date: today(), ok });

/** The class (training centre or college section) this browser joined, if any. */
export interface JoinedClass { code: string; name: string; city: string }
export const myClass = (): JoinedClass | null => storage.get<JoinedClass | null>('class', null);
export const joinClass = (c: JoinedClass): void => storage.set('class', c);
export const leaveClass = (): void => storage.remove('class');
