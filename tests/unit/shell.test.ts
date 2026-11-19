import { beforeEach, describe, expect, it } from 'vitest';
import { GAMES, LEVELS, builtGames } from '../../src/games/registry';
import { parseHash } from '../../src/shell/router';
import { allBest, saveBest, storage } from '../../src/lib/storage';
import { meta as tc } from '../../src/games/traffic-cop/meta';
import { meta as rd } from '../../src/games/replica-diff/meta';
import { meta as sb } from '../../src/games/split-brain/meta';

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

describe('router', () => {
  it('parses every route', () => {
    expect(parseHash('')).toEqual({ page: 'home', seed: null });
    expect(parseHash('#/')).toEqual({ page: 'home', seed: null });
    expect(parseHash('#/privacy')).toEqual({ page: 'privacy', seed: null });
    expect(parseHash('#/play/split-brain')).toEqual({ page: 'play', id: 'split-brain', seed: null });
    expect(parseHash('#/play/traffic-cop?seed=42')).toEqual({ page: 'play', id: 'traffic-cop', seed: 42 });
  });
});

describe('storage', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  });
  it('keeps only the best time', () => {
    expect(saveBest('x', 5000, 3)).toBe(true);
    expect(saveBest('x', 6000, 1)).toBe(false);
    expect(saveBest('x', 4000, 9)).toBe(true);
    expect(allBest().x.ms).toBe(4000);
  });
  it('clearAll removes our keys and the Supabase session, nothing else', () => {
    storage.set('a', 1);
    localStorage.setItem('sb-xyz-auth-token', '{}');
    localStorage.setItem('other-site', '1');
    expect(storage.clearAll()).toBe(2);
    expect(localStorage.getItem('other-site')).toBe('1');
  });
  it('survives missing localStorage', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(storage.get('a', 7)).toBe(7);
    expect(() => storage.set('a', 1)).not.toThrow();
    expect(storage.clearAll()).toBe(0);
  });
});

describe('curriculum registry', () => {
  it('has 8 levels, 24 games, 3 built', () => {
    expect(LEVELS.length).toBe(8);
    expect(GAMES.length).toBe(24);
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(24);
    expect(builtGames().map((g) => g.id)).toEqual(['traffic-cop', 'replica-diff', 'split-brain']);
    for (const L of LEVELS) expect(GAMES.filter((g) => g.level === L.n).length).toBe(3);
  });
});

describe('game metadata follows the walkthrough rules', () => {
  for (const m of [tc, rd, sb]) {
    it(m.id, () => {
      expect(m.tasks.length).toBeGreaterThanOrEqual(3);
      expect(m.tasks.length).toBeLessThanOrEqual(5);
      expect(m.tasks[0]).toMatch(/^Tutorial/);
      expect(m.lessons.length).toBe(m.tasks.length);
      expect(m.minTimeMs.length).toBe(m.tasks.length);
      expect(m.howTo.length).toBe(3);
      expect(m.walkthrough.length).toBeGreaterThanOrEqual(2);
      expect(new Set(m.walkthrough.map((w) => w.text)).size).toBe(m.walkthrough.length);
      expect(m.learnMore.links.length).toBeGreaterThanOrEqual(2);
      expect(m.learnMore.links.length).toBeLessThanOrEqual(3);
      expect(m.learnMore.diagram).toContain('<svg');
      expect(GAMES.find((g) => g.id === m.id)?.title).toBe(m.title);
    });
  }
});
