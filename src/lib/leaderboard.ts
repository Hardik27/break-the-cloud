/**
 * Leaderboard client. One interface, three backends:
 *   supabase  real shared leaderboard (needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY)
 *   mock      in-memory, for Playwright tests (set window.__BTC_LB__ = 'mock' before the app loads)
 *   offline   no shared board; the game still works and best scores stay in this browser
 * Scores are computed and checked on the server by the finish-run Edge Function.
 */
import type { FinishPayload } from '../../supabase/functions/_shared/validate.ts';
import { validateRun } from '../../supabase/functions/_shared/validate.ts';
import { checkNickname } from './nickname';

export type { FinishPayload };
export type Range = 'all' | 'week' | 'class';

export interface LbRow {
  rank: number;
  nickname: string;
  points: number;
  ms: number;
  stars: number;
  me: boolean;
}

export interface FinishResult {
  ok: boolean;
  points?: number;
  stars?: number;
  reason?: string;
}

export interface ClassInfo { code: string; name: string; city: string; course: string | null }
export interface ClassReport {
  class: ClassInfo & { created_at: string };
  summary: { learners: number; runs_started: number; runs_finished: number; first_activity: string | null; last_activity: string | null };
  games: { game_id: string; learners_started: number; learners_finished: number; avg_points: number | null; avg_stars: number | null }[];
  learners: { name: string; games_finished: number; points: number; minutes?: number; concepts?: number; last_active: string }[];
}

export interface CompInfo {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  /** Members who are not disqualified (from competitionInfo). */
  members?: number;
  /** The caller joined this competition. */
  is_member?: boolean;
  /** The caller joined and was disqualified by the organiser. */
  disqualified?: boolean;
}
export interface CompRow { rank: number; nickname: string; points: number; games: number; stars: number; reached_at: string; me: boolean }
export interface CompMe {
  nickname: string | null;
  member: boolean;
  disqualified: boolean;
  rank: number | null;
  of: number;
  points: number;
  stars: number;
  games: number;
  per_game: { game_id: string; level: number; points: number; stars: number }[];
  per_level: { level: number; points: number; rank: number | null }[];
}
export interface CompAdmin {
  competition: CompInfo;
  join_code: string;
  members: number;
  players: number;
  disqualified: { nickname: string; reason: string | null; at: string }[];
  standings: Omit<CompRow, 'me'>[];
  level_winners: { level: number; winner: string | null; points: number | null }[];
  finalists: { nickname: string; rank: number; runs: { game_id: string; points: number; ms: number; mistakes: number; task_ms: number[]; finished_at: string }[] | null }[];
}
export type Fail = { ok: false; reason: string };
/** A claim code for one competition or class (shown once). */
export type Claim = { ok: true; claim: string } | Fail;
export interface JoinTarget { kind: 'class' | 'competition'; id: string; name: string }
/** One learning-activity event (see supabase/migrations/*_telemetry.sql for the types). */
export interface FeedbackInput { message: string; rating: number | null; page: string; game_id: string | null }
export interface TelemetryEvent {
  session_id: string;
  type: string;
  game_id?: string | null;
  task?: number | null;
  data?: Record<string, unknown>;
}

export interface Backend {
  kind: 'supabase' | 'mock' | 'offline';
  /** Records a run start on the server (server timestamp), tagged with the learner's class if any. Returns the run id, or null if offline. */
  startRun(gameId: string, classCode?: string | null): Promise<string | null>;
  /** Instructor: create a class. Returns the join code and the secret instructor key (shown once). */
  createClass(name: string, city: string, course: string): Promise<{ ok: true; code: string; key: string } | { ok: false; reason: string }>;
  /** Public: the name and city behind a join code, or null if it does not exist. */
  classInfo(code: string): Promise<ClassInfo | null>;
  /** Instructor: the class report (needs the key). */
  classReport(code: string, key: string): Promise<{ ok: true; report: ClassReport } | { ok: false; reason: string }>;
  finishRun(runId: string, payload: FinishPayload): Promise<FinishResult>;
  /** range 'class' needs classCode: only runs played in that class. */
  top(gameId: string, range: Range, classCode?: string | null): Promise<LbRow[] | null>;
  myRank(gameId: string, range: Range, classCode?: string | null): Promise<{ rank: number; points: number; of: number } | null>;
  nickname(): Promise<string | null>;
  setNickname(n: string): Promise<{ ok: boolean; reason?: string }>;
  stats(): Promise<{ started: number; finished: number } | null>;
  createCompetition(id: string, name: string, starts: string, ends: string): Promise<{ ok: true; key: string; joinCode: string } | Fail>;
  /** Join with the competition's join code (needs a nickname). Returns a claim code for this competition. */
  joinCompetition(id: string, code: string): Promise<Claim>;
  /** A member's new claim code for a competition (the old one stops working). */
  competitionNewClaim(id: string): Promise<string | null>;
  /** Join a class on the server (needs a nickname). Returns a claim code for this class. */
  classJoin(code: string): Promise<Claim>;
  /** Which class or competition a join code belongs to. */
  findJoinCode(code: string): Promise<JoinTarget | null>;
  /** Move a nickname and its progress to this browser, proven by a class or competition claim code. */
  restoreProgress(kind: 'class' | 'competition', id: string, nickname: string, code: string): Promise<{ ok: true; nickname: string } | Fail>;
  /** Organiser: hide a member from every board of the competition (data is kept), or undo it. */
  disqualify(id: string, key: string, nickname: string, reason: string): Promise<{ ok: true } | Fail>;
  reinstate(id: string, key: string, nickname: string): Promise<{ ok: true } | Fail>;
  /** Learning telemetry (fire and forget). */
  logEvents(rows: TelemetryEvent[]): Promise<void>;
  /** Anonymous feedback: a message, an optional 1-4 rating, and the page it was sent from. */
  sendFeedback(f: FeedbackInput): Promise<{ ok: true } | Fail>;
  competitionInfo(id: string): Promise<CompInfo | null>;
  activeCompetitions(): Promise<CompInfo[]>;
  /** Overall (level null) or one level's board for a competition. */
  competitionBoard(id: string, level: number | null): Promise<CompRow[] | null>;
  competitionMe(id: string): Promise<CompMe | null>;
  competitionAdmin(id: string, key: string): Promise<{ ok: true; data: CompAdmin } | Fail>;
  verifyClaim(id: string, key: string, nickname: string, code: string): Promise<{ ok: true; valid: boolean; reason?: string; rank?: number; points?: number } | Fail>;
  /** Deletes everything the player has on the server: runs, nickname, memberships, activity. */
  deleteMyData(): Promise<boolean>;
}

export const offlineBackend: Backend = {
  kind: 'offline',
  startRun: async () => null,
  finishRun: async () => ({ ok: false, reason: 'offline' }),
  top: async () => null,
  myRank: async () => null,
  nickname: async () => null,
  setNickname: async () => ({ ok: false, reason: 'The shared leaderboard is not available right now.' }),
  stats: async () => null,
  deleteMyData: async () => true,
  createClass: async () => ({ ok: false, reason: 'Classes need the shared leaderboard, which is not set up on this site yet.' }),
  classInfo: async () => null,
  classReport: async () => ({ ok: false, reason: 'Classes need the shared leaderboard, which is not set up on this site yet.' }),
  createCompetition: async () => ({ ok: false, reason: 'Competitions need the shared leaderboard, which is not set up on this site yet.' }),
  joinCompetition: async () => ({ ok: false, reason: 'Competitions need the shared leaderboard, which is not set up on this site yet.' }),
  competitionNewClaim: async () => null,
  classJoin: async () => ({ ok: false, reason: 'Classes need the shared leaderboard, which is not set up on this site yet.' }),
  findJoinCode: async () => null,
  restoreProgress: async () => ({ ok: false, reason: 'The shared leaderboard is not available right now.' }),
  disqualify: async () => ({ ok: false, reason: 'Competitions need the shared leaderboard, which is not set up on this site yet.' }),
  reinstate: async () => ({ ok: false, reason: 'Competitions need the shared leaderboard, which is not set up on this site yet.' }),
  logEvents: async () => {},
  sendFeedback: async () => ({ ok: false, reason: 'Feedback needs the shared leaderboard, which is not set up on this site yet.' }),
  competitionInfo: async () => null,
  activeCompetitions: async () => [],
  competitionBoard: async () => null,
  competitionMe: async () => null,
  competitionAdmin: async () => ({ ok: false, reason: 'Competitions need the shared leaderboard, which is not set up on this site yet.' }),
  verifyClaim: async () => ({ ok: false, reason: 'Competitions need the shared leaderboard, which is not set up on this site yet.' }),
};

/** In-memory backend that behaves like the real one, including server-side validation, memberships and claim codes. */
export function mockBackend(): Backend {
  interface Run { id: string; user: string; game: string; started: number; status: 'started' | 'finished' | 'rejected'; points: number; ms: number; stars: number; at: number; cls?: string | null }
  interface Member { claim: string | null; dq: string | null; reason: string | null }
  const classes = new Map<string, ClassInfo & { key: string; created_at: string }>();
  const classMembers = new Map<string, Map<string, string>>();
  const comps = new Map<string, CompInfo & { key: string; joinCode: string; featured: boolean }>();
  const members = new Map<string, Map<string, Member>>();
  const events: TelemetryEvent[] = [];
  // Playwright reads the events the page sent.
  if (typeof window !== 'undefined') (window as unknown as { __BTC_EVENTS__?: TelemetryEvent[] }).__BTC_EVENTS__ = events;
  const LEVEL: Record<string, number> = {};
  const me = 'me';
  const runs: Run[] = [];
  const names = new Map<string, string>([['bot1', 'packet_pusher'], ['bot2', 'raft_raccoon'], ['bot3', 'quorum_queen']]);
  // A few rivals so the board is not empty.
  [['bot1', 2400, 61000], ['bot2', 1900, 75000], ['bot3', 1500, 90000]].forEach(([u, p, ms], i) => {
    for (const game of ['traffic-cop', 'replica-diff', 'split-brain']) {
      runs.push({ id: `seed${i}${game}`, user: u as string, game, started: 0, status: 'finished', points: p as number, ms: ms as number, stars: 2, at: Date.now() });
    }
  });
  let seq = 0;
  const newClaim = () => `BTC-${String(1000 + ++seq).slice(-4).replace(/[01]/g, '7')}-MOCK`;
  const userOf = (nick: string) => [...names.entries()].find(([, n]) => n.toLowerCase() === nick.trim().toLowerCase())?.[0];
  const member = (id: string, user: string) => members.get(id)?.get(user);
  /** Best finished run per member per game inside the competition window (members with a nickname, not disqualified). */
  const compTotals = (id: string, level: number | null) => {
    const c = comps.get(id);
    if (!c) return [];
    const from = Date.parse(c.starts_at), to = Date.parse(c.ends_at);
    const best = new Map<string, Run>();
    for (const r of runs) {
      const m = member(id, r.user);
      if (r.status !== 'finished' || r.at < from || r.at > to || !names.has(r.user) || !m || m.dq) continue;
      if (level !== null && (LEVEL[r.game] ?? 0) !== level) continue;
      const k = `${r.user}|${r.game}`;
      const b = best.get(k);
      if (!b || r.points > b.points) best.set(k, r);
    }
    const tot = new Map<string, { user: string; points: number; games: number; stars: number; reached: number }>();
    for (const r of best.values()) {
      const t = tot.get(r.user) ?? { user: r.user, points: 0, games: 0, stars: 0, reached: 0 };
      t.points += r.points;
      t.games++;
      t.stars += r.stars;
      t.reached = Math.max(t.reached, r.at);
      tot.set(r.user, t);
    }
    return [...tot.values()].sort((a, b) => b.points - a.points || b.stars - a.stars || a.reached - b.reached);
  };
  const board = (game: string, cls?: string | null) => {
    const best = new Map<string, Run>();
    for (const r of runs) {
      if (r.game !== game || r.status !== 'finished') continue;
      if (cls && r.cls !== cls) continue;
      const b = best.get(r.user);
      if (!b || r.points > b.points || (r.points === b.points && r.ms < b.ms)) best.set(r.user, r);
    }
    return [...best.values()].sort((a, b) => b.points - a.points || a.ms - b.ms);
  };
  const info = (c: CompInfo & { key: string }) => {
    const ms = members.get(c.id) ?? new Map<string, Member>();
    return { id: c.id, name: c.name, starts_at: c.starts_at, ends_at: c.ends_at, members: [...ms.values()].filter((m) => !m.dq).length, is_member: ms.has(me), disqualified: !!ms.get(me)?.dq };
  };
  return {
    kind: 'mock',
    async startRun(game, cls) {
      const id = `run${++seq}`;
      runs.push({ id, user: me, game, started: performance.now(), status: 'started', points: 0, ms: 0, stars: 0, at: Date.now(), cls: cls && classes.has(cls) ? cls : null });
      return id;
    },
    async createClass(name, city, course) {
      if (name.trim().length < 3 || city.trim().length < 2) return { ok: false, reason: 'Give the class a name (3+ letters) and a city.' };
      const code = `T${String(++seq).padStart(5, '0')}`.replace(/[01]/g, '7').slice(0, 6);
      const key = `KEY${seq}ABCDEFGHJKLMNPQ`.slice(0, 20);
      classes.set(code, { code, name: name.trim(), city: city.trim(), course: course.trim() || null, key, created_at: new Date().toISOString() });
      return { ok: true, code, key };
    },
    async classInfo(code) {
      const c = classes.get(code.toUpperCase());
      return c ? { code: c.code, name: c.name, city: c.city, course: c.course } : null;
    },
    async classReport(code, key) {
      const c = classes.get(code.toUpperCase());
      if (!c || c.key !== key) return { ok: false, reason: 'wrong class code or instructor key' };
      const rs = runs.filter((r) => r.cls === c.code);
      const users = [...new Set([...(classMembers.get(c.code)?.keys() ?? []), ...rs.map((r) => r.user)])];
      const games = [...new Set(rs.map((r) => r.game))].sort().map((g) => {
        const gr = rs.filter((r) => r.game === g);
        const fin = gr.filter((r) => r.status === 'finished');
        return { game_id: g, learners_started: new Set(gr.map((r) => r.user)).size, learners_finished: new Set(fin.map((r) => r.user)).size, avg_points: fin.length ? Math.round(fin.reduce((a, r) => a + r.points, 0) / fin.length) : null, avg_stars: fin.length ? Math.round((10 * fin.reduce((a, r) => a + r.stars, 0)) / fin.length) / 10 : null };
      });
      const learners = users.map((u) => {
        const fin = rs.filter((r) => r.user === u && r.status === 'finished');
        const best = new Map<string, number>();
        fin.forEach((r) => best.set(r.game, Math.max(best.get(r.game) ?? 0, r.points)));
        const mine = u === me ? events : [];
        const minutes = Math.round(mine.filter((e) => e.type === 'active').reduce((a, e) => a + Number(e.data?.s ?? 0), 0) / 60);
        const concepts = new Set(mine.filter((e) => e.type === 'task_done').map((e) => `${e.game_id}|${e.task}`)).size;
        const ur = rs.filter((r) => r.user === u);
        return { name: names.get(u) ?? `learner-${u.slice(0, 4)}`, games_finished: best.size, points: [...best.values()].reduce((a, b) => a + b, 0), minutes, concepts, last_active: new Date(ur.length ? Math.max(...ur.map((r) => r.at)) : Date.now()).toISOString() };
      }).sort((a, b) => b.points - a.points);
      return { ok: true, report: { class: { code: c.code, name: c.name, city: c.city, course: c.course, created_at: c.created_at }, summary: { learners: users.length, runs_started: rs.length, runs_finished: rs.filter((r) => r.status === 'finished').length, first_activity: rs.length ? new Date(Math.min(...rs.map((r) => r.at))).toISOString() : null, last_activity: rs.length ? new Date(Math.max(...rs.map((r) => r.at))).toISOString() : null }, games, learners } };
    },
    async finishRun(id, payload) {
      const r = runs.find((x) => x.id === id && x.user === me);
      if (!r || r.status !== 'started') return { ok: false, reason: 'run not found' };
      const v = validateRun(r.game, performance.now() - r.started, payload);
      if (!v.ok) {
        r.status = 'rejected';
        return { ok: false, reason: v.reason };
      }
      Object.assign(r, { status: 'finished', points: v.total, ms: v.ms, stars: v.stars, at: Date.now() });
      return { ok: true, points: v.total, stars: v.stars };
    },
    async top(game, range, cls) {
      return board(game, range === 'class' ? cls : null).slice(0, 20).map((r, i) => ({ rank: i + 1, nickname: names.get(r.user) ?? 'anonymous', points: r.points, ms: r.ms, stars: r.stars, me: r.user === me }));
    },
    async myRank(game, range, cls) {
      const b = board(game, range === 'class' ? cls : null);
      const i = b.findIndex((r) => r.user === me);
      return i < 0 ? null : { rank: i + 1, points: b[i].points, of: b.length };
    },
    async nickname() {
      return names.get(me) ?? null;
    },
    async setNickname(n) {
      const c = checkNickname(n);
      if (!c.ok) return { ok: false, reason: c.reason };
      if ([...names.entries()].some(([u, x]) => u !== me && x.toLowerCase() === c.value.toLowerCase())) return { ok: false, reason: 'That nickname is taken.' };
      names.set(me, c.value);
      return { ok: true };
    },
    async stats() {
      return { started: runs.length, finished: runs.filter((r) => r.status === 'finished').length };
    },
    async createCompetition(id, name, starts, ends) {
      if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(id)) return { ok: false, reason: 'The link may use only lowercase letters, digits and dashes (3–40).' };
      if (comps.has(id)) return { ok: false, reason: 'That competition link is taken.' };
      if (Date.parse(ends) <= Date.parse(starts)) return { ok: false, reason: 'The end must be after the start.' };
      const key = `ORGKEY${++seq}ABCDEFGHJKLMN`.slice(0, 20);
      const joinCode = `J${String(++seq).padStart(5, '7')}`.replace(/[01]/g, '7').slice(0, 6);
      comps.set(id, { id, name, starts_at: new Date(starts).toISOString(), ends_at: new Date(ends).toISOString(), key, joinCode, featured: false });
      // The rivals are students who joined this competition.
      members.set(id, new Map(['bot1', 'bot2', 'bot3'].map((u) => [u, { claim: newClaim(), dq: null, reason: null }])));
      const reg = await import('../games/registry');
      reg.GAMES.forEach((g) => (LEVEL[g.id] = g.level));
      return { ok: true, key, joinCode };
    },
    async joinCompetition(id, code) {
      const c = comps.get(id);
      if (!names.has(me)) return { ok: false, reason: 'Pick a nickname first.' };
      if (!c || c.joinCode !== code.trim().toUpperCase()) return { ok: false, reason: 'That join code is not right for this competition. Check it with the organiser.' };
      if (Date.now() > Date.parse(c.ends_at)) return { ok: false, reason: 'This competition has ended.' };
      const claim = newClaim();
      const ms = members.get(id)!;
      ms.set(me, { claim, dq: ms.get(me)?.dq ?? null, reason: ms.get(me)?.reason ?? null });
      return { ok: true, claim };
    },
    async competitionNewClaim(id) {
      const m = member(id, me);
      if (!m) return null;
      m.claim = newClaim();
      return m.claim;
    },
    async classJoin(code) {
      const c = classes.get(code.toUpperCase());
      if (!names.has(me)) return { ok: false, reason: 'Pick a nickname first.' };
      if (!c) return { ok: false, reason: 'No class with that code.' };
      const claim = newClaim();
      if (!classMembers.has(c.code)) classMembers.set(c.code, new Map());
      classMembers.get(c.code)!.set(me, claim);
      return { ok: true, claim };
    },
    async findJoinCode(code) {
      const k = code.trim().toUpperCase();
      const cl = classes.get(k);
      if (cl) return { kind: 'class', id: cl.code, name: cl.name };
      const c = [...comps.values()].find((x) => x.joinCode === k);
      return c ? { kind: 'competition', id: c.id, name: c.name } : null;
    },
    async restoreProgress(kind, id, nickname, code) {
      const old = userOf(nickname);
      const claim = old ? (kind === 'class' ? classMembers.get(id.toUpperCase())?.get(old) : member(id, old)?.claim) : undefined;
      if (!old || !claim || claim !== code.trim().toUpperCase()) return { ok: false, reason: 'The nickname and claim code do not match.' };
      if (old === me) return { ok: true, nickname: names.get(me)! };
      const nick = names.get(old)!;
      names.delete(old);
      names.set(me, nick);
      runs.forEach((r) => r.user === old && (r.user = me));
      for (const ms of [...members.values(), ...classMembers.values()]) {
        const v = ms.get(old as string);
        if (v !== undefined && !ms.has(me)) ms.set(me, v as never);
        ms.delete(old as string);
      }
      return { ok: true, nickname: nick };
    },
    async competitionInfo(id) {
      const c = comps.get(id);
      return c ? info(c) : null;
    },
    async activeCompetitions() {
      return [...comps.values()].filter((c) => c.featured || members.get(c.id)?.has(me)).map(info);
    },
    async competitionBoard(id, level) {
      if (!comps.has(id)) return null;
      return compTotals(id, level).slice(0, 50).map((t, i) => ({ rank: i + 1, nickname: names.get(t.user)!, points: t.points, games: t.games, stars: t.stars, reached_at: new Date(t.reached).toISOString(), me: t.user === me }));
    },
    async competitionMe(id) {
      if (!comps.has(id)) return null;
      const all = compTotals(id, null);
      const i = all.findIndex((t) => t.user === me);
      const c = comps.get(id)!;
      const m = member(id, me);
      const from = Date.parse(c.starts_at), to = Date.parse(c.ends_at);
      const best = new Map<string, Run>();
      if (m && !m.dq)
        runs.filter((r) => r.user === me && r.status === 'finished' && r.at >= from && r.at <= to).forEach((r) => {
          const b = best.get(r.game);
          if (!b || r.points > b.points) best.set(r.game, r);
        });
      const per_game = [...best.values()].map((r) => ({ game_id: r.game, level: LEVEL[r.game] ?? 0, points: r.points, stars: r.stars }));
      const levels = [...new Set(per_game.map((g) => g.level))].sort();
      return {
        nickname: names.get(me) ?? null,
        member: !!m,
        disqualified: !!m?.dq,
        rank: i < 0 ? null : i + 1,
        of: all.length,
        points: i < 0 ? 0 : all[i].points,
        stars: i < 0 ? 0 : all[i].stars,
        games: i < 0 ? 0 : all[i].games,
        per_game,
        per_level: levels.map((l) => {
          const lb = compTotals(id, l);
          const j = lb.findIndex((t) => t.user === me);
          return { level: l, points: per_game.filter((g) => g.level === l).reduce((a, g) => a + g.points, 0), rank: j < 0 ? null : j + 1 };
        }),
      };
    },
    async competitionAdmin(id, key) {
      const c = comps.get(id);
      if (!c || c.key !== key) return { ok: false, reason: 'wrong competition link or organiser key' };
      const all = compTotals(id, null);
      const standings = all.map((t, i) => ({ rank: i + 1, nickname: names.get(t.user)!, points: t.points, games: t.games, stars: t.stars, reached_at: new Date(t.reached).toISOString() }));
      const ms = members.get(id)!;
      return {
        ok: true,
        data: {
          competition: { id: c.id, name: c.name, starts_at: c.starts_at, ends_at: c.ends_at },
          join_code: c.joinCode,
          members: [...ms.values()].filter((m) => !m.dq).length,
          players: all.length,
          standings,
          disqualified: [...ms.entries()].filter(([, m]) => m.dq).map(([u, m]) => ({ nickname: names.get(u) ?? u, reason: m.reason, at: m.dq! })),
          level_winners: [1, 2, 3, 4, 5, 6, 7, 8].map((l) => {
            const w = compTotals(id, l)[0];
            return { level: l, winner: w ? names.get(w.user)! : null, points: w ? w.points : null };
          }),
          finalists: standings.slice(0, 20).map((s) => ({ nickname: s.nickname, rank: s.rank, runs: runs.filter((r) => names.get(r.user) === s.nickname && r.status === 'finished').map((r) => ({ game_id: r.game, points: r.points, ms: r.ms, mistakes: 0, task_ms: [], finished_at: new Date(r.at).toISOString() })) })),
        },
      };
    },
    async disqualify(id, key, nickname, reason) {
      const c = comps.get(id);
      if (!c || c.key !== key) return { ok: false, reason: 'Wrong competition link or organiser key.' };
      const m = member(id, userOf(nickname) ?? '');
      if (!m) return { ok: false, reason: 'No member with that nickname.' };
      m.dq = new Date().toISOString();
      m.reason = reason.trim() || null;
      return { ok: true };
    },
    async reinstate(id, key, nickname) {
      const c = comps.get(id);
      if (!c || c.key !== key) return { ok: false, reason: 'Wrong competition link or organiser key.' };
      const m = member(id, userOf(nickname) ?? '');
      if (!m) return { ok: false, reason: 'No member with that nickname.' };
      m.dq = null;
      m.reason = null;
      return { ok: true };
    },
    async verifyClaim(id, key, nickname, code) {
      const c = comps.get(id);
      if (!c || c.key !== key) return { ok: false, reason: 'wrong competition link or organiser key' };
      const user = userOf(nickname);
      if (!user) return { ok: true, valid: false, reason: 'no player with that nickname' };
      const m = member(id, user);
      if (!m) return { ok: true, valid: false, reason: 'this nickname did not join this competition' };
      if (m.claim !== code.trim().toUpperCase()) return { ok: true, valid: false, reason: 'the claim code does not match this nickname' };
      if (m.dq) return { ok: true, valid: false, reason: `this player was disqualified${m.reason ? `: ${m.reason}` : ''}` };
      const all = compTotals(id, null);
      const i = all.findIndex((t) => t.user === user);
      return { ok: true, valid: true, rank: i < 0 ? undefined : i + 1, points: i < 0 ? 0 : all[i].points };
    },
    async logEvents(rows) {
      events.push(...rows);
    },
    async sendFeedback(f) {
      const msg = f.message.trim();
      if (msg.length < 3) return { ok: false, reason: 'Write a few words first.' };
      const box = ((window as unknown as { __BTC_FEEDBACK__?: FeedbackInput[] }).__BTC_FEEDBACK__ ??= []);
      if (box.length >= 5) return { ok: false, reason: 'Thanks! That is a lot of feedback for one hour. Try again later.' };
      box.push({ ...f, message: msg });
      return { ok: true };
    },
    async deleteMyData() {
      for (const ms of [...members.values(), ...classMembers.values()]) ms.delete(me);
      events.length = 0;
      for (let i = runs.length - 1; i >= 0; i--) if (runs[i].user === me) runs.splice(i, 1);
      names.delete(me);
      return true;
    },
  };
}

let backend: Promise<Backend> | null = null;

export function getBackend(): Promise<Backend> {
  if (backend) return backend;
  backend = (async () => {
    const w = window as unknown as { __BTC_LB__?: string };
    if (w.__BTC_LB__ === 'mock') return mockBackend();
    if (w.__BTC_LB__ === 'offline') return offlineBackend;
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url || !key) return offlineBackend;
    try {
      const { supabaseBackend } = await import('./leaderboard-supabase');
      return supabaseBackend(url, key);
    } catch {
      return offlineBackend;
    }
  })();
  return backend;
}

/** Never let a leaderboard call hang the UI: resolve to `fallback` after ms. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}
