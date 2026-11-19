import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/lib/rng';
import * as tc from '../../src/games/traffic-cop/sim';

const fresh = (stage: number, seed = 1) => {
  const s = tc.create(mulberry32(seed));
  tc.enterStage(s, stage);
  return s;
};

/** Steps until the stage goal or the time limit. Returns true on goal. */
function runUntilGoal(s: tc.State, ms: number, onTick?: (s: tc.State, ev: tc.SimEvent[]) => void): boolean {
  const end = s.now + ms;
  let ev: tc.SimEvent[] = [];
  while (s.now < end) {
    onTick?.(s, ev);
    ev = tc.step(s, 50);
    if (s.stageDone) return true;
  }
  return false;
}

describe('tutorial (task 1)', () => {
  it('waits for injected requests and never times them out', () => {
    const s = fresh(0);
    for (let i = 0; i < 200; i++) tc.step(s, 100);
    expect(s.queue).toBeNull();
    tc.inject(s, false);
    for (let i = 0; i < 200; i++) tc.step(s, 100);
    expect(s.queue).not.toBeNull();
    const ev = tc.route(s, 0);
    expect(ev[0]).toMatchObject({ type: 'served', server: 0 });
    tc.inject(s, true);
    expect(tc.route(s, 1)[0]).toMatchObject({ type: 'served', heavy: true });
    expect(tc.load(s.servers[1])).toBe(3);
  });
});

describe('task 2: route by hand', () => {
  it('a student who picks a server with room reaches 10 in a row', () => {
    const s = fresh(1);
    const ok = runUntilGoal(s, 60_000, (st) => {
      if (st.queue && st.now - st.queue.born > 500) tc.route(st, Math.max(0, tc.bestFit(st)));
    });
    expect(ok).toBe(true);
  });
  it('a request left waiting times out and is dropped', () => {
    const s = fresh(1);
    let drops: tc.SimEvent[] = [];
    for (let i = 0; i < 100 && !drops.length; i++) drops = tc.step(s, 100).filter((e) => e.type === 'drop');
    expect(drops[0]).toMatchObject({ type: 'drop', why: 'it timed out waiting for you' });
    expect(s.streak).toBe(0);
  });
  it('a heavy request sent to a busy server is dropped', () => {
    const s = fresh(1);
    s.queue = { size: 1, dur: 5000, born: 0, heavy: false };
    tc.route(s, 0);
    s.queue = { size: 1, dur: 5000, born: 0, heavy: false };
    tc.route(s, 0);
    s.queue = { size: 3, dur: 5000, born: 0, heavy: true };
    expect(tc.route(s, 0)[0]).toMatchObject({ type: 'drop', why: 'web-1 was full' });
  });
});

describe('task 3: round robin and a crash', () => {
  it('requests wait until round robin is chosen', () => {
    const s = fresh(2);
    for (let i = 0; i < 100; i++) tc.step(s, 100);
    expect(s.results.length).toBe(0);
    tc.setStrategy(s, 'rr');
    for (let i = 0; i < 20; i++) tc.step(s, 100);
    expect(s.results.length).toBeGreaterThan(0);
  });
  it('round robin cycles through servers in turn', () => {
    const s = fresh(2);
    tc.setStrategy(s, 'rr');
    expect([tc.pick(s), tc.pick(s), tc.pick(s), tc.pick(s)]).toEqual([0, 1, 2, 0]);
  });
  it('without health checks, round robin keeps sending traffic to the dead server and never reaches 15', () => {
    const s = fresh(2, 3);
    tc.setStrategy(s, 'rr');
    const downDrops: string[] = [];
    const ok = runUntilGoal(s, 60_000, (_st, ev) => ev.forEach((e) => e.type === 'drop' && downDrops.push(e.why)));
    expect(ok).toBe(false);
    expect(s.servers[1].up).toBe(false);
    expect(downDrops.filter((w) => w === 'web-2 is down').length).toBeGreaterThan(20);
  });
  it('with health checks after the crash, the streak reaches 15', () => {
    const s = fresh(2, 3);
    tc.setStrategy(s, 'rr');
    const ok = runUntilGoal(s, 60_000, (st, ev) => {
      if (ev.some((e) => e.type === 'crash')) tc.setHealth(st, true);
    });
    expect(ok).toBe(true);
    expect(s.servers[1].up).toBe(false);
  });
  it('least-loaded without health checks sends everything to the dead server (it looks empty)', () => {
    const s = fresh(2);
    s.servers[1].up = false;
    s.strategy = 'least';
    s.servers[0].jobs.push({ size: 1, end: 1e9 });
    s.servers[2].jobs.push({ size: 1, end: 1e9 });
    expect(tc.pick(s)).toBe(1);
    tc.setHealth(s, true);
    expect(tc.pick(s)).not.toBe(1);
  });
});

describe('task 4: heavy traffic mix', () => {
  it('round robin usually drops heavy requests (it ignores load)', () => {
    let fails = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = fresh(3, seed);
      if (!runUntilGoal(s, 60_000)) fails++;
    }
    expect(fails).toBeGreaterThan(20);
  });
  it('round robin sends the heavy-prone third request to the same server every time', () => {
    const s = fresh(3, 9);
    const heavyOn = new Set<number>();
    for (let i = 0; i < 400; i++) tc.step(s, 50).forEach((e) => e.type === 'served' && e.heavy && heavyOn.add(e.server));
    expect(heavyOn.has(2)).toBe(true);
  });
  it('least loaded reaches 15 in a row', () => {
    let wins = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = fresh(3, seed);
      tc.setStrategy(s, 'least');
      if (runUntilGoal(s, 60_000)) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(38);
  });
});
