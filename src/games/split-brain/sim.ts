/**
 * Split Brain: five Raft servers. Pure simulation, no DOM. Ported from reference/split-brain.html.
 * Real terms, votes, log matching and majority commit, with message delays you can watch.
 * A safety monitor checks every commit; a violation means a bug in this file, not in Raft.
 */
import { between, intBelow, type Rng } from '../../lib/rng';

export const N = 5;
export const MAJ = 3;
// Election timeouts are spread well beyond a vote round trip (~1 s) so split votes stay rare (Raft paper, section 5.2).
export const CFG = { latMin: 380, latMax: 700, hb: 500, etMin: 1700, etMax: 4500, reqEvery: 1000, reqTimeout: 3600 };
export const TICK = 20;

export const linkKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);
export const ALL_LINKS: [number, number][] = [];
for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) ALL_LINKS.push([a, b]);

export type Role = 'follower' | 'candidate' | 'leader';
export interface Entry { term: number; cmd: string; rid: number | null; uid: number }
export interface RaftNode {
  id: number; name: string; alive: boolean; role: Role; term: number; votedFor: number | null;
  log: Entry[]; commit: number; deadline: number; votes: Set<number>; next: number[]; match: number[]; hbAt: number;
}
interface RV { term: number; lastIdx: number; lastTerm: number }
interface RVR { term: number; grant: boolean }
interface AE { term: number; prev: number; prevTerm: number; entries: Entry[]; commit: number }
interface AER { term: number; ok: boolean; match?: number; hint?: number }
interface MsgBase { from: number; to: number; t0: number; t1: number; id: number }
export type Msg = MsgBase & ({ type: 'RV'; p: RV } | { type: 'RVR'; p: RVR } | { type: 'AE'; p: AE } | { type: 'AER'; p: AER });
export interface ClientReq { rid: number; st: 'pend' | 'ok' | 'fail'; t0: number; to: number | null }
export interface Drop { from: number; to: number; t: number }

export class Raft {
  now = 0;
  nodes: RaftNode[] = [];
  msgs: Msg[] = [];
  cut = new Set<string>();
  committed: Record<number, { term: number; uid: number; cmd: string }> = {};
  leaderOfTerm: Record<number, number> = {};
  violations: string[] = [];
  requests: ClientReq[] = [];
  drops: Drop[] = [];
  feed: string[] = [];
  /** Sim times at which a leader was elected (since the last resetCounters). */
  elections: number[] = [];
  /** Sim ms without a working leader (reset to 0 whenever one exists). */
  quiet = 0;
  /** The older of two simultaneous leaders, once two crowns have been seen (since the last resetCounters). */
  staleLeader: number | null = null;
  private uidSeq = 0;
  private ridSeq = 0;
  private nextReq = 0;
  private clientTarget: number | null = null;
  private warming = false;
  private seq = 0;

  constructor(private rng: Rng) {
    this.reset();
  }

  // ---------- helpers ----------
  private mkNode(i: number): RaftNode {
    return { id: i, name: 'S' + (i + 1), alive: true, role: 'follower', term: 0, votedFor: null, log: [], commit: 0,
      deadline: this.now + between(this.rng, CFG.etMin, CFG.etMax), votes: new Set(), next: [], match: [], hbAt: 0 };
  }
  linked = (a: number, b: number): boolean => !this.cut.has(linkKey(a, b));
  private lastTerm = (n: RaftNode) => (n.log.length ? n.log[n.log.length - 1].term : 0);
  private resetDeadline(n: RaftNode) {
    n.deadline = this.now + between(this.rng, CFG.etMin, CFG.etMax);
  }
  private send(from: number, to: number, m: Pick<Msg, 'type' | 'p'>) {
    this.msgs.push({ from, to, t0: this.now, t1: this.now + between(this.rng, CFG.latMin, CFG.latMax), id: ++this.seq, ...m } as Msg);
  }
  log(s: string) {
    if (this.warming) return;
    this.feed.unshift(`${(this.now / 1000).toFixed(1).padStart(5, ' ')}s  ${s}`);
    if (this.feed.length > 30) this.feed.length = 30;
  }
  private violate(what: string) {
    this.violations.push(what);
    this.log('SAFETY VIOLATION: ' + what);
  }

  // ---------- Raft ----------
  private startElection(n: RaftNode) {
    n.term++;
    n.role = 'candidate';
    n.votedFor = n.id;
    n.votes = new Set([n.id]);
    this.resetDeadline(n);
    this.log(`${n.name} times out, starts election for term ${n.term}`);
    for (let p = 0; p < N; p++) if (p !== n.id) this.send(n.id, p, { type: 'RV', p: { term: n.term, lastIdx: n.log.length, lastTerm: this.lastTerm(n) } });
  }
  private becomeLeader(n: RaftNode) {
    n.role = 'leader';
    const prev = this.leaderOfTerm[n.term];
    if (prev !== undefined && prev !== n.id) this.violate(`Two leaders elected in term ${n.term}`);
    this.leaderOfTerm[n.term] = n.id;
    for (let p = 0; p < N; p++) {
      n.next[p] = n.log.length + 1;
      n.match[p] = 0;
    }
    n.log.push({ term: n.term, cmd: 'noop', rid: null, uid: ++this.uidSeq });
    n.hbAt = this.now;
    this.log(`${n.name} wins ${n.votes.size} votes, leads term ${n.term}`);
    if (!this.warming) this.elections.push(this.now);
  }
  private broadcastAppend(n: RaftNode) {
    for (let p = 0; p < N; p++) {
      if (p === n.id) continue;
      const prev = n.next[p] - 1;
      const prevTerm = prev > 0 ? n.log[prev - 1].term : 0;
      const entries = n.log.slice(prev, prev + 6).map((e) => ({ ...e }));
      this.send(n.id, p, { type: 'AE', p: { term: n.term, prev, prevTerm, entries, commit: n.commit } });
    }
  }
  private setCommit(n: RaftNode, c: number) {
    for (let i = n.commit + 1; i <= c; i++) {
      const e = n.log[i - 1];
      const g = this.committed[i];
      if (g) {
        if (g.uid !== e.uid) this.violate(`Index ${i} committed with two different values`);
      } else {
        this.committed[i] = { term: e.term, uid: e.uid, cmd: e.cmd };
        if (e.rid) {
          const r = this.requests.find((r) => r.rid === e.rid);
          if (r && r.st === 'pend') r.st = 'ok';
        }
      }
    }
    if (c > n.commit) n.commit = c;
  }
  private advanceCommit(n: RaftNode) {
    for (let k = n.log.length; k > n.commit; k--) {
      if (n.log[k - 1].term !== n.term) break;
      let cnt = 1;
      for (let p = 0; p < N; p++) if (p !== n.id && n.match[p] >= k) cnt++;
      if (cnt >= MAJ) {
        this.setCommit(n, k);
        break;
      }
    }
  }
  private handle(m: Msg) {
    const n = this.nodes[m.to];
    const term = m.p.term;
    if (term > n.term) {
      n.term = term;
      n.votedFor = null;
      if (n.role !== 'follower') {
        if (n.role === 'leader') this.log(`${n.name} sees term ${term}, steps down`);
        n.role = 'follower';
      }
    }
    switch (m.type) {
      case 'RV': {
        const p = m.p;
        const upToDate = p.lastTerm > this.lastTerm(n) || (p.lastTerm === this.lastTerm(n) && p.lastIdx >= n.log.length);
        const grant = p.term === n.term && (n.votedFor === null || n.votedFor === m.from) && upToDate;
        if (grant) {
          n.votedFor = m.from;
          this.resetDeadline(n);
        }
        this.send(n.id, m.from, { type: 'RVR', p: { term: n.term, grant } });
        break;
      }
      case 'RVR':
        if (n.role === 'candidate' && m.p.term === n.term && m.p.grant) {
          n.votes.add(m.from);
          if (n.votes.size >= MAJ) this.becomeLeader(n);
        }
        break;
      case 'AE': {
        const p = m.p;
        if (p.term < n.term) {
          this.send(n.id, m.from, { type: 'AER', p: { term: n.term, ok: false, hint: n.log.length } });
          break;
        }
        if (n.role !== 'follower') n.role = 'follower';
        this.resetDeadline(n);
        if (p.prev > n.log.length || (p.prev > 0 && n.log[p.prev - 1].term !== p.prevTerm)) {
          this.send(n.id, m.from, { type: 'AER', p: { term: n.term, ok: false, hint: Math.min(n.log.length, p.prev - 1) } });
          break;
        }
        p.entries.forEach((e, i) => {
          const idx = p.prev + 1 + i;
          if (n.log.length >= idx) {
            if (n.log[idx - 1].term !== e.term) {
              const dropped = n.log.slice(idx - 1);
              for (let j = 0; j < dropped.length; j++) {
                const g = this.committed[idx + j];
                if (g && g.uid === dropped[j].uid) this.violate(`${n.name} erased committed entry ${idx + j}`);
              }
              this.log(`${n.name} discards ${dropped.length} uncommitted entr${dropped.length > 1 ? 'ies' : 'y'} (never committed, nothing lost)`);
              n.log.length = idx - 1;
              n.log.push({ ...e });
            }
          } else n.log.push({ ...e });
        });
        const last = p.prev + p.entries.length;
        if (p.commit > n.commit) this.setCommit(n, Math.min(p.commit, last));
        this.send(n.id, m.from, { type: 'AER', p: { term: n.term, ok: true, match: last } });
        break;
      }
      case 'AER': {
        if (n.role !== 'leader' || m.p.term !== n.term) break;
        if (m.p.ok) {
          n.match[m.from] = Math.max(n.match[m.from], m.p.match!);
          n.next[m.from] = n.match[m.from] + 1;
          this.advanceCommit(n);
        } else n.next[m.from] = Math.max(1, Math.min(n.next[m.from] - 1, m.p.hint! + 1));
        break;
      }
    }
  }
  private deliver(m: Msg) {
    if (!this.nodes[m.to].alive || !this.linked(m.from, m.to)) {
      this.drops.push({ from: m.from, to: m.to, t: this.now });
      return;
    }
    this.handle(m);
  }
  private tickNode(n: RaftNode) {
    if (!n.alive) return;
    if (n.role !== 'leader' && this.now >= n.deadline) this.startElection(n);
    if (n.role === 'leader' && this.now >= n.hbAt) {
      this.broadcastAppend(n);
      n.hbAt = this.now + CFG.hb;
    }
  }
  leaders(): RaftNode[] {
    return this.nodes.filter((n) => n.alive && n.role === 'leader');
  }
  /** A leader that can reach a majority (itself plus 2 live, linked servers). */
  workingLeader(): RaftNode | null {
    return (
      this.leaders().find((l) => {
        let c = 1;
        for (const n of this.nodes) if (n.id !== l.id && n.alive && this.linked(l.id, n.id)) c++;
        return c >= MAJ;
      }) ?? null
    );
  }
  private clientTick() {
    for (const r of this.requests) {
      if (r.st === 'pend' && this.now - r.t0 > CFG.reqTimeout) {
        r.st = 'fail';
        if (this.clientTarget === r.to) this.clientTarget = null;
      }
    }
    if (this.now < this.nextReq) return;
    this.nextReq = this.now + CFG.reqEvery;
    const ct = this.clientTarget;
    let t = ct !== null && this.nodes[ct].alive && this.nodes[ct].role === 'leader' ? ct : null;
    if (t === null) {
      const ls = this.leaders();
      if (ls.length) t = ls[intBelow(this.rng, ls.length)].id;
    }
    const rid = ++this.ridSeq;
    if (t === null) this.requests.push({ rid, st: 'fail', t0: this.now, to: null });
    else {
      this.clientTarget = t;
      const n = this.nodes[t];
      n.log.push({ term: n.term, cmd: 'x=' + Math.floor(between(this.rng, 1, 99)), rid, uid: ++this.uidSeq });
      this.requests.push({ rid, st: 'pend', t0: this.now, to: t });
    }
    if (this.requests.length > 80) this.requests.splice(0, this.requests.length - 80);
  }

  /** Advance simulated time by dt ms, in fixed 20 ms ticks. */
  step(dt: number) {
    const end = this.now + dt;
    while (this.now < end) {
      this.now = Math.min(end, this.now + TICK);
      if (this.msgs.length) {
        const due: Msg[] = [];
        this.msgs = this.msgs.filter((m) => (m.t1 <= this.now ? (due.push(m), false) : true));
        due.sort((a, b) => a.t1 - b.t1);
        for (const m of due) this.deliver(m);
      }
      for (const n of this.nodes) this.tickNode(n);
      this.clientTick();
      if (!this.warming) {
        this.quiet = this.workingLeader() ? 0 : this.quiet + TICK;
        if (this.staleLeader === null) {
          const ls = this.leaders();
          if (ls.length >= 2) this.staleLeader = ls.reduce((a, b) => (b.term < a.term ? b : a)).id;
        }
      }
    }
    if (this.drops.length > 40) this.drops = this.drops.filter((d) => this.now - d.t < 1000);
  }

  /** Fresh healthy cluster with an elected leader. */
  reset() {
    this.now = 0;
    this.nodes = Array.from({ length: N }, (_, i) => this.mkNode(i));
    this.msgs = [];
    this.cut = new Set();
    this.committed = {};
    this.leaderOfTerm = {};
    this.uidSeq = 0;
    this.violations = [];
    this.requests = [];
    this.ridSeq = 0;
    this.nextReq = 0;
    this.clientTarget = null;
    this.drops = [];
    this.feed = [];
    this.warming = true;
    let guard = 0;
    this.step(3500);
    while (!this.leaders().length && guard++ < 40) this.step(500);
    this.step(1500);
    this.warming = false;
    this.requests = this.requests.filter((r) => r.st !== 'fail');
    this.resetCounters();
  }
  resetCounters() {
    this.elections = [];
    this.quiet = 0;
    this.staleLeader = null;
  }

  // ---------- player actions ----------
  toggleLink(a: number, b: number): boolean {
    const k = linkKey(a, b);
    if (this.cut.has(k)) {
      this.cut.delete(k);
      this.log(`Link S${a + 1}–S${b + 1} restored`);
    } else {
      this.cut.add(k);
      this.log(`Link S${a + 1}–S${b + 1} cut`);
    }
    if (this.workingLeader()) this.quiet = 0;
    return this.cut.has(k);
  }
  toggleNode(i: number): boolean {
    const n = this.nodes[i];
    if (n.alive) {
      n.alive = false;
      n.role = 'follower';
      n.commit = 0;
      n.votes = new Set();
      this.log(`${n.name} crashed`);
    } else {
      n.alive = true;
      this.resetDeadline(n);
      this.log(`${n.name} restarted (keeps its term and log on disk)`);
    }
    return n.alive;
  }
  healAll() {
    this.cut.clear();
    this.nodes.forEach((n) => {
      if (!n.alive) {
        n.alive = true;
        this.resetDeadline(n);
      }
    });
    this.log('Network healed, all servers up');
  }
  electionsWithin(ms: number): number {
    return this.elections.filter((t) => this.now - t < ms).length;
  }
  maxCommitted(): number {
    return Math.max(0, ...Object.keys(this.committed).map(Number));
  }
}

/** Task checks. Task 0 is the tutorial. */
export const STORM_COUNT = 4;
export const STORM_WINDOW = 20000;
export const SILENCE_MS = 10000;
export const DEPOSE_COUNT = 2;
export const TASK_CHECKS: ((r: Raft) => boolean)[] = [
  () => false,
  (r) => r.elections.length >= DEPOSE_COUNT,
  // Two crowns: two leaders at once, then the stale one rejoins and steps down (alive, not leader).
  (r) => r.staleLeader !== null && r.nodes[r.staleLeader].alive && r.nodes[r.staleLeader].role !== 'leader' && r.leaders().length === 1,
  (r) => r.quiet >= SILENCE_MS,
  (r) => r.electionsWithin(STORM_WINDOW) >= STORM_COUNT,
];
