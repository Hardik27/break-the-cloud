import { describe, expect, it } from 'vitest';
import * as bp from '../../src/games/backpressure/sim';

describe('task 2: drain the backlog', () => {
  it('2 consumers (3/s) cannot keep up with 4 arrivals per second: the queue grows', () => {
    const d = bp.createDrain(1);
    bp.stepDrain(d, 10_000);
    expect(d.queue).toBeGreaterThan(bp.START_BACKLOG);
    expect(bp.eta(d)).toBe(Infinity);
  });
  it('8 consumers drain it; then 4 keep up', () => {
    const d = bp.createDrain(1);
    d.consumers = 8;
    const ev = bp.stepDrain(d, 20_000);
    expect(ev).toContainEqual({ type: 'drained' });
    d.consumers = 4;
    bp.stepDrain(d, 5_000);
    expect(bp.drainDone(d)).toBe(true);
    expect(d.dbOverMs).toBe(0);
  });
  it('more than 8 consumers overload the database and halve throughput', () => {
    const fast = bp.createDrain(1), over = bp.createDrain(1);
    fast.consumers = 8;
    over.consumers = 12;
    expect(bp.eta(over)).toBeGreaterThan(bp.eta(fast));
    expect(bp.stepDrain(over, 1100)).toContainEqual({ type: 'db-second' });
  });
  it('staying scaled up after draining wastes money', () => {
    const d = bp.createDrain(1);
    d.consumers = 8;
    bp.stepDrain(d, 20_000);
    expect(bp.stepDrain(d, 3_000 + bp.IDLE_GRACE_MS).filter((e) => e.type === 'idle-second').length).toBeGreaterThanOrEqual(2);
  });
});

describe('task 3: poison messages', () => {
  it('a poison message crashes the consumer and blocks the queue behind it', () => {
    const p = bp.createPoison(2);
    let crashes = 0;
    for (let t = 0; t < 40_000 && crashes < 3; t += 100) crashes += bp.stepPoison(p, 100).filter((e) => e.type === 'crash').length;
    expect(crashes).toBe(3);
    const head = p.queue[0];
    expect(head.poison).toBe(true);
    const processedBefore = p.processed;
    bp.stepPoison(p, 5_000);
    expect(p.processed).toBe(processedBefore);
  });
  it('moving it to the DLQ unblocks the queue; three poisons arrive one after another', () => {
    const p = bp.createPoison(2);
    for (let t = 0; t < 120_000 && !bp.poisonDone(p); t += 100) {
      bp.stepPoison(p, 100);
      const bad = p.queue.find((m) => m.poison && m.receives >= 1);
      if (bad) expect(bp.toDlq(p, bad.id)).toBe('quarantined');
    }
    expect(bp.poisonDone(p)).toBe(true);
    expect(p.processed).toBeGreaterThan(5);
  });
  it('dead-lettering a good order is a mistake', () => {
    const p = bp.createPoison(2);
    expect(bp.toDlq(p, p.queue[0].id)).toBe('good-order');
  });
  it('the tutorial starts with a poison message at the front, already tried twice', () => {
    const p = bp.createPoison(0);
    expect(p.queue[0]).toMatchObject({ poison: true, receives: 2 });
    expect(bp.stepPoison(p, 10_000)).toEqual([]);
  });
});

describe('task 4: how many tries', () => {
  it('only 3 tries passes: 1 loses good orders, 10 or never let poison stall the queue', () => {
    expect(bp.MAX_RECEIVES.filter((m) => bp.dlqOk(bp.runDlq(m)))).toEqual([3]);
    expect(bp.runDlq(1).lostGood).toBe(6);
    expect(bp.runDlq(10).leftGood).toBeGreaterThan(0);
    expect(bp.runDlq(Infinity).poisonQuarantined).toBe(0);
  });
});
