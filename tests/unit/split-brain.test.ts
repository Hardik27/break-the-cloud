import { describe, expect, it } from 'vitest';
import { between, intBelow, mulberry32 } from '../../src/lib/rng';
import { ALL_LINKS, Raft, TASK_CHECKS, linkKey } from '../../src/games/split-brain/sim';

const cluster = (seed = 1) => new Raft(mulberry32(seed));
const runFor = (r: Raft, ms: number, until?: () => boolean) => {
  const end = r.now + ms;
  while (r.now < end) {
    r.step(100);
    if (until?.()) return true;
  }
  return false;
};
const isolate = (r: Raft, id: number) => ALL_LINKS.filter(([a, b]) => a === id || b === id).forEach(([a, b]) => r.toggleLink(a, b));

describe('a healthy cluster', () => {
  it('elects exactly one leader and commits client writes', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = cluster(seed);
      expect(r.leaders().length).toBe(1);
      runFor(r, 5000);
      expect(r.leaders().length).toBe(1);
      expect(r.maxCommitted()).toBeGreaterThan(3);
      expect(r.violations).toEqual([]);
    }
  });
});

describe('task 2: depose', () => {
  it('crashing the leader makes the others elect a new one; twice completes the task', () => {
    const r = cluster(2);
    const first = r.leaders()[0].id;
    r.toggleNode(first);
    expect(runFor(r, 15_000, () => r.leaders().length === 1)).toBe(true);
    const second = r.leaders()[0].id;
    expect(second).not.toBe(first);
    expect(TASK_CHECKS[1](r)).toBe(false);
    r.toggleNode(second);
    expect(runFor(r, 15_000, () => TASK_CHECKS[1](r))).toBe(true);
  });
  it('doing nothing never deposes a healthy leader', () => {
    const r = cluster(3);
    expect(runFor(r, 30_000, () => TASK_CHECKS[1](r))).toBe(false);
  });
});

describe('task 3: two crowns', () => {
  it('an isolated leader keeps its crown while the majority elects another; reconnecting makes it step down', () => {
    const r = cluster(4);
    const old = r.leaders()[0].id;
    isolate(r, old);
    expect(runFor(r, 10_000, () => r.leaders().length === 2)).toBe(true);
    expect(r.staleLeader).toBe(old);
    const newLeader = r.leaders().find((n) => n.id !== old)!;
    expect(newLeader.term).toBeGreaterThan(r.nodes[old].term);
    expect(TASK_CHECKS[2](r)).toBe(false);
    r.toggleLink(old, newLeader.id);
    expect(runFor(r, 5000, () => TASK_CHECKS[2](r))).toBe(true);
    expect(r.nodes[old].role).toBe('follower');
  });
  it('the stranded leader cannot commit anything (no majority)', () => {
    const r = cluster(5);
    const old = r.leaders()[0].id;
    isolate(r, old);
    const tIso = r.now;
    runFor(r, 8000);
    const sentToStranded = r.requests.filter((q) => q.to === old && q.t0 > tIso);
    expect(sentToStranded.length).toBeGreaterThan(0);
    expect(sentToStranded.filter((q) => q.st === 'ok').length).toBe(0);
  });
  it('crashing the leader instead never shows two crowns', () => {
    const r = cluster(6);
    r.toggleNode(r.leaders()[0].id);
    expect(runFor(r, 20_000, () => TASK_CHECKS[2](r))).toBe(false);
    expect(r.staleLeader).toBeNull();
  });
});

describe('task 4: silence', () => {
  it('8 cuts that leave no server with two neighbours keep the cluster leaderless for 10 s', () => {
    const r = cluster(7);
    const keep = new Set([linkKey(0, 1), linkKey(2, 3)]);
    ALL_LINKS.filter(([a, b]) => !keep.has(linkKey(a, b))).forEach(([a, b]) => r.toggleLink(a, b));
    expect(runFor(r, 15_000, () => TASK_CHECKS[3](r))).toBe(true);
  });
  it('7 cuts are not enough when the leader keeps two followers: it still has a majority', () => {
    const r = cluster(8);
    const L = r.leaders()[0].id;
    const [f1, f2] = [0, 1, 2, 3, 4].filter((i) => i !== L);
    const keep = new Set([linkKey(L, f1), linkKey(L, f2)]);
    const rest = [0, 1, 2, 3, 4].filter((i) => i !== L && i !== f1 && i !== f2);
    keep.add(linkKey(rest[0], rest[1]));
    ALL_LINKS.filter(([a, b]) => !keep.has(linkKey(a, b))).forEach(([a, b]) => r.toggleLink(a, b));
    expect(r.cut.size).toBe(7);
    expect(runFor(r, 30_000, () => TASK_CHECKS[3](r))).toBe(false);
    expect(r.workingLeader()?.id).toBe(L);
  });
});

describe('task 5: storm', () => {
  it('knocking out each new leader forces 4 elections within 20 s', () => {
    const r = cluster(9);
    let crashed: number | null = null;
    const ok = runFor(r, 30_000, () => {
      if (crashed !== null) {
        r.toggleNode(crashed);
        crashed = null;
      } else if (r.leaders()[0]) {
        crashed = r.leaders()[0].id;
        r.toggleNode(crashed);
      }
      return TASK_CHECKS[4](r);
    });
    expect(ok).toBe(true);
  });
  it('crashing followers does not cause elections', () => {
    const r = cluster(10);
    const lead = r.leaders()[0].id;
    const f = (lead + 1) % 5;
    for (let i = 0; i < 10; i++) {
      r.toggleNode(f);
      runFor(r, 1000);
    }
    expect(r.elections.length).toBe(0);
  });
});

describe('safety under random chaos (fuzz)', () => {
  it('never loses a committed write and every log agrees after healing', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const rng = mulberry32(seed * 101);
      const r = cluster(seed);
      let nextChaos = 0;
      while (r.now < 300_000) {
        if (r.now >= nextChaos) {
          nextChaos = r.now + between(rng, 150, 900);
          const x = rng();
          if (x < 0.55) {
            const a = intBelow(rng, 5), b = intBelow(rng, 5);
            if (a !== b) r.toggleLink(a, b);
          } else if (x < 0.8) r.toggleNode(intBelow(rng, 5));
          else if (x < 0.9) r.healAll();
        }
        r.step(100);
      }
      r.healAll();
      r.step(20_000);
      expect(r.violations).toEqual([]);
      expect(r.maxCommitted()).toBeGreaterThan(50);
      for (const n of r.nodes) {
        n.log.slice(0, n.commit).forEach((e, i) => expect(r.committed[i + 1].uid).toBe(e.uid));
      }
    }
  });
});
