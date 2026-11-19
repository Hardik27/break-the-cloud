import { describe, expect, it } from 'vitest';
import * as br from '../../src/games/blast-radius/sim';

describe('task 2: spread across zones', () => {
  it('everything in one zone fails the zone-a test', () => {
    const t = br.testAll(br.startPlacement());
    expect(t.find((x) => x.az === 'a')).toMatchObject({ webLeft: 0, dbLeft: 0, ok: false });
  });
  it('two web servers per zone and databases in different zones survive any single zone loss', () => {
    const p = br.startPlacement();
    br.WEBS.forEach((w, i) => (p[w] = br.AZS[i % 3]));
    p['db-primary'] = 'a';
    p['db-replica'] = 'b';
    expect(br.placementOk(p)).toBe(true);
  });
  it('both databases in the same zone is still a single point of failure', () => {
    const p = br.startPlacement();
    br.WEBS.forEach((w, i) => (p[w] = br.AZS[i % 3]));
    p['db-primary'] = 'b';
    p['db-replica'] = 'b';
    expect(br.testAll(p).find((x) => x.az === 'b')!.ok).toBe(false);
  });
});

describe('task 3: losing a zone live', () => {
  it('doing nothing: writes fail and the lunch rush overloads', () => {
    const l = br.createLive();
    while (!l.done) br.stepLive(l, 100);
    expect(l.writesDownMs).toBeGreaterThan(10_000);
    expect(l.shortMs).toBeGreaterThan(5_000);
  });
  it('promoting quickly and adding a server early keeps everything up', () => {
    const l = br.createLive();
    let added = false;
    while (!l.done) {
      br.stepLive(l, 100);
      if (l.down && !br.writesUp(l)) expect(br.promote(l)).toBe('promoted');
      if (l.down && !added) {
        expect(br.addWeb(l, 'c')).toBe('booting');
        added = true;
      }
    }
    expect(l.writesDownMs).toBe(0);
    expect(l.shortMs).toBe(0);
  });
  it('a server launched in the dead zone never comes up', () => {
    const l = br.createLive();
    br.stepLive(l, br.AZ_DOWN_AT + 100);
    expect(br.addWeb(l, 'a')).toBe('dead-zone');
  });
});

describe('task 4: region loss', () => {
  it('only async replication with a warm standby meets RPO, RTO, latency and budget', () => {
    const ok = br.REPLICATION.flatMap((r) => br.STANDBY.map((s) => [r.id, s.id])).filter(([r, s]) => br.evaluateDr(r, s).ok);
    expect(ok).toEqual([['async', 'warm']]);
  });
  it('each wrong choice breaks a different requirement', () => {
    expect(br.evaluateDr('backup', 'warm').rpoOk).toBe(false);
    expect(br.evaluateDr('sync', 'warm').latencyOk).toBe(false);
    expect(br.evaluateDr('async', 'pilot').rtoOk).toBe(false);
    expect(br.evaluateDr('async', 'active').costOk).toBe(false);
  });
});
