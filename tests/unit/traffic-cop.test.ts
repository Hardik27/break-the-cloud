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

/** Pull crashed servers and return recovered ones right away. */
const keepRotation = (s: tc.State) =>
  s.servers.forEach((srv, i) => {
    if (srv.up !== srv.inRotation) tc.toggleRotation(s, i);
  });

describe('task 1: tutorial', () => {
  it('waits for injected requests and never times them out', () => {
    const s = fresh(0);
    for (let i = 0; i < 200; i++) tc.step(s, 100);
    expect(s.queue).toBeNull();
    tc.inject(s, false);
    for (let i = 0; i < 200; i++) tc.step(s, 100);
    expect(s.queue).not.toBeNull();
    expect(tc.route(s, 0)[0]).toMatchObject({ type: 'served', server: 0, manual: true });
    tc.inject(s, true);
    expect(tc.route(s, 1)[0]).toMatchObject({ type: 'served', heavy: true });
    expect(tc.load(s.servers[1])).toBe(3);
  });
});

describe('task 2: rush hour by hand', () => {
  it('a student who picks a server with room reaches 8 in a row', () => {
    const s = fresh(1);
    expect(runUntilGoal(s, 60_000, (st) => st.queue && st.now - st.queue.born > 500 && tc.route(st, Math.max(0, tc.bestFit(st))))).toBe(true);
    expect(s.drops).toBe(0);
  });
  it('a request left waiting times out and is dropped', () => {
    const s = fresh(1);
    let drops: tc.SimEvent[] = [];
    for (let i = 0; i < 100 && !drops.length; i++) drops = tc.step(s, 100).filter((e) => e.type === 'drop');
    expect(drops[0]).toMatchObject({ type: 'drop', why: 'it timed out waiting for you' });
    expect(s.streak).toBe(0);
  });
  it('piling everything on one server overflows it (the lesson: look at the load)', () => {
    let fails = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = fresh(1, seed);
      runUntilGoal(s, 60_000, (st) => st.queue && st.now - st.queue.born > 500 && tc.route(st, 0));
      if (s.drops >= 4 || !s.stageDone) fails++;
    }
    expect(fails).toBeGreaterThan(20);
  });
});

describe('task 3: be the health check', () => {
  it('requests wait until round robin is switched on, then two servers crash', () => {
    const s = fresh(2);
    for (let i = 0; i < 100; i++) tc.step(s, 100);
    expect(s.results.length).toBe(0);
    tc.setStrategy(s, 'rr');
    expect(s.crashes.map((c) => c.server)).toEqual([1, 2]);
  });
  it('round robin cycles through servers in turn and skips servers out of rotation', () => {
    const s = fresh(2);
    tc.setStrategy(s, 'rr');
    expect([tc.pick(s), tc.pick(s), tc.pick(s), tc.pick(s)]).toEqual([0, 1, 2, 0]);
    tc.toggleRotation(s, 1);
    expect([tc.pick(s), tc.pick(s), tc.pick(s)]).toEqual([2, 0, 2]);
  });
  it('a dead server left in rotation keeps eating every third request', () => {
    const s = fresh(2, 3);
    tc.setStrategy(s, 'rr');
    const whys: string[] = [];
    runUntilGoal(s, 60_000, (_st, ev) => ev.forEach((e) => e.type === 'drop' && whys.push(e.why)));
    expect(whys.filter((w) => w.endsWith('is down')).length).toBeGreaterThanOrEqual(8);
  });
  it('pulling dead servers and returning them keeps drops near zero and completes the task', () => {
    const s = fresh(2, 3);
    tc.setStrategy(s, 'rr');
    expect(runUntilGoal(s, 60_000, keepRotation)).toBe(true);
    expect(s.drops).toBeLessThanOrEqual(1);
  });
  it('pull and return report what happened', () => {
    const s = fresh(2);
    s.servers[1].up = false;
    expect(tc.toggleRotation(s, 1)).toBe('pulled-dead');
    expect(tc.toggleRotation(s, 1)).toBe('returned-dead');
    expect(tc.toggleRotation(s, 0)).toBe('pulled-healthy');
    expect(tc.toggleRotation(s, 0)).toBe('returned');
  });
  it('a crashed server comes back after a while', () => {
    const s = fresh(2);
    tc.setStrategy(s, 'rr');
    const ev: tc.SimEvent[] = [];
    for (let i = 0; i < 400; i++) ev.push(...tc.step(s, 50));
    expect(ev.some((e) => e.type === 'crash' && e.server === 1)).toBe(true);
    expect(ev.some((e) => e.type === 'recover' && e.server === 1)).toBe(true);
    expect(s.servers[1].up).toBe(true);
  });
});

describe('task 4: heavy hitters', () => {
  it('round robin holds heavy requests so the student can override, and says where it would send them', () => {
    const s = fresh(3);
    let held = false;
    for (let i = 0; i < 200 && !held; i++) {
      tc.step(s, 50);
      if (s.queue?.heavy && tc.holdLeft(s) > 0) held = true;
    }
    expect(held).toBe(true);
    expect(tc.peek(s)).toBeGreaterThanOrEqual(0);
  });
  it('left alone, round robin drops heavy requests (they arrive in its rhythm)', () => {
    let fails = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = fresh(3, seed);
      runUntilGoal(s, 60_000);
      if (!s.stageDone || s.drops >= 4) fails++;
    }
    expect(fails).toBeGreaterThan(15);
  });
  it('overriding each heavy request to the emptiest server wins', () => {
    let wins = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = fresh(3, seed);
      const ok = runUntilGoal(s, 60_000, (st) => {
        if (st.queue?.heavy && st.now - st.queue.born > 500) tc.route(st, Math.max(0, tc.bestFit(st)));
      });
      if (ok && s.drops <= 2) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(28);
  });
});

describe('task 5: boss wave', () => {
  it('least loaded sends everything to a crashed server in rotation (it looks empty)', () => {
    const s = fresh(4);
    tc.setStrategy(s, 'least');
    s.servers[0].up = false;
    s.servers[1].jobs.push({ size: 1, end: 1e9 });
    s.servers[2].jobs.push({ size: 1, end: 1e9 });
    expect(tc.pick(s)).toBe(0);
    tc.toggleRotation(s, 0);
    expect(tc.pick(s)).not.toBe(0);
  });
  it('round robin usually fails the boss wave', () => {
    let fails = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = fresh(4, seed);
      runUntilGoal(s, 60_000, keepRotation);
      if (!s.stageDone || s.drops >= 4) fails++;
    }
    expect(fails).toBeGreaterThan(15);
  });
  it('least loaded plus pulling the dead server wins', () => {
    let wins = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = fresh(4, seed);
      tc.setStrategy(s, 'least');
      if (runUntilGoal(s, 60_000, keepRotation) && s.drops <= 3) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(27);
  });
  it('the goal only counts after the crash has happened', () => {
    const s = fresh(4);
    tc.setStrategy(s, 'least');
    s.streak = 99;
    expect(tc.crashesOver(s)).toBe(false);
    tc.step(s, 100);
    expect(s.stageDone).toBe(false);
  });
});
