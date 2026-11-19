/** Replica Diff: concept cards, hints and the opening incident. */
import { arrow, box, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '10:40 · an auditor asks: “Prove your backup bucket is an exact copy of production.” · replication says ‘OK’. Does it really match?';

export const learn: (LearnCard | null)[] = [
  {
    title: 'Copies that drift',
    frames: [
      {
        svg: svg(
          box(30, 40, 200, 140, 'source bucket', { col: 'var(--ink)', sub: 'Mumbai' }) + box(330, 40, 200, 140, 'replica bucket', { col: 'var(--append)', sub: 'Singapore' }) + arrow(234, 110, 324, 110, 'replication', 'blue'),
          'Objects are copied from a source bucket to a replica in another region.',
        ),
        html: '<p>Cloud storage (like Amazon S3) keeps files as <b>objects</b> in <b>buckets</b>. For safety, a <b>replica</b> bucket in another region receives a copy of every object. But copying across the world can fail quietly: an object can go missing, get corrupted, or lose its settings.</p>',
      },
      {
        svg: svg(text(20, 50, 'name · size · etag (checksum) · tags · lock', { anchor: 'start', size: 15, bold: true }) + text(20, 100, 'compare each column, row by row', { anchor: 'start', size: 14 }) + text(20, 140, 'the difference is never in the same column twice', { anchor: 'start', size: 13, col: 'var(--muted)' }), 'Each object has a name, size, checksum, tags and a lock.'),
        html: '<p>Each row is one object: its <b>name</b>, <b>size</b>, a checksum called the <b>etag</b>, its <b>tags</b> and its retention <b>lock</b>. Your job: compare the two tables and flag the copy that differs.</p>',
      },
    ],
  },
  {
    title: 'A fingerprint for bytes',
    frames: [
      {
        svg: svg(box(30, 50, 230, 60, 'invoice.pdf · 2.1 MB', { col: 'var(--ok)', sub: 'etag 9f3a…' }) + box(300, 50, 230, 60, 'invoice.pdf · 2.1 MB', { col: 'var(--bad)', sub: 'etag 4c71…' }) + text(280, 160, 'same name, same size, one flipped byte → a different etag', { size: 13 }), 'One changed byte gives a completely different checksum.'),
        html: '<p>A <b>checksum</b> is a short fingerprint calculated from every byte of a file. Change even one byte and the fingerprint changes completely. Same size is no proof of same contents: compare the etags.</p>',
      },
    ],
  },
  {
    title: 'Same bytes, different rules',
    frames: [
      {
        svg: svg(box(30, 60, 230, 60, 'tags: access=private', { col: 'var(--ok)' }) + box(300, 60, 230, 60, 'tags: (none)', { col: 'var(--bad)' }), 'A replica without the private tag.'),
        html: '<p><b>Tags</b> are labels on an object. Access policies often use them (“anything tagged access=private needs a login”). A copy whose bytes match but whose tags are missing can be readable by the wrong people.</p>',
      },
    ],
  },
  {
    title: 'The lock that keeps data safe',
    frames: [
      {
        svg: svg(box(30, 60, 230, 60, 'lock: until 2031', { col: 'var(--ok)', sub: 'cannot be deleted' }) + box(300, 60, 230, 60, 'lock: none', { col: 'var(--bad)', sub: 'can be deleted' }), 'The replica lost its retention lock.'),
        html: '<p>A <b>retention lock</b> stops anyone, even an admin, from deleting an object until a date. Banks and hospitals need it by law. A replica that lost its lock looks fine, but it can be deleted.</p>',
      },
    ],
  },
  null,
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Sizes all match. Which other column is about the bytes themselves?',
    concept: 'The etag is a checksum of the contents. Different contents, different etag.',
    show: 'Find the row whose etag differs between source and replica.',
  },
  {
    nudge: 'Every etag matches now. Look further right.',
    concept: 'Tags decide who may read an object. Compare the tags column.',
    show: 'Find the row whose tags differ.',
  },
  {
    nudge: 'Bytes and tags all match. One column is left.',
    concept: 'The retention lock stops deletion. Compare the lock column.',
    show: 'Find the row whose lock is missing in the replica.',
  },
  {
    nudge: 'Check one column at a time across all rows: missing rows, then etag, tags, lock.',
    concept: 'Three different kinds of difference are hidden.',
    show: 'Scan: a row missing from the replica, a different etag, and a different tag or lock.',
  },
];
