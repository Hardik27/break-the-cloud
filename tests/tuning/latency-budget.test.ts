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
  it('task 3: edges (one per slow city) vs. edges in the biggest regions only', () => {
    const correct = ['sa-east', 'eu-west', 'af-west', 'ap-south', 'ap-southeast', 'ap-northeast', 'ap-sydney'];
    const ms = READ + correct.length * 2200;
    // Wrong: "put edges in the big cloud regions" (Oregon, Frankfurt, Ireland, Tokyo, Singapore, Sydney, Mumbai).
    const wrong = ['us-west', 'eu-central', 'eu-west', 'ap-northeast', 'ap-southeast', 'ap-sydney', 'ap-south'];
    let wasted = 0;
    const placed: string[] = [];
    for (const id of wrong) {
      if (!lb.edgeGains(placed, id).length) wasted++;
      placed.push(id);
    }
    report('latency-budget', 'task 3 (wrong: big regions only)', ms / 1000, 1, wasted >= 1 && !lb.allFast(placed) ? 1 : 0);
    expect(ms / 1000).toBeGreaterThanOrEqual(10);
    expect(wasted).toBeGreaterThanOrEqual(1);
    expect(lb.allFast(placed)).toBe(false);
  });
  it('task 4: sorting 8 requests', () => {
    const ms = 3000 + lb.REQUESTS.length * 2000;
    report('latency-budget', 'task 4 (wrong: "cache everything")', ms / 1000, 1, 1);
    expect(ms / 1000).toBeGreaterThanOrEqual(10);
    expect(lb.REQUESTS.filter((r) => !r.edge).length).toBeGreaterThanOrEqual(4);
  });
});
