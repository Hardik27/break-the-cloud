import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';
import { hints, learn, pager } from './learn';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="11"';
const step = (x: number, y: number, label: string, col: string) =>
  `<rect x="${x - 50}" y="${y - 16}" width="100" height="32" rx="6" style="fill:var(--panel);stroke:${col};stroke-width:1.5"/><text x="${x}" y="${y + 4}" text-anchor="middle" ${mono} style="fill:var(--ink)">${label}</text>`;
const diagram = `<svg viewBox="0 0 520 190" role="img" aria-label="Forward: reserve flight, reserve hotel, rent car fails. Backward: cancel hotel, then cancel flight, newest first.">
  <defs><marker id="sgm-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" style="fill:var(--muted)"/></marker></defs>
  <text x="20" y="30" ${mono} style="fill:var(--muted)">forward</text>
  ${step(90, 60, 'flight ✓', 'var(--ok)')}${step(250, 60, 'hotel ✓', 'var(--ok)')}${step(410, 60, 'car ✕', 'var(--bad)')}
  <line x1="140" y1="60" x2="198" y2="60" style="stroke:var(--muted);stroke-width:1.5" marker-end="url(#sgm-a)"/><line x1="300" y1="60" x2="358" y2="60" style="stroke:var(--muted);stroke-width:1.5" marker-end="url(#sgm-a)"/>
  <text x="20" y="120" ${mono} style="fill:var(--muted)">compensate, newest first</text>
  ${step(250, 150, 'cancel hotel', 'var(--vote)')}${step(90, 150, 'cancel flight', 'var(--vote)')}
  <line x1="410" y1="78" x2="300" y2="140" style="stroke:var(--bad);stroke-width:1.5;stroke-dasharray:4 4" marker-end="url(#sgm-a)"/><line x1="200" y1="150" x2="142" y2="150" style="stroke:var(--muted);stroke-width:1.5" marker-end="url(#sgm-a)"/>
</svg>`;

export const meta: GameMeta = {
  id: 'saga',
  level: 7,
  title: 'Saga',
  concept: 'Compensating actions and the outbox pattern',
  intro:
    'A trip needs four services: flights, hotels, car rental and payments. Each has its own database, and holding locks across all four (like two-phase commit) would be slow. A <b>saga</b> runs one local transaction per service, in order. If a step fails for good, you can’t roll the others back: they already committed. Instead you run <b>compensating actions</b>, such as cancel and refund, to undo them.',
  legend: [
    { color: 'var(--ok)', shape: 'square', label: 'Step done (committed in that service)' },
    { color: 'var(--bad)', shape: 'square', label: 'Step failed' },
    { color: 'var(--vote)', shape: 'square', label: 'Step undone by a compensating action' },
  ],
  howTo: [
    'A short tutorial shows you how to run a step. The clock starts after it.',
    'Book trips step by step. When a step fails, decide: retry it, or undo what already happened, newest first.',
    'Right calls build a combo. Undoing a good booking, undoing in the wrong order, or losing an email costs points.',
  ],
  tasks: [
    'Tutorial: reserve a flight and a hotel',
    'Book 2 trips (one service times out)',
    'Undo 2 failed trips with compensations',
    'Send every confirmation email exactly once',
  ],
  lessons: [
    'Each step is a normal local transaction in one service, committed right away. Nobody holds locks while waiting for the other services.',
    'A <b>timeout</b> doesn’t mean the step failed: the hotel may have booked the room and the reply got lost. Retry it, with the same <b>idempotency key</b> so a second request doesn’t book a second room. Stripe’s API takes an Idempotency-Key header for exactly this.',
    'When a step fails for good, run the <b>compensating action</b> for every step that succeeded, newest first, like popping a stack. Compensations must themselves be retryable until they succeed. AWS Step Functions and Temporal are built to orchestrate sagas like this.',
    'Saving the booking and publishing the event touch two systems, so a crash between them loses or invents events. The <b>transactional outbox</b> writes the event into the same database transaction; a relay publishes it, sometimes twice, so the consumer <b>deduplicates</b> by event id. Debezium relays the outbox by reading the database log.',
  ],
  walkthrough: [
    { id: 'flight', target: '[data-do="0"]', text: 'Zoe is booking a trip. Click Reserve flight: the flight service books a seat and commits on its own.' },
    { id: 'hotel', target: '[data-do="1"]', text: 'The flight is booked. Click Reserve hotel: the next step runs in the next service.' },
  ],
  minTimeMs: RULES['saga'].minTimeMs,
  parMs: RULES['saga'].parMs,
  pager,
  learn,
  hints,
  learnMore: {
    paragraphs: [
      'Hector Garcia-Molina and Kenneth Salem introduced sagas in 1987 for long-lived database transactions: split one long transaction into steps T1…Tn, each with a compensation C1…Cn. If Tk fails, run Ck-1…C1. The saga gives up <b>isolation</b>: other users can see the half-booked trip in between.',
      'Sagas are run by <b>orchestration</b> (a central workflow, like Temporal or AWS Step Functions, calls each service) or <b>choreography</b> (each service reacts to the previous one’s event). Either way, every step and compensation must be idempotent, because messages get retried.',
      'The <b>transactional outbox</b> solves the dual-write problem: the event is a row in the same database as the booking, so both commit or neither does. A relay (a poller, or change data capture with Debezium) publishes it at least once; consumers deduplicate by event id, giving effectively exactly-once processing.',
    ],
    diagram,
    caption: 'When the car fails, completed steps are compensated in reverse order.',
    links: [
      { label: 'Garcia-Molina and Salem: Sagas (SIGMOD 1987)', url: 'https://www.cs.cornell.edu/andru/cs711/2002fa/reading/sagas.pdf' },
      { label: 'Chris Richardson: Pattern: Transactional outbox (microservices.io)', url: 'https://microservices.io/patterns/data/transactional-outbox.html' },
      { label: 'Stripe docs: Idempotent requests', url: 'https://docs.stripe.com/api/idempotent_requests' },
    ],
  },
};
