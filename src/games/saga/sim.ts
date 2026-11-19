/**
 * Saga: a multi-service booking without a global transaction. Pure data and rules, no DOM.
 *
 * Tasks:
 *   0 tutorial    reserve the flight, then the hotel
 *   1 book        run trips step by step; a timeout is retried, not undone
 *   2 compensate  a step fails for good: undo every completed step, newest first
 *   3 outbox      pick how the booking service records and publishes its event so every email goes out exactly once
 */
import { mulberry32 } from '../../lib/rng';

export interface Step { id: string; svc: string; do: string; undo: string }
export const STEPS: Step[] = [
  { id: 'flight', svc: 'Flights', do: 'Reserve flight', undo: 'Cancel flight' },
  { id: 'hotel', svc: 'Hotels', do: 'Reserve hotel', undo: 'Cancel hotel' },
  { id: 'car', svc: 'Car rental', do: 'Rent car', undo: 'Cancel car' },
  { id: 'card', svc: 'Payments', do: 'Charge card', undo: 'Refund card' },
];

export interface Fail { step: number; kind: 'timeout' | 'permanent'; reason: string }
export interface Trip { who: string; where: string; fail?: Fail }

export const TUTORIAL_TRIP: Trip = { who: 'Zoe', where: 'Lisbon' };
export const BOOK_TRIPS: Trip[] = [
  { who: 'Ana', where: 'Rome' },
  { who: 'Bo', where: 'Oslo', fail: { step: 1, kind: 'timeout', reason: 'Hotels timed out after 2 s' } },
];
export const FAIL_TRIPS: Trip[] = [
  { who: 'Cy', where: 'Tokyo', fail: { step: 2, kind: 'permanent', reason: 'no cars left' } },
  { who: 'Dee', where: 'Cairo', fail: { step: 3, kind: 'permanent', reason: 'card declined' } },
];

export type Status = 'idle' | 'done' | 'failed' | 'undone';
export interface Saga {
  trip: Trip;
  status: Status[];
  attempts: number[];
  outcome: 'booked' | 'rolled back' | null;
}
export const createSaga = (trip: Trip): Saga => ({ trip, status: STEPS.map(() => 'idle'), attempts: STEPS.map(() => 0), outcome: null });

const nextStep = (s: Saga): number => s.status.findIndex((x) => x !== 'done');
const lastDone = (s: Saga): number => s.status.lastIndexOf('done');
export const permanentlyFailed = (s: Saga): boolean => s.status.some((x, i) => x === 'failed' && s.trip.fail?.step === i && s.trip.fail.kind === 'permanent');
const compensating = (s: Saga): boolean => s.status.includes('undone') || permanentlyFailed(s);

export type Result = { ok: true; event: 'done' | 'failed' | 'booked' | 'undone' | 'rolled back'; why?: string } | { ok: false; why: string };

export function doStep(s: Saga, i: number): Result {
  if (s.outcome) return { ok: false, why: 'This trip is finished.' };
  if (compensating(s)) return { ok: false, why: s.status[i] === 'failed' ? `“${s.trip.fail!.reason}” won’t change if you ask again. That step failed for good: undo the steps that succeeded.` : 'The trip can’t be completed any more. Undo the steps that succeeded instead of booking more.' };
  const n = nextStep(s);
  if (s.status[i] === 'done') return { ok: false, why: `${STEPS[i].do}: already done.` };
  if (i !== n) return { ok: false, why: `Steps run in order: ${STEPS[n].do} first.` };
  s.attempts[i]++;
  const f = s.trip.fail;
  if (f && f.step === i && (f.kind === 'permanent' || s.attempts[i] === 1)) {
    s.status[i] = 'failed';
    return { ok: true, event: 'failed', why: f.reason };
  }
  s.status[i] = 'done';
  if (s.status.every((x) => x === 'done')) {
    s.outcome = 'booked';
    return { ok: true, event: 'booked' };
  }
  return { ok: true, event: 'done' };
}

export function undoStep(s: Saga, i: number): Result {
  if (s.outcome) return { ok: false, why: 'This trip is finished.' };
  if (!s.status.includes('failed') && !s.status.includes('undone')) return { ok: false, why: 'Nothing has failed. Undoing a good booking just loses the customer’s trip.' };
  if (!permanentlyFailed(s)) return { ok: false, why: 'A timeout doesn’t mean it failed: the service may just be slow. Retry the step (with the same request id) instead of undoing everything.' };
  if (s.status[i] === 'failed') return { ok: false, why: `${STEPS[i].do} never succeeded, so there is nothing to undo.` };
  if (s.status[i] !== 'done') return { ok: false, why: `${STEPS[i].do} ${s.status[i] === 'undone' ? 'is already undone' : 'never ran'}.` };
  const last = lastDone(s);
  if (i !== last) return { ok: false, why: `Undo newest first: ${STEPS[last].undo} before ${STEPS[i].undo}. Later steps can depend on earlier ones (the car is booked for the flight’s arrival time).` };
  s.status[i] = 'undone';
  if (lastDone(s) < 0) {
    s.outcome = 'rolled back';
    return { ok: true, event: 'rolled back' };
  }
  return { ok: true, event: 'undone' };
}

// ---------- task 3: publishing the "TripBooked" event ----------
export type Design = 'commit-publish' | 'publish-commit' | 'outbox';
export const DESIGNS: { id: Design; label: string; detail: string }[] = [
  { id: 'commit-publish', label: 'Save, then publish', detail: 'commit the booking, then send the event to the broker' },
  { id: 'publish-commit', label: 'Publish, then save', detail: 'send the event, then commit the booking' },
  { id: 'outbox', label: 'Outbox', detail: 'commit the booking and an outbox row in one transaction; a relay publishes the row, then marks it sent' },
];
export const BOOKINGS = 200;
export const CRASH_P = 0.08;
export const CONSUMER_CRASH_P = 0.05;
export interface OutboxResult { lost: number; ghost: number; dup: number }

/** 200 bookings; the booking service, relay or email consumer sometimes crash between steps. */
export function runOutbox(design: Design, dedupe: boolean): OutboxResult {
  const rng = mulberry32(2024);
  let lost = 0, ghost = 0, dup = 0;
  for (let k = 0; k < BOOKINGS; k++) {
    const crashBetween = rng() < CRASH_P; // the service dies between its two writes
    let deliveries = 1;
    if (design === 'commit-publish' && crashBetween) { lost++; continue; }
    if (design === 'publish-commit' && crashBetween) { ghost++; continue; }
    if (design === 'outbox' && crashBetween) deliveries++; // relay published, died before marking sent: publishes again
    if (rng() < CONSUMER_CRASH_P) deliveries++; // email service sent, died before acking: broker redelivers
    if (deliveries > 1 && !dedupe) dup++;
  }
  return { lost, ghost, dup };
}
export const outboxOk = (r: OutboxResult): boolean => r.lost === 0 && r.ghost === 0 && r.dup === 0;
