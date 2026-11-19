import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="12"';
const vec = (x: number, y: number, label: string, v: number[], col: string) =>
  `<text x="${x}" y="${y - 22}" ${mono} style="fill:var(--muted)">${label}</text>` +
  v.map((n, k) => `<rect x="${x + k * 44}" y="${y - 16}" width="40" height="30" rx="4" style="fill:var(--panel);stroke:${col};stroke-width:1.5"/><text x="${x + 20 + k * 44}" y="${y + 4}" text-anchor="middle" ${mono} style="fill:var(--ink)">${n}</text>`).join('');
const diagram = `<svg viewBox="0 0 520 200" role="img" aria-label="Phone counter [3,1,0] and laptop counter [2,4,0] merge entry by entry with max into [3,4,0], value 7.">
  ${vec(30, 60, 'Phone [P,L,T]', [3, 1, 0], 'var(--append)')}${vec(330, 60, 'Laptop [P,L,T]', [2, 4, 0], 'var(--append)')}
  ${vec(180, 160, 'merged: max of each entry', [3, 4, 0], 'var(--ok)')}
  <line x1="95" y1="80" x2="215" y2="138" style="stroke:var(--muted)"/><line x1="395" y1="80" x2="295" y2="138" style="stroke:var(--muted)"/>
  <text x="330" y="168" ${mono} style="fill:var(--ok)">= 3 + 4 + 0 = 7 likes</text>
</svg>`;

export const meta: GameMeta = {
  id: 'crdt-merge',
  level: 8,
  title: 'CRDT Merge',
  concept: 'Convergent replicated data types',
  intro:
    'Apps like notes and shopping lists keep working offline, then sync. If two devices changed the same data, how do you merge without losing anything and without asking the user? A <b>CRDT</b> (conflict-free replicated data type) is a data structure designed so that any two copies can always be merged, in any order, and every device ends up with the same answer.',
  legend: [
    { color: 'var(--append)', shape: 'square', label: 'A device’s own copy (offline)' },
    { color: 'var(--ok)', shape: 'square', label: 'Merged result' },
    { color: 'var(--accent)', shape: 'square', label: 'Your move' },
  ],
  howTo: [
    'A short tutorial shows you how to change a copy and sync. The clock starts after it.',
    'Break a plain counter, then merge counters and a shopping list the CRDT way, entry by entry and tag by tag.',
    'Correct merges build a combo. Lost or double-counted updates cost points.',
  ],
  tasks: [
    'Tutorial: like on the phone, then sync',
    'Two offline devices: count the likes',
    'Merge 3 G-counters',
    'Merge 3 shopping lists (OR-set)',
  ],
  lessons: [
    'Each device keeps its own copy and changes it offline. Syncing has to merge the two copies.',
    'A single number can’t be merged: “last write wins” and “take the bigger” lose likes, and adding both copies counts the shared starting 10 twice. The copy doesn’t record <i>who</i> added what.',
    'A <b>G-counter</b> (grow-only counter) keeps one entry per device; each device only increases its own entry. Merge takes the max of each entry, and the value is the sum. Merging twice or in any order gives the same answer. Redis Enterprise and Riak offer CRDT counters.',
    'An <b>OR-set</b> (observed-remove set) tags every add uniquely, and a remove deletes only the tags its device had seen. So a concurrent re-add survives (<b>add wins</b>), and nothing is ever silently lost. Figma, Apple Notes and the Automerge and Yjs libraries use CRDTs for offline and collaborative editing.',
  ],
  walkthrough: [
    { id: 'inc', target: '[data-inc="0"]', text: 'The phone and the laptop each keep a copy of the like count. Click +1 on the phone.' },
    { id: 'sync', target: '#cr-sync', text: 'The phone changed its copy. Click Sync to merge the two copies.' },
  ],
  minTimeMs: RULES['crdt-merge'].minTimeMs,
  parMs: RULES['crdt-merge'].parMs,
  learnMore: {
    paragraphs: [
      'Shapiro, Preguiça, Baquero and Zawirski (2011) defined CRDTs. A <b>state-based</b> CRDT has a merge that is commutative, associative and idempotent (order, grouping and repeats don’t matter), so replicas converge however messages are delayed, reordered or duplicated. An <b>operation-based</b> CRDT instead sends operations that commute.',
      'Building blocks combine: two G-counters make a PN-counter (one for increments, one for decrements); OR-sets, LWW-registers and sequence CRDTs (RGA, Logoot, Yjs’s YATA) model sets, fields and text. Collaborative editors use sequence CRDTs so two people can type into the same paragraph offline.',
      'CRDTs give <b>strong eventual consistency</b>: no coordination, no conflicts to resolve by hand, but no global invariants either (a CRDT can’t stop two devices from both spending the last $10). That is the AP corner of the CAP trade-off you saw in Partition.',
    ],
    diagram,
    caption: 'A G-counter merges entry by entry with max; the value is the sum of the entries.',
    links: [
      { label: 'Shapiro et al.: Conflict-free Replicated Data Types (SSS 2011)', url: 'https://inria.hal.science/hal-00932836/document' },
      { label: 'Kleppmann et al.: Local-first software (Ink & Switch, 2019)', url: 'https://www.inkandswitch.com/local-first/' },
      { label: 'crdt.tech: papers, implementations and talks', url: 'https://crdt.tech/' },
    ],
  },
};
