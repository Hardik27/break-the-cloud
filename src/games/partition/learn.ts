/** Partition: concept cards, hints and the opening incident. */
import { box, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '06:14 · the undersea cable between New York and London is cut · both offices are still taking orders · they can’t see each other’s.';

export const learn: (LearnCard | null)[] = [
  {
    title: 'When the network splits',
    frames: [
      {
        svg: svg(box(30, 50, 200, 110, 'New York', { col: 'var(--ok)', sub: '2 of 3 replicas' }) + box(330, 50, 200, 110, 'London', { col: 'var(--vote)', sub: '1 of 3 replicas' }) + `<line x1="232" y1="105" x2="328" y2="105" style="stroke:var(--bad);stroke-width:3;stroke-dasharray:6 6"/>` + text(280, 95, '✕', { col: 'var(--bad)', size: 22 }), 'The link between New York and London is cut.'),
        html: '<p>Your data has three copies (<b>replicas</b>): two in New York, one in London. When the link between the cities breaks, both sides are alive and serving users, but they can’t talk. That is a <b>network partition</b>.</p>',
      },
      {
        svg: svg(box(30, 50, 240, 90, 'Consistent (CP)', { col: 'var(--append)', sub: 'refuse writes you can’t confirm' }) + box(290, 50, 240, 90, 'Available (AP)', { col: 'var(--vote)', sub: 'accept them, fix it up later' }), 'During a partition you choose consistency or availability.'),
        html: '<p>The <b>CAP theorem</b>: during a partition, the side without a majority must choose. Stay <b>consistent</b> (refuse writes it can’t confirm with the others) or stay <b>available</b> (accept them, and merge the differences later). The right choice depends on the data: you can’t spend money twice, but a cart can be merged.</p>',
      },
    ],
    check: {
      q: 'London is cut off and has only 1 of 3 replicas. A customer there withdraws money. Accept?',
      options: ['Accept: keep the customer happy', 'Reject: New York could approve another withdrawal from the same account'],
      answer: 1,
      why: 'Two sides approving withdrawals independently could spend the same money twice. Money needs consistency.',
    },
  },
  null,
  {
    title: 'Merging after the link heals',
    frames: [
      {
        svg: svg(box(30, 40, 230, 70, 'NY: add pen, add socks', { col: 'var(--ok)', size: 14 }) + box(300, 40, 230, 70, 'London: remove lamp, add book', { col: 'var(--vote)', size: 14 }) + text(280, 160, 'keep every change: add-wins merge', { size: 15, bold: true }), 'Merge both sides’ changes.'),
        html: '<p>Accepting writes on both sides means two different carts afterwards. Taking one side’s cart (“last writer wins”) throws away the other side’s changes. Instead, replay both sides’ operations. When one side removed an item the other added back, the add wins.</p>',
      },
    ],
  },
  {
    title: 'Real systems choose too',
    frames: [{ html: '<p>Every distributed database makes this choice. <b>CP</b> systems refuse service on the minority side to keep one truth. <b>AP</b> systems keep answering and reconcile later. Sort the real systems.</p>' }],
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Two questions for each write: which side is it on, and what kind of data is it?',
    concept: 'New York has the majority: accept everything there. London: reject money, accept carts and likes.',
    show: 'Reject only London money writes; accept every other write.',
  },
  {
    nudge: 'Read both sides’ operations, not their final carts.',
    concept: 'Keep everything either side added; drop what was removed and never re-added.',
    show: 'Before-items stay unless removed; every added item is in, even if the other side removed it.',
  },
  {
    nudge: 'Which systems are built on majority voting (consensus)?',
    concept: 'etcd, ZooKeeper and Spanner need a majority, so they are CP. Cassandra at ONE, Dynamo and CouchDB keep answering: AP.',
    show: 'CP: etcd, ZooKeeper, Spanner. AP: Cassandra (ONE), Dynamo, CouchDB.',
  },
];
