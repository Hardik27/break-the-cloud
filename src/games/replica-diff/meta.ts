import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="12"';
const disp = 'font-family="Archivo, Arial Narrow, sans-serif" font-weight="800" font-size="14"';
const step = (x: number, title: string, catches: string, misses: string) => `
  <rect x="${x}" y="40" width="112" height="70" rx="6" style="fill:var(--panel);stroke:var(--line);stroke-width:1.5"/>
  <text x="${x + 56}" y="70" text-anchor="middle" ${disp} style="fill:var(--ink)">${title}</text>
  <text x="${x + 56}" y="92" text-anchor="middle" ${mono} style="fill:var(--muted)">compare</text>
  <text x="${x + 56}" y="140" text-anchor="middle" ${mono} style="fill:var(--ok)">✓ ${catches}</text>
  <text x="${x + 56}" y="160" text-anchor="middle" ${mono} style="fill:var(--bad)">✕ ${misses}</text>`;

const diagram = `<svg viewBox="0 0 520 190" role="img" aria-label="Verification layers from cheap to thorough: key lists catch missing objects, sizes catch truncation, checksums catch corruption, and tags plus retention catch permission and lock changes.">
  <text x="10" y="22" ${mono} style="fill:var(--muted)">cheap</text><text x="510" y="22" text-anchor="end" ${mono} style="fill:var(--muted)">thorough</text>
  <line x1="60" y1="18" x2="440" y2="18" style="stroke:var(--line);stroke-width:1.5"/><path d="M440,13 L450,18 L440,23 z" style="fill:var(--line)"/>
  ${step(8, 'keys', 'missing', 'corrupt')}
  ${step(136, 'size', 'truncated', 'same-size')}
  ${step(264, 'checksum', 'corrupt', 'tags, lock')}
  ${step(392, 'metadata', 'tags, lock', 'nothing')}
</svg>`;

export const meta: GameMeta = {
  id: 'replica-diff',
  level: 3,
  title: 'Replica Diff',
  concept: 'Replication verification',
  intro:
    'Cloud storage keeps <b>copies</b> (replicas) of your data in another region, so a lost disk or a regional outage does not lose your files. A copy only helps if it really is the same. Below are a source bucket and its replica, row by row: row 3 on one side is the same object as row 3 on the other. Your job is to find every way they differ.',
  legend: [
    { color: 'var(--muted)', shape: 'dash', label: '<i>(no object)</i>: missing from the replica' },
    { color: 'var(--ink)', shape: 'line', label: '<b>etag</b>: a fingerprint (hash) of the bytes' },
    { color: 'var(--ink)', shape: 'line', label: '<b>tags</b>: labels that access rules can depend on' },
    { color: 'var(--ink)', shape: 'line', label: '<b>retention</b>: a lock that blocks deletion' },
    { color: 'var(--ok)', shape: 'square', label: 'A row you flagged correctly' },
    { color: 'var(--bad)', shape: 'square', label: 'Wrong flag: the copies match (+3 s)' },
  ],
  howTo: [
    'A short tutorial shows you how to flag a row. The clock starts after it.',
    'Compare each source row with the replica row of the same number, and click a row that differs.',
    'Correct flags build a combo. A wrong flag costs points and adds 3 seconds. Stuck? The right column lights up after a while.',
  ],
  tasks: [
    'Tutorial: flag the object missing from the replica',
    'Find the corrupted copy (checksum)',
    'Find the copy with different tags',
    'Find the copy that lost its retention lock',
    'Speed round: find all three differences',
  ],
  lessons: [
    'The cheapest check is a key listing: list both buckets and compare names. It catches objects that never replicated, for example ones written before replication was switched on. Amazon S3 Batch Replication exists to copy exactly those leftovers.',
    'Sizes matched, so a size check would have passed this file. A <b>checksum</b> (here the etag, a hash of the bytes) catches silent corruption from a bad disk, a cut-off upload or a buggy copy job. Amazon S3 can store and verify checksums such as CRC32 or SHA-256 for every object.',
    'Every checksum matched, yet one copy had different tags. In S3, access policies can depend on tags, so this replica may be readable by the wrong people. Byte checks miss it completely; a real verifier compares metadata and tags too.',
    'A <b>retention lock</b> makes an object write-once-read-many (WORM): nobody can delete or overwrite it until the lock expires. That is what lets a company recover after ransomware. S3 Object Lock provides it, and a replica without the lock looks healthy but protects nothing.',
    'You just did by eye what a replication verifier does across millions of objects: compare keys, checksums, tags and retention, and report every difference. At that scale it runs as a batch job, for example over S3 Inventory reports from both buckets.',
  ],
  walkthrough: [
    { id: 'flag-missing', target: '[data-row="src-2"]', text: 'Row 3 has no copy in the replica. Click row 3 in the source table to flag it.' },
    { id: 'next', target: '#rd-next', text: 'Flagged. From now on a wrong flag costs 3 s. Click Next round to start the clock.' },
  ],
  minTimeMs: RULES['replica-diff'].minTimeMs,
  parMs: RULES['replica-diff'].parMs,
  learnMore: {
    paragraphs: [
      'Replication copies each new object from a source bucket to a replica, usually <b>asynchronously</b>: the write succeeds first and the copy follows seconds or minutes later. Replication can skip objects without telling you (objects written before the rule existed, or copies that failed), so teams verify it instead of trusting it.',
      'Verification has layers, from cheap to thorough: compare key lists, then sizes, then checksums, then metadata such as tags and retention settings. Each layer catches failures the one before it misses, as you saw. At scale it is a batch job over inventory reports of both buckets, not a click per row.',
      'Retention locks turn a replica into a real backup. Ransomware that steals admin credentials can delete ordinary copies, but it cannot delete a locked object until the lock expires. The catch: the lock has to survive replication, so it must be part of what you verify.',
    ],
    diagram,
    caption: 'Each verification layer catches what the cheaper ones miss.',
    links: [
      { label: 'AWS docs: Replicating objects within and across Regions (S3 Replication)', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication.html' },
      { label: 'AWS docs: Checking object integrity in Amazon S3 (checksums)', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity.html' },
      { label: 'AWS docs: Locking objects with S3 Object Lock (WORM retention)', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html' },
    ],
  },
};
