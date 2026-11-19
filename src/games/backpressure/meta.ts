import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';
import { hints, learn, pager } from './learn';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="11"';
const box = (x: number, y: number, w: number, label: string, fill: string, ink: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="34" rx="6" style="fill:${fill};stroke:var(--line)"/><text x="${x + w / 2}" y="${y + 21}" text-anchor="middle" ${mono} style="fill:${ink}">${label}</text>`;
const diagram = `<svg viewBox="0 0 520 190" role="img" aria-label="Producers put orders on a queue; consumers take them off at their own pace. A message that fails too many times is moved to a dead-letter queue for a human to inspect.">
  ${box(10, 60, 90, 'checkout', 'var(--panel)', 'var(--ink)')}
  <rect x="140" y="56" width="160" height="42" rx="6" style="fill:none;stroke:var(--ink);stroke-width:2"/>
  ${[0, 1, 2, 3, 4].map((i) => `<rect x="${148 + i * 30}" y="64" width="24" height="26" rx="3" style="fill:${i === 0 ? 'var(--bad)' : 'var(--append)'}"/>`).join('')}
  <text x="220" y="48" text-anchor="middle" ${mono} style="fill:var(--ink)">queue (buffers bursts)</text>
  ${box(340, 30, 90, 'consumer', 'var(--ok)', '#fff')}${box(340, 80, 90, 'consumer', 'var(--ok)', '#fff')}
  <line x1="100" y1="77" x2="138" y2="77" style="stroke:var(--ink);stroke-width:2"/><line x1="300" y1="70" x2="338" y2="50" style="stroke:var(--ink);stroke-width:2"/><line x1="300" y1="84" x2="338" y2="96" style="stroke:var(--ink);stroke-width:2"/>
  ${box(150, 140, 140, 'dead-letter queue', 'var(--bad)', '#fff')}
  <line x1="160" y1="98" x2="200" y2="138" style="stroke:var(--bad);stroke-width:2;stroke-dasharray:5 4"/><text x="300" y="130" ${mono} style="fill:var(--bad)">after N failed tries</text>
</svg>`;

export const meta: GameMeta = {
  id: 'backpressure',
  level: 4,
  title: 'Backpressure',
  concept: 'Queues and dead-letter queues',
  intro:
    'When checkout is fast but payment processing is slow, you put a <b>queue</b> between them. Checkout drops each order on the queue and moves on; <b>consumers</b> take orders off the queue and process them at their own pace. The queue absorbs bursts, but a growing queue means orders wait longer: that pressure is called <b>backpressure</b>. And when one message keeps failing, it goes to a <b>dead-letter queue (DLQ)</b>.',
  legend: [
    { color: 'var(--append)', shape: 'square', label: 'An order waiting in the queue' },
    { color: 'var(--ok)', shape: 'square', label: 'A consumer (worker) processing orders' },
    { color: 'var(--bad)', shape: 'square', label: 'A message that keeps failing' },
    { color: 'var(--vote)', shape: 'line', label: 'Database load (8 consumers at once is the limit)' },
  ],
  howTo: [
    'A short tutorial shows you how to add a consumer and quarantine a bad message. The clock starts after it.',
    'Use + and − to change the number of consumers. Click a message to move it to the dead-letter queue.',
    'Quarantining the right message builds a combo. Overloading the database, idle consumers and quarantining good orders cost points.',
  ],
  tasks: [
    'Tutorial: add a consumer, quarantine a bad message',
    'Drain a backlog of 120 orders, then scale back down',
    'Find 3 poison messages and move them to the DLQ',
    'Choose how many tries a message gets',
  ],
  lessons: [
    'A queue decouples the two sides: checkout stays fast even when payments are slow, and nothing is lost while consumers catch up. Amazon SQS, RabbitMQ and Kafka all play this role.',
    'Draining a backlog is a race between arrivals and processing: you need (consumers × rate) well above the arrival rate. But consumers share a database, so more is not always faster. Production systems scale consumers on <b>queue depth</b> or <b>age of the oldest message</b>, with a ceiling that protects the database.',
    'A <b>poison message</b> fails every time, crashing each consumer that touches it. In a strict queue it also blocks everything behind it. Moving it to a <b>dead-letter queue</b> unblocks the line and keeps the evidence for a human to inspect.',
    'Retry a few times (to survive network blips), then dead-letter. SQS calls this <b>maxReceiveCount</b> in the redrive policy. One try loses good orders to a blip; too many tries let a poison message crash consumers again and again.',
  ],
  walkthrough: [
    { id: 'add', target: '#bp-add', text: 'Orders are piling up faster than 2 consumers can handle. Click + to add a consumer.' },
    { id: 'dlq', target: '[data-qrow="0"]', text: 'This order has crashed a consumer twice and is stuck at the front. Click it to move it to the dead-letter queue.' },
  ],
  minTimeMs: RULES['backpressure'].minTimeMs,
  parMs: RULES['backpressure'].parMs,
  pager,
  learn,
  hints,
  learnMore: {
    paragraphs: [
      'A queue turns a synchronous call (“process this payment now”) into an asynchronous one (“process it soon”). That buys resilience: a slow or failed consumer just means a longer queue, not failed checkouts. The price is latency and the need to monitor queue depth and message age.',
      '<b>Backpressure</b> is the signal travelling back up the chain when a stage can’t keep up. If the queue is unbounded, the backlog grows silently until memory or patience runs out. Bounded queues push back instead: producers slow down, shed load, or get an error they can handle.',
      'Most queues deliver <b>at least once</b>: a message is redelivered if a consumer crashes before acknowledging it. That is why poison messages loop, why dead-letter queues exist, and why consumers must be <b>idempotent</b> (processing the same order twice must not charge the customer twice).',
    ],
    diagram,
    caption: 'Producers enqueue, consumers process at their own pace, and messages that keep failing are moved aside.',
    links: [
      { label: 'AWS docs: Amazon SQS dead-letter queues (redrive policy, maxReceiveCount)', url: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html' },
      { label: 'RabbitMQ docs: Dead letter exchanges', url: 'https://www.rabbitmq.com/docs/dlx' },
      { label: 'Reactive Streams: backpressure specification', url: 'https://www.reactive-streams.org/' },
    ],
  },
};
