import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/lib/rng';
import * as hb from '../../src/games/heartbeat/sim';

describe('task 1: tutorial', () => {
  it('web-3 has crashed and gone silent; evicting it boots a replacement that must be added back', () => {
    const s = hb.create(0, mulberry32(1));
    expect(s.servers[2].state).toBe('dead');
    expect(hb.silence(s, 2)).toBeGreaterThan(2000);
    expect(hb.silence(s, 0)).toBeLessThan(700);
    expect(hb.toggle(s, 2).kind).toBe('evicted-dead');
    expect(hb.toggle(s, 2).kind).toBe('still-booting');
    const ev = hb.step(s, hb.REPLACE_MS + 100);
    expect(ev).toContainEqual({ type: 'replaced', server: 2 });
    expect(s.servers[2].inPool).toBe(false);
    expect(hb.toggle(s, 2).kind).toBe('returned');
  });
});

describe('task 2: you are the failure detector', () => {
  it('schedules 3 crashes and 2 GC pauses on 5 different servers', () => {
    const s = hb.create(1, mulberry32(4));
    expect(s.schedule.filter((e) => e.kind === 'crash')).toHaveLength(3);
    expect(new Set(s.schedule.map((e) => e.server)).size).toBe(5);
  });
  it('a GC pause looks like a crash at first, then the beats resume', () => {
    const s = hb.create(1, mulberry32(4));
    const p = s.schedule.find((e) => e.kind === 'pause')!;
    hb.step(s, p.at - s.now + 900);
    expect(s.servers[p.server].state).toBe('paused');
    expect(hb.silence(s, p.server)).toBeGreaterThan(800);
    expect(hb.toggle(s, p.server).kind).toBe('evicted-paused');
    hb.step(s, p.ms);
    expect(s.servers[p.server].state).toBe('up');
    expect(hb.silence(s, p.server)).toBeLessThan(600);
  });
  it('a crash left in the pool for 7 s is reported (users saw errors)', () => {
    const s = hb.create(1, mulberry32(2));
    const c = s.schedule.find((e) => e.kind === 'crash')!;
    const ev = hb.step(s, c.at - s.now + hb.UNHANDLED_MS + 200);
    expect(ev).toContainEqual({ type: 'overdue', server: c.server });
  });
  it('the longest normal silence (a pause) stays under 2.4 s', () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = hb.create(1, mulberry32(seed));
      let maxQuiet = 0;
      for (let t = 0; t < 20000; t += 20) {
        hb.step(s, 20);
        s.servers.forEach((srv, i) => srv.state !== 'dead' && (maxQuiet = Math.max(maxQuiet, hb.silence(s, i))));
      }
      expect(maxQuiet).toBeLessThan(2400);
    }
  });
});

describe('tasks 3–4: automatic detector', () => {
  it('the starting setting (0.5 s × 1) evicts both pausing servers', () => {
    expect(hb.runDetector(500, 1).falseEvictions).toEqual([1, 3]);
  });
  it('any timeout of 3 s or less evicts the 2.4 s pause', () => {
    for (const i of hb.INTERVALS) for (const t of hb.THRESHOLDS) if (i * t <= 3000) expect(hb.runDetector(i, t).falseEvictions.length).toBeGreaterThan(0);
  });
  it('a long timeout is safe but too slow for task 4', () => {
    const r = hb.runDetector(2000, 5);
    expect(r.falseEvictions).toEqual([]);
    expect(hb.detectorOk(2, r)).toBe(true);
    expect(hb.detectorOk(3, r)).toBe(false);
  });
  it('exactly three settings are both safe and fast', () => {
    const ok = hb.INTERVALS.flatMap((i) => hb.THRESHOLDS.map((t) => [i, t] as const)).filter(([i, t]) => hb.detectorOk(3, hb.runDetector(i, t)));
    expect(ok).toEqual([[1000, 5], [2000, 2], [2000, 3]]);
  });
});
