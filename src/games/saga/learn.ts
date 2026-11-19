/** Saga: concept cards, hints and the opening incident. */
import { arrow, box, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '22:47 · customer charged for a trip with no car booked · another got two confirmation emails · a third got none.';

export const learn: (LearnCard | null)[] = [
  {
    title: 'One trip, four services',
    frames: [
      {
        svg: svg(['Flights', 'Hotels', 'Car rental', 'Payments'].map((n, i) => box(20 + i * 135, 70, 120, 60, n, { col: 'var(--append)', size: 14 })).join('') + [0, 1, 2].map((i) => arrow(142 + i * 135, 100, 152 + i * 135, 100, '', 'muted')).join(''), 'Booking a trip calls four services in order.'),
        html: '<p>Booking a trip touches four services, each with its own database: flights, hotels, car rental, payments. Locking all four while waiting for each other (like two-phase commit) is slow and fragile. A <b>saga</b> runs one normal local step per service, in order, each committing on its own.</p>',
      },
    ],
    check: {
      q: 'In a saga, when does the flight booking commit?',
      options: ['Only once all four steps succeed', 'Right away, in the flight service'],
      answer: 1,
      why: 'Each step commits on its own. That is fast, but it means you can’t simply roll everything back later.',
    },
  },
  {
    title: 'Is it really broken?',
    frames: [
      {
        svg: svg(box(40, 60, 220, 80, 'timeout', { col: 'var(--vote)', sub: 'maybe it worked; retry' }) + box(300, 60, 220, 80, 'sold out', { col: 'var(--bad)', sub: 'definitely failed' }), 'A timeout is not a failure.'),
        html: '<p>A <b>timeout</b> doesn’t mean the step failed: the hotel may have booked the room and the reply got lost. Retry it. Real systems send the same <b>idempotency key</b> with the retry, so a second request can’t book a second room.</p>',
      },
    ],
  },
  {
    title: 'Compensating actions',
    frames: [
      {
        svg: svg(box(30, 30, 140, 44, 'flight ✓', { col: 'var(--ok)' }) + box(210, 30, 140, 44, 'hotel ✓', { col: 'var(--ok)' }) + box(390, 30, 140, 44, 'car ✕', { col: 'var(--bad)' }) + box(210, 140, 140, 44, 'cancel hotel', { col: 'var(--vote)' }) + box(30, 140, 140, 44, 'cancel flight', { col: 'var(--vote)' }) + arrow(206, 162, 174, 162, '', 'muted') + text(280, 215, 'undo newest first, like popping a stack', { size: 13 }), 'Undo completed steps in reverse order.'),
        html: '<p>When a step fails for good (sold out, card declined), the earlier steps already committed: there is nothing to roll back. Instead, run each completed step’s <b>compensating action</b> (cancel, refund), <b>newest first</b>, because later steps can depend on earlier ones.</p>',
      },
    ],
  },
  {
    title: 'Exactly one email',
    frames: [
      {
        svg: svg(box(30, 50, 230, 80, 'save booking', { col: 'var(--ink)' }) + text(280, 95, '+', { size: 22, bold: true }) + box(300, 50, 230, 80, 'publish event', { col: 'var(--append)', sub: '→ email service' }) + text(280, 180, 'two systems: a crash in between loses or invents an email', { size: 13, col: 'var(--bad)' }), 'Saving and publishing are two separate writes.'),
        html: '<p>After booking, the service saves the trip and publishes a “TripBooked” event so an email goes out. Those are two different systems: a crash between them loses the email or announces a trip that was never saved. The <b>outbox</b> pattern saves the event in the same database transaction; a relay publishes it, maybe twice, so the email service <b>skips ids it has already handled</b>.</p>',
      },
    ],
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Read the failure message: is it a timeout, or a definite no?',
    concept: 'A timeout is worth retrying. Undo only when a step has failed for good.',
    show: 'Run the steps in order; if a service times out, click its step again.',
  },
  {
    nudge: 'Which steps already succeeded? In what order did they run?',
    concept: 'Undo each succeeded step, newest first. The failed step has nothing to undo.',
    show: 'Click Undo on the last succeeded step, then the one before it, back to the first.',
  },
  {
    nudge: 'In each run: was an email lost, invented, or sent twice?',
    concept: 'The outbox never loses or invents events. Deduplication stops doubles.',
    show: 'Pick <b>Outbox</b> and turn on “skips event ids it has already handled”.',
    target: '[data-design="outbox"]',
  },
];
