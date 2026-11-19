/**
 * Backpressure: message queues, consumers and dead-letter queues. Pure simulation, no DOM.
 *
 * Tasks:
 *   0 tutorial   add a consumer; move a crashing message to the dead-letter queue
 *   1 drain      scale consumers to drain a backlog without overloading the database, then scale back
 *   2 poison     a poison message crashes every consumer and blocks the queue; quarantine it (3 times)
 *   3 auto DLQ   choose how many tries a message gets before it is moved to the DLQ
 */

// ---------- task 1: drain the backlog ----------
export const ARRIVALS_PER_S = 4;
export const PER_CONSUMER = 1.5;
export const DB_MAX = 8;
export const SETTLED_MAX = 4;
export const START_BACKLOG = 120;
/** After draining, the player gets this long to scale back down before idle consumers count as waste. */
export const IDLE_GRACE_MS = 4000;

export interface Drain {
  now: number;
  queue: number;
  consumers: number;
  drained: boolean;
  drainedAt: number;
  dbOverMs: number;
  idleMs: number;
  frozen: boolean;
}
export function createDrain(task: number): Drain {
  return { now: 0, queue: task === 0 ? 40 : START_BACKLOG, consumers: 2, drained: false, drainedAt: 0, dbOverMs: 0, idleMs: 0, frozen: task === 0 };
}
export type DrainEvent = { type: 'db-second' } | { type: 'idle-second' } | { type: 'drained' };

/** Each consumer handles 1.5 messages a second; more than 8 at once overload the database and halve throughput. */
export function stepDrain(d: Drain, dt: number): DrainEvent[] {
  const ev: DrainEvent[] = [];
  if (d.frozen) return ev;
  const end = d.now + dt;
  while (d.now < end) {
    const h = Math.min(20, end - d.now) / 1000;
    d.now += h * 1000;
    const over = d.consumers > DB_MAX;
    const rate = d.consumers * PER_CONSUMER * (over ? 0.5 : 1);
    d.queue = Math.max(0, d.queue + ARRIVALS_PER_S * h - rate * h);
    if (over) {
      const b = Math.floor(d.dbOverMs / 1000);
      d.dbOverMs += h * 1000;
      if (Math.floor(d.dbOverMs / 1000) > b) ev.push({ type: 'db-second' });
    }
    if (!d.drained && d.queue < 1) {
      d.drained = true;
      d.drainedAt = d.now;
      ev.push({ type: 'drained' });
    }
    if (d.drained && d.now - d.drainedAt > IDLE_GRACE_MS && d.consumers > SETTLED_MAX && d.queue < 2) {
      const b = Math.floor(d.idleMs / 1000);
      d.idleMs += h * 1000;
      if (Math.floor(d.idleMs / 1000) > b) ev.push({ type: 'idle-second' });
    }
  }
  return ev;
}
/** Seconds until the backlog is gone at the current rate (Infinity if it is growing). */
export function eta(d: Drain): number {
  const net = d.consumers * PER_CONSUMER * (d.consumers > DB_MAX ? 0.5 : 1) - ARRIVALS_PER_S;
  return net > 0 ? d.queue / net : Infinity;
}
export const drainDone = (d: Drain): boolean => d.drained && d.consumers <= SETTLED_MAX && d.queue < 10;

// ---------- tasks 0 and 2: the poison message ----------
export interface Msg { id: number; payload: string; poison: boolean; receives: number }
export const POISONS = 3;
export const ATTEMPT_MS = 1000;
export const RESTART_MS = 2000;
const ITEMS = ['book', 'lamp', 'mug', 'shoes', 'phone', 'desk', 'chair', 'pen'];
const BAD = ['{"qty": "ten"}', '{"qty": -3}', '{"price": null}'];

export interface Poison {
  now: number;
  queue: Msg[];
  nextId: number;
  nextAttempt: number;
  downUntil: number;
  arrivals: number;
  poisonsSent: number;
  handled: number;
  crashes: number;
  processed: number;
  dlq: Msg[];
  log: string[];
  frozen: boolean;
}

function order(p: Poison, poison: boolean): Msg {
  const id = p.nextId++;
  return { id, poison, receives: 0, payload: poison ? `{"order": ${id}, ${BAD[p.poisonsSent % BAD.length].slice(1)}` : `{"order": ${id}, "item": "${ITEMS[id % ITEMS.length]}", "qty": ${1 + (id % 3)}}` };
}

export function createPoison(task: number): Poison {
  const p: Poison = { now: 0, queue: [], nextId: 1001, nextAttempt: 1200, downUntil: 0, arrivals: 0, poisonsSent: 0, handled: 0, crashes: 0, processed: 0, dlq: [], log: [], frozen: task === 0 };
  if (task === 0) {
    const bad = order(p, true);
    bad.receives = 2;
    p.poisonsSent++;
    p.queue.push(bad, order(p, false), order(p, false), order(p, false));
    p.log.unshift(`Consumer crashed on order ${bad.id} (2nd time). Order ${bad.id} is back at the front of the queue.`);
  } else {
    for (let i = 0; i < 6; i++) p.queue.push(order(p, false));
  }
  return p;
}

export type PoisonEvent = { type: 'processed'; id: number } | { type: 'crash'; id: number; receives: number };

/** One consumer takes the message at the front every second. A poison message crashes it and goes back to the front. */
export function stepPoison(p: Poison, dt: number): PoisonEvent[] {
  const ev: PoisonEvent[] = [];
  if (p.frozen) return ev;
  const end = p.now + dt;
  while (p.now < end) {
    p.now = Math.min(end, p.now + 20);
    // Keep the queue topped up; poison messages arrive after each one is dealt with.
    if (p.queue.length < 7) {
      p.arrivals++;
      const poisonDue = p.poisonsSent < POISONS && p.poisonsSent === p.handled && p.arrivals % 3 === 0 && !p.queue.some((m) => m.poison);
      p.queue.push(order(p, poisonDue));
      if (poisonDue) p.poisonsSent++;
    }
    if (p.now < p.downUntil || p.now < p.nextAttempt || !p.queue.length) continue;
    p.nextAttempt = p.now + ATTEMPT_MS;
    const m = p.queue[0];
    m.receives++;
    if (m.poison) {
      p.crashes++;
      p.downUntil = p.now + RESTART_MS;
      p.log.unshift(`Consumer crashed on order ${m.id} (attempt ${m.receives}). It restarts; order ${m.id} goes back to the front.`);
      ev.push({ type: 'crash', id: m.id, receives: m.receives });
    } else {
      p.queue.shift();
      p.processed++;
      p.log.unshift(`Processed order ${m.id}.`);
      ev.push({ type: 'processed', id: m.id });
    }
    if (p.log.length > 6) p.log.length = 6;
  }
  return ev;
}

export function toDlq(p: Poison, id: number): 'quarantined' | 'good-order' | 'gone' {
  const i = p.queue.findIndex((m) => m.id === id);
  if (i < 0) return 'gone';
  const [m] = p.queue.splice(i, 1);
  p.dlq.push(m);
  p.log.unshift(`You moved order ${m.id} to the dead-letter queue.`);
  if (!m.poison) return 'good-order';
  p.handled++;
  return 'quarantined';
}
export const poisonDone = (p: Poison): boolean => p.handled >= POISONS;

// ---------- task 3: automatic dead-lettering ----------
export const MAX_RECEIVES = [1, 3, 10, Infinity] as const;
export const RUN_S = 120;
export const CRASH_BUDGET = 10;
export interface DlqResult { maxReceive: number; processed: number; lostGood: number; poisonQuarantined: number; crashes: number; leftGood: number }

/**
 * 60 orders, one consumer at 1 per second. Six orders hit a network blip and fail once (they succeed on the
 * next try). Three are poison and crash the consumer every time (5 s to restart). A message is moved to the
 * DLQ after `maxReceive` failed tries.
 */
export function runDlq(maxReceive: number): DlqResult {
  type M = { kind: 'ok' | 'blip' | 'poison'; tries: number };
  const q: M[] = Array.from({ length: 60 }, (_, i) => ({ kind: [7, 15, 23, 31, 44, 52].includes(i) ? 'blip' : [10, 27, 40].includes(i) ? 'poison' : 'ok', tries: 0 }));
  let t = 0, processed = 0, lostGood = 0, quarantined = 0, crashes = 0;
  while (t < RUN_S && q.length) {
    const m = q[0];
    m.tries++;
    const fails = m.kind === 'poison' || (m.kind === 'blip' && m.tries === 1);
    if (!fails) {
      q.shift();
      processed++;
      t += 1;
      continue;
    }
    if (m.kind === 'poison') {
      crashes++;
      t += 5;
    } else t += 1;
    if (m.tries >= maxReceive) {
      q.shift();
      if (m.kind === 'poison') quarantined++;
      else lostGood++;
    }
  }
  const leftGood = q.filter((m) => m.kind !== 'poison').length;
  return { maxReceive, processed, lostGood, poisonQuarantined: quarantined, crashes, leftGood };
}
export const dlqOk = (r: DlqResult): boolean => r.lostGood === 0 && r.crashes <= CRASH_BUDGET && r.leftGood === 0;
