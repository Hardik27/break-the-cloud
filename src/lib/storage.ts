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
}

export const allBest = (): Record<string, Best> => storage.get<Record<string, Best>>('best', {});
export const getBest = (gameId: string): Best | undefined => allBest()[gameId];

/** Saves the run if it beats the stored best. Returns true for a new personal best. */
export function saveBest(gameId: string, ms: number, moves: number): boolean {
  const best = allBest();
  const prev = best[gameId];
  if (prev && prev.ms <= ms) return false;
  best[gameId] = { ms: Math.round(ms), moves, at: new Date().toISOString() };
  storage.set('best', best);
  return true;
}
