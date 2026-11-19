import { beforeEach, describe, expect, it } from 'vitest';
import { GAMES, LEVELS, builtGames } from '../../src/games/registry';
import { parseHash } from '../../src/shell/router';
import { allBest, careerPoints, saveBest, storage } from '../../src/lib/storage';
import { checkNickname } from '../../src/lib/nickname';
import { mockBackend } from '../../src/lib/leaderboard';
import { RULES } from '../../supabase/functions/_shared/rules.ts';
import { meta as dnsMeta } from '../../src/games/dns-detective/meta';
import { meta as hsMeta } from '../../src/games/handshake/meta';
import { meta as lbMeta } from '../../src/games/latency-budget/meta';
import { meta as hbMeta } from '../../src/games/heartbeat/meta';
import { meta as rlMeta } from '../../src/games/rate-limiter/meta';
import { meta as chMeta } from '../../src/games/cache-hit/meta';
import { meta as thMeta } from '../../src/games/thundering-herd/meta';
import { meta as rgMeta } from '../../src/games/the-ring/meta';
import { meta as asMeta } from '../../src/games/autoscaler/meta';
import { meta as bpMeta } from '../../src/games/backpressure/meta';
import { meta as rsMeta } from '../../src/games/retry-storm/meta';
import { meta as cbMeta } from '../../src/games/circuit-breaker/meta';
import { meta as brMeta } from '../../src/games/blast-radius/meta';
import { meta as ptMeta } from '../../src/games/partition/meta';
import { meta as qrMeta } from '../../src/games/quorum/meta';
import { meta as ckMeta } from '../../src/games/clock-skew/meta';
import { meta as tpMeta } from '../../src/games/two-phase-commit/meta';
import { meta as sgMeta } from '../../src/games/saga/meta';
import { meta as gsMeta } from '../../src/games/gossip/meta';
import { meta as bzMeta } from '../../src/games/byzantine-generals/meta';
import { meta as crMeta } from '../../src/games/crdt-merge/meta';
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
    expect(parseHash('#/deck')).toEqual({ page: 'deck', seed: null });
    expect(parseHash('#/join/ab3k9z')).toEqual({ page: 'join', id: 'AB3K9Z', seed: null });
    expect(parseHash('#/classes/new')).toEqual({ page: 'newclass', seed: null });
    expect(parseHash('#/class/AB3K9Z?key=XYZ123')).toEqual({ page: 'class', id: 'AB3K9Z', seed: null, key: 'XYZ123' });
    expect(parseHash('#/class/AB3K9Z')).toEqual({ page: 'class', id: 'AB3K9Z', seed: null, key: undefined });
  });
});

describe('storage', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  });
  it('keeps the best score (more points wins; equal points, less time wins)', () => {
    expect(saveBest('x', { ms: 5000, moves: 3, points: 1000, stars: 2 }).pb).toBe(true);
    expect(saveBest('x', { ms: 4000, moves: 1, points: 900, stars: 2 }).pb).toBe(false);
    expect(saveBest('x', { ms: 6000, moves: 9, points: 1200, stars: 3 }).pb).toBe(true);
    expect(saveBest('x', { ms: 5500, moves: 9, points: 1200, stars: 3 }).pb).toBe(true);
    expect(allBest().x).toMatchObject({ ms: 5500, points: 1200, stars: 3 });
    saveBest('y', { ms: 1, moves: 1, points: 300, stars: 1 });
    expect(careerPoints()).toBe(1500);
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

describe('nicknames', () => {
  it.each(['ab', 'x'.repeat(21), 'go to evil.com', 'http stuff', 'f.u.c.k', '<b>hi</b>', 'Admin'])('rejects %j', (n) => {
    expect(checkNickname(n).ok).toBe(false);
  });
  it.each(['packet_pusher', 'Raft Raccoon', 'node-7', 'J.Doe'])('accepts %j', (n) => {
    expect(checkNickname(n).ok).toBe(true);
  });
});

describe('mock leaderboard backend', () => {
  it('validates runs like the server and ranks the player', async () => {
    const b = mockBackend();
    const id = (await b.startRun('traffic-cop'))!;
    const bad = await b.finishRun(id, { taskMs: [0, 1, 2, 3, 4], mistakes: [0, 0, 0, 0, 0], comboPoints: [0, 0, 0, 0, 0], penaltyMs: 0, moves: 1 });
    expect(bad.ok).toBe(false);
    expect((await b.setNickname('raft_raccoon')).reason).toMatch(/taken/);
    expect((await b.setNickname('new_player')).ok).toBe(true);
    expect((await b.top('traffic-cop', 'all'))!.length).toBe(3);
  });
});

describe('curriculum registry', () => {
  it('has 8 levels and 24 games; every built game has scoring rules', () => {
    expect(LEVELS.length).toBe(8);
    expect(GAMES.length).toBe(24);
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(24);
    for (const g of builtGames()) expect(RULES[g.id], g.id).toBeDefined();
    for (const L of LEVELS) expect(GAMES.filter((g) => g.level === L.n).length).toBe(3);
  });
});

describe('game metadata follows the walkthrough rules', () => {
  for (const m of [dnsMeta, hsMeta, lbMeta, hbMeta, rlMeta, chMeta, thMeta, rgMeta, asMeta, bpMeta, rsMeta, cbMeta, brMeta, ptMeta, qrMeta, ckMeta, tpMeta, sgMeta, gsMeta, bzMeta, crMeta, tc, rd, sb]) {
    it(m.id, () => {
      expect(m.tasks.length).toBeGreaterThanOrEqual(3);
      expect(m.tasks.length).toBeLessThanOrEqual(5);
      expect(m.tasks[0]).toMatch(/^Tutorial/);
      expect(m.lessons.length).toBe(m.tasks.length);
      expect(m.minTimeMs.length).toBe(m.tasks.length);
      expect(m.parMs.length).toBe(m.tasks.length);
      expect(m.howTo.length).toBe(3);
      expect(m.walkthrough.length).toBeGreaterThanOrEqual(2);
      expect(new Set(m.walkthrough.map((w) => w.text)).size).toBe(m.walkthrough.length);
      expect(m.learnMore.links.length).toBeGreaterThanOrEqual(2);
      // Teaching layer: a story line, a concept card before the tutorial, a hint ladder for every real task.
      expect(m.pager?.length ?? 0).toBeGreaterThan(20);
      expect(m.learn?.[0]?.frames.length ?? 0).toBeGreaterThanOrEqual(1);
      expect(m.learn!.length).toBeLessThanOrEqual(m.tasks.length);
      for (const c of m.learn!) {
        if (!c) continue;
        expect(c.frames.every((f) => f.html.length > 20)).toBe(true);
        if (c.check) {
          expect(c.check.answer).toBeGreaterThanOrEqual(0);
          expect(c.check.answer).toBeLessThan(c.check.options.length);
        }
      }
      for (let t = 1; t < m.tasks.length; t++) {
        const h = m.hints?.[t];
        expect(h, `hint for task ${t + 1}`).toBeTruthy();
        expect(h!.nudge.length && h!.concept.length && h!.show.length).toBeTruthy();
      }
      expect(m.learnMore.links.length).toBeLessThanOrEqual(3);
      expect(m.learnMore.diagram).toContain('<svg');
      expect(GAMES.find((g) => g.id === m.id)?.title).toBe(m.title);
    });
  }
});
