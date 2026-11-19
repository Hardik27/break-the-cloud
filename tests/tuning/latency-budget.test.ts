/**
 * Difficulty tuning for Latency Budget (a placement puzzle; time is modelled).
 * Students try data centers in a plausible order (biggest cities first); wrong strategies waste moves or edges.
 */
import { describe, expect, it } from 'vitest';
import { between, mulberry32, shuffle } from '../../src/lib/rng';
import * as lb from '../../src/games/latency-budget/sim';
import { median, report } from './util';

const READ = 4000;
const TRY = () => 1800; // look at the map and click

describe('Latency Budget difficulty', () => {
  it('task 2: one server (tries data centers until the goal is met)', () => {
    const times: number[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      const rng = mulberry32(seed);
      // A thoughtful student starts from big population centres, in some random order.
      const order = shuffle(rng, lb.SITES.map((s) => s.id).filter((id) => id !== 'us-east'));
      let ms = READ;
      for (const id of order) {
        ms += TRY() + between(rng, 0, 800);
        if (lb.oneServerOk(id)) break;
      }
      times.push(ms);
    }
    const med = median(times) / 1000;
    report('latency-budget', 'task 2 (no wrong strategy: it is a search)', med, 1, 1);
    expect(med).toBeGreaterThanOrEqual(10);
    expect(med).toBeLessThanOrEqual(40);
  });
  it('task 3: three edges in two rounds vs. one edge per continent', () => {
    // Round 1: 3 placements; round 2: remove one, place one. Plus reading the map.
    const ms = READ * 2 + 5 * 2600;
    const r = lb.EDGE_ROUNDS[0];
    const continents = ['sa-east', 'af-west', 'ap-sydney'];
    report('latency-budget', 'task 3 (wrong: one edge per continent)', ms / 1000, 1, lb.edgeRoundOk(continents, r) ? 0 : 1);
    expect(ms / 1000).toBeGreaterThanOrEqual(10);
    expect(ms / 1000).toBeLessThanOrEqual(40);
    expect(lb.edgeRoundOk(continents, r)).toBe(false);
  });
  it('task 4: sorting 8 requests', () => {
    const ms = 3000 + lb.REQUESTS.length * 2000;
    report('latency-budget', 'task 4 (wrong: "cache everything")', ms / 1000, 1, 1);
    expect(ms / 1000).toBeGreaterThanOrEqual(10);
    expect(lb.REQUESTS.filter((r) => !r.edge).length).toBeGreaterThanOrEqual(4);
  });
});
