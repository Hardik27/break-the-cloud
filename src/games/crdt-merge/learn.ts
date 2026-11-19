/** CRDT Merge: concept cards, hints and the opening incident. */
import { box, person, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '09:15 · users of the offline-first notes app: “I edited on the train, synced, and my changes disappeared.”';

export const learn: (LearnCard | null)[] = [
  {
    title: 'Two copies changed offline',
    frames: [
      {
        svg: svg(person(110, 90, 'phone (offline)') + person(450, 90, 'laptop (offline)') + text(110, 160, 'likes: 10 → 13', { size: 14, bold: true }) + text(450, 160, 'likes: 10 → 12', { size: 14, bold: true }) + text(280, 210, 'sync: the real answer is 15', { size: 14, col: 'var(--ok)' }), 'Phone and laptop both change the like count offline.'),
        html: '<p>Apps like notes, todo lists and shopping lists keep working offline, then <b>sync</b>. If two devices changed the same data, the app must <b>merge</b> the two copies without losing anything and without asking the user.</p>',
      },
    ],
    check: {
      q: 'Both start at 10. The phone adds 3 likes, the laptop adds 2. After syncing, how many likes?',
      options: ['12', '13', '15', '25'],
      answer: 2,
      why: '10 + 3 + 2 = 15. But you only know that because you know who added what, which a single number doesn’t record.',
    },
  },
  null,
  {
    title: 'One counter per device',
    frames: [
      {
        svg: svg(box(30, 40, 230, 60, 'phone [3, 1, 0]', { col: 'var(--append)' }) + box(300, 40, 230, 60, 'laptop [2, 4, 0]', { col: 'var(--append)' }) + box(150, 140, 260, 60, 'merged [3, 4, 0] = 7', { col: 'var(--ok)' }) + text(280, 125, 'max of each entry', { size: 13 }), 'A G-counter merges entry by entry with max.'),
        html: '<p>A <b>G-counter</b> (grow-only counter) keeps one entry per device: [phone, laptop, tablet]. Each device only increases its own entry. To merge, take the <b>max of each entry</b>; the value is the sum. Merging twice, or in any order, gives the same answer. That is what makes it a <b>CRDT</b> (conflict-free replicated data type).</p>',
      },
    ],
    check: {
      q: 'Phone [5, 2], laptop [3, 4]. Merged?',
      options: ['[8, 6]', '[5, 4]', '[3, 2]'],
      answer: 1,
      why: 'Max of each entry. Adding would count the likes both devices already heard about twice.',
    },
  },
  {
    title: 'Sets with tags',
    frames: [
      {
        svg: svg(box(30, 40, 230, 70, 'phone: remove milk·a1', { col: 'var(--bad)', size: 14 }) + box(300, 40, 230, 70, 'laptop: add milk·l1', { col: 'var(--ok)', size: 14 }) + text(280, 160, 'milk·l1 was never removed → milk stays', { size: 14, bold: true }), 'Removes only delete the tags they saw.'),
        html: '<p>A shopping list as an <b>OR-set</b> (observed-remove set): every add gets a unique <b>tag</b> (milk·a1). A remove deletes only the tags that device had seen. So if one device removes milk while another adds it again (a new tag), the new milk survives: <b>add wins</b>, and nothing is silently lost.</p>',
      },
    ],
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Count every like that was actually pressed, on both devices.',
    concept: 'Start value + phone likes + laptop likes. None of the simple merges gets there.',
    show: `Pick 15.`,
  },
  {
    nudge: 'Each entry belongs to one device and only ever grows.',
    concept: 'The bigger number already includes everything the smaller one saw.',
    show: 'For every entry, pick the bigger of the two values.',
  },
  {
    nudge: 'List every tag that was added, then cross out every tag that was removed.',
    concept: 'An item stays if at least one of its tags was never removed.',
    show: 'Keep items with a surviving tag; drop items whose every tag was removed.',
  },
];
