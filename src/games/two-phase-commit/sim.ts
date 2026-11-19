/**
 * Two-Phase Commit: atomic commit across two banks. Pure data and rules, no DOM.
 *
 * Tasks:
 *   0 tutorial   send prepare, then commit one transfer
 *   1 coordinate you are the coordinator: prepare 5 transfers and commit or abort each from the votes
 *   2 recover    a crashed bank restarts; read its log and choose commit, abort or ask the coordinator
 *   3 blocked    the coordinator died after prepare; ask the other bank, then commit, abort or wait
 */
export type Vote = 'yes' | 'no' | 'timeout';
export interface Transfer { text: string; votes: [Vote, Vote]; why: [string, string] }

export const TUTORIAL_TRANSFER: Transfer = { text: 'Move $50 from Ana (Bank A) to Bo (Bank B)', votes: ['yes', 'yes'], why: ['Ana has $300', 'Bo’s account is open'] };

export const TRANSFERS: Transfer[] = [
  { text: 'Move $100 from Ana (Bank A) to Bo (Bank B)', votes: ['yes', 'yes'], why: ['Ana has $250', 'Bo’s account is open'] },
  { text: 'Move $500 from Ana (Bank A) to Cy (Bank B)', votes: ['no', 'yes'], why: ['Ana has only $150', 'Cy’s account is open'] },
  { text: 'Move $40 from Dee (Bank A) to Eli (Bank B)', votes: ['yes', 'no'], why: ['Dee has $90', 'Eli’s account is frozen'] },
  { text: 'Move $70 from Fay (Bank A) to Gus (Bank B)', votes: ['yes', 'timeout'], why: ['Fay has $400', 'no answer after 3 s'] },
  { text: 'Move $20 from Hal (Bank A) to Ivy (Bank B)', votes: ['yes', 'yes'], why: ['Hal has $60', 'Ivy’s account is open'] },
];

export const allYes = (t: Transfer): boolean => t.votes.every((v) => v === 'yes');

export function decide(t: Transfer, commit: boolean): { ok: boolean; why: string } {
  if (commit === allYes(t)) return { ok: true, why: '' };
  if (commit) {
    const bad = t.votes.findIndex((v) => v !== 'yes');
    return { ok: false, why: t.votes[bad] === 'timeout'
      ? `Bank ${'AB'[bad]} never answered. You can’t know it is able to commit, so a missing vote counts as no: abort.`
      : `Bank ${'AB'[bad]} voted no (${t.why[bad]}). Committing anyway would change one bank but not the other: money appears or vanishes. Abort.` };
  }
  return { ok: false, why: 'Both banks voted yes and are holding locks, ready to commit. Aborting fails a good transfer for no reason.' };
}

// ---------- task 2: a crashed participant recovers ----------
export type Act = 'commit' | 'abort' | 'ask';
export interface Recovery { log: string[]; answer: Act; why: string; coordSays?: 'commit' | 'abort' }
export const RECOVERIES: Recovery[] = [
  { log: ['BEGIN T8'], answer: 'abort', why: 'B crashed before it voted. It never promised anything, and the coordinator can’t commit without its yes. Aborting alone is safe.' },
  { log: ['BEGIN T9', 'PREPARED T9 · voted YES'], answer: 'ask', coordSays: 'commit', why: 'B voted yes but has no decision: it is “in doubt”. The coordinator may have committed (Bank A already did) or aborted. B can’t guess: it must ask.' },
  { log: ['BEGIN T10', 'PREPARED T10 · voted YES', 'DECISION T10 · COMMIT'], answer: 'commit', why: 'The decision is in B’s own log. Redo it: commit. No need to ask anyone.' },
  { log: ['BEGIN T11', 'voted NO T11'], answer: 'abort', why: 'B voted no, so the coordinator must have aborted. B aborts on its own.' },
  { log: ['BEGIN T12', 'PREPARED T12 · voted YES', 'DECISION T12 · ABORT'], answer: 'abort', why: 'B’s log already holds the decision: abort. Redo it.' },
  { log: ['BEGIN T13', 'PREPARED T13 · voted YES'], answer: 'ask', coordSays: 'abort', why: 'Voted yes, no decision in the log: in doubt again. Only the coordinator knows. Ask.' },
];

export function recover(r: Recovery, act: Act): { ok: boolean; why: string } {
  if (act === r.answer) return { ok: true, why: r.why };
  if (r.answer === 'ask') return { ok: false, why: `B promised to commit (it voted yes) but has no decision in its log. If it ${act}s alone it may disagree with Bank A. Ask the coordinator.` };
  if (act === 'ask') return { ok: false, why: `B doesn’t need to ask: ${r.why}` };
  return { ok: false, why: r.why };
}

// ---------- task 3: coordinator crashed after prepare ----------
export type Peer = 'commit' | 'abort' | 'no' | 'yes';
export type Act3 = 'commit' | 'abort' | 'wait';
export interface Blocked { tx: string; peer: Peer; answer: Act3 }
export const BLOCKED: Blocked[] = [
  { tx: 'T20', peer: 'commit', answer: 'commit' },
  { tx: 'T21', peer: 'no', answer: 'abort' },
  { tx: 'T22', peer: 'yes', answer: 'wait' },
  { tx: 'T23', peer: 'abort', answer: 'abort' },
];
export const PEER_TEXT: Record<Peer, string> = {
  commit: 'Bank A: “I got COMMIT T from the coordinator before it died.”',
  abort: 'Bank A: “I got ABORT T from the coordinator before it died.”',
  no: 'Bank A: “I voted NO on T.”',
  yes: 'Bank A: “I voted YES on T too. I have no decision either.”',
};
export const WAIT_MS = 5000;

export function terminate(b: Blocked, act: Act3): { ok: boolean; why: string } {
  if (act === b.answer) {
    if (b.answer === 'commit') return { ok: true, why: 'A saw COMMIT, so the coordinator decided commit. B can commit too.' };
    if (b.answer === 'abort') return { ok: true, why: b.peer === 'no' ? 'A voted no, so the coordinator could never have committed. Abort is safe.' : 'A saw ABORT. B aborts too.' };
    return { ok: true, why: 'Both banks are in doubt. Only the dead coordinator knows; maybe it logged COMMIT a moment before crashing. B must wait, locks held.' };
  }
  if (b.answer === 'wait') return { ok: false, why: `Both banks voted yes and neither knows the decision. The coordinator may have logged ${act === 'commit' ? 'ABORT' : 'COMMIT'} before it crashed. Deciding alone could split the banks: wait.` };
  if (act === 'wait') return { ok: false, why: `No need to wait: ${b.peer === 'no' ? 'A voted no, so the outcome must be abort' : `A already knows the decision (${b.peer.toUpperCase()})`}. Every second of waiting keeps the accounts locked.` };
  return { ok: false, why: `A’s answer settles it: the coordinator’s decision was ${b.answer.toUpperCase()}. Doing the opposite splits the banks.` };
}
