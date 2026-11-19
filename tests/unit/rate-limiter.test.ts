import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/lib/rng';
import * as rl from '../../src/games/rate-limiter/sim';

describe('tasks 1–2: the bouncer', () => {
  it('the tutorial lane is frozen with bots in slots 0 and 1', () => {
    const l = rl.createLane(0, mulberry32(1));
    expect(l.chips[0]!.kind).toBe('bot');
    expect(l.chips[1]!.kind).toBe('bot');
    expect(rl.stepLane(l, 5000)).toEqual([]);
    expect(rl.block(l, 0)).toEqual({ ok: true, kind: 'bot' });
    expect(rl.block(l, 2)).toEqual({ ok: false, kind: 'paid' });
  });
  it('ignoring the bots overloads the API', () => {
    const l = rl.createLane(1, mulberry32(3));
    rl.stepLane(l, 20_000);
    expect(l.overloads).toBeGreaterThan(5);
  });
  it('blocking every bot keeps the API under capacity', () => {
    for (let seed = 1; seed < 20; seed++) {
      const l = rl.createLane(1, mulberry32(seed));
      for (let t = 0; t < 20_000; t += 50) {
        rl.stepLane(l, 50);
        l.chips.forEach((c) => c && c.kind === 'bot' && c.state === 'flying' && rl.progress(l, c) > 0.5 && rl.block(l, c.slot));
      }
      expect(l.overloads).toBe(0);
      expect(l.blockedBots).toBeGreaterThanOrEqual(rl.BOTS_TO_BLOCK);
    }
  });
});

describe('the token bucket', () => {
  it('allows a burst up to its size, then refills at its rate', () => {
    const b = new rl.Bucket(2, 6);
    expect(Array.from({ length: 8 }, () => b.take()).filter(Boolean)).toHaveLength(6);
    b.refill(1000);
    expect(b.take() && b.take()).toBe(true);
    expect(b.take()).toBe(false);
  });
});

describe('task 3: a bucket per client', () => {
  const run = (rate: number, burst: number) => rl.simulate(rl.task2Traffic(), { scope: 'client', rate, burst });
  it('with no real limit the bot fills the API', () => {
    const r = run(20, 20);
    expect(r.overloaded).toBe(true);
    expect(r.botOkPerSec).toBeGreaterThan(10);
  });
  it('a burst smaller than a page load (6 requests) blocks real people', () => {
    expect(run(2, 3).legitOkPct).toBeLessThan(60);
  });
  it('only a burst of 6 with a low rate passes', () => {
    const ok = rl.RATES.flatMap((r) => rl.BURSTS.map((b) => [r, b] as const)).filter(([r, b]) => rl.task2Ok(run(r, b)));
    expect(ok).toEqual([[2, 6], [5, 6]]);
  });
});

describe('task 4: per-tenant limits', () => {
  const t3 = rl.task3Traffic();
  it('one shared limit lets the free tenant starve paying ones, at any rate', () => {
    for (const rate of rl.PAID_RATES) expect(rl.task3Ok(rl.simulate(t3, { scope: 'global', rate, burst: rate }))).toBe(false);
  });
  it('per-tenant buckets with a small free tier protect paying tenants', () => {
    const ok = rl.PAID_RATES.flatMap((p) => rl.FREE_RATES.map((f) => [p, f] as const)).filter(([p, f]) => rl.task3Ok(rl.simulate(t3, { scope: 'client', rate: p, burst: p, freeRate: f })));
    expect(ok).toEqual([[5, 2], [5, 5], [10, 2]]);
  });
});
