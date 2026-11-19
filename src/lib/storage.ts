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
