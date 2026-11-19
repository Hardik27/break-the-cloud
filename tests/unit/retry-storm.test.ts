import { describe, expect, it } from 'vitest';
import * as rs from '../../src/games/retry-storm/sim';

describe('task 2: pacing retries', () => {
  it('sending only when there is room gets every retry through', () => {
    const p = rs.createPace(1);
    while (!rs.paceDone(p) && p.now < 60_000) {
      rs.stepPace(p, 50);
      if (rs.loadLastSecond(p) + 1 <= rs.paceCapacity(p)) expect(rs.send(p)).toBe('ok');
    }
    expect(p.failed).toBe(0);
    expect(p.now).toBeGreaterThan(5000);
  });
  it('spamming the API fails, and failed attempts still count as load', () => {
    const p = rs.createPace(1);
    rs.send(p);
    expect(rs.send(p)).toBe('overloaded');
    expect(rs.loadLastSecond(p)).toBe(2);
    expect(rs.send(p)).toBe('overloaded');
  });
});

describe('tasks 3–4: policies during an outage', () => {
  const r = (p: rs.Policy, j = false) => rs.storm(p, j);
  it('immediate retries multiply the load during the outage', () => {
    expect(r('immediate').outageLoad).toBeGreaterThan(3);
  });
  it('a fixed 1 s wait keeps sending full normal load into a crippled API', () => {
    expect(r('fixed').outageLoad).toBeCloseTo(1, 1);
  });
  it('exponential backoff cuts outage load below the goal', () => {
    expect(rs.POLICIES.filter((p) => rs.backoffOk(r(p)))).toEqual(['exponential']);
  });
  it('without jitter, clients that failed together retry together: huge spikes', () => {
    expect(r('exponential').peakAfter).toBeGreaterThan(3);
  });
  it('only exponential backoff with jitter passes task 4', () => {
    const ok = rs.POLICIES.flatMap((p) => [false, true].map((j) => [p, j] as const)).filter(([p, j]) => rs.jitterOk(r(p, j)));
    expect(ok).toEqual([['exponential', true]]);
  });
  it('normal traffic is about 100 requests per second before the crash', () => {
    const load = r('exponential').loadPerSec;
    expect(load[2]).toBe(100);
  });
});
