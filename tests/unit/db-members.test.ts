/**
 * Memberships (join codes, scoped claim codes, disqualify, restore) and learning telemetry:
 * every migration, in order, in PGlite.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const ORG = '00000000-0000-0000-0000-0000000000e0';
const A = '00000000-0000-0000-0000-0000000000e1'; // joins VJTI
const B = '00000000-0000-0000-0000-0000000000e2'; // joins VJTI
const C = '00000000-0000-0000-0000-0000000000e3'; // global player, never joins
const NEW = '00000000-0000-0000-0000-0000000000e4'; // A's new phone
let db: PGlite;

async function as<R = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []): Promise<R[]> {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`);
  try {
    return (await db.query<R>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}
const owner = async <R = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<R>(sql, params)).rows;
const one = async <T>(uid: string | null, sql: string, params: unknown[] = []): Promise<T> => Object.values((await as(uid, sql, params))[0])[0] as T;

async function finished(uid: string, game: string, points: number, stars: number, at: string) {
  await as(uid, `insert into runs (game_id) values ($1)`, [game]);
  await owner(`update runs set status = 'finished', points = $3, stars = $4, ms = 60000, mistakes = 0, task_ms = '{0,10000}', finished_at = $5
               where id = (select id from runs where user_id = $1 and game_id = $2 and status = 'started' order by started_at desc limit 1)`, [uid, game, points, stars, at]);
}

let key = '';
let join = '';
let claimA = '';
const now = Date.now();
const iso = (h: number) => new Date(now + h * 3600_000).toISOString();

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${ORG}'), ('${A}'), ('${B}'), ('${C}'), ('${NEW}');`);
  for (const f of readdirSync('supabase/migrations').sort()) await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  for (const [u, n] of [[A, 'vjti_ace'], [B, 'raft_raccoon'], [C, 'global_gopher']]) await as(u, `insert into profiles (user_id, nickname) values ($1, $2)`, [u, n]);
}, 60_000);

describe('global players', () => {
  it('have no claim code any more', async () => {
    await expect(as(C, `select issue_claim_code()`)).rejects.toThrow(/does not exist/);
    await expect(owner(`select claim_hash from profiles`)).rejects.toThrow(/does not exist/);
  });
});

describe('joining a competition', () => {
  it('creating returns an organiser key and a 6-character join code', async () => {
    const [r] = await as<{ admin_key: string; join_code: string }>(ORG, `select * from create_competition('vjti-2026', 'VJTI Cup', $1, $2)`, [iso(-1), iso(48)]);
    expect(r.admin_key).toHaveLength(20);
    expect(r.join_code).toMatch(/^[A-Z2-9]{6}$/);
    key = r.admin_key;
    join = r.join_code;
  });
  it('needs the right code, and a nickname', async () => {
    await expect(as(A, `select join_competition('vjti-2026', 'WRONG1')`)).rejects.toThrow(/wrong competition code/);
    await expect(as(NEW, `select join_competition('vjti-2026', $1)`, [join])).rejects.toThrow(/nickname/);
    claimA = await one<string>(A, `select join_competition('vjti-2026', $1)`, [join.toLowerCase()]);
    expect(claimA).toMatch(/^BTC-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await as(B, `select join_competition('vjti-2026', $1)`, [join]);
  });
  it('a join code finds its competition (and a class code its class)', async () => {
    const [r] = await as<{ kind: string; id: string }>(null, `select * from find_join_code($1)`, [join.toLowerCase()]);
    expect(r).toMatchObject({ kind: 'competition', id: 'vjti-2026' });
  });
  it('nobody can read memberships directly', async () => {
    await expect(as(A, `select * from competition_members`)).rejects.toThrow(/permission denied/);
  });
  it('info says whether the caller is a member', async () => {
    const [a] = await as<{ is_member: boolean; members: number }>(A, `select * from competition_info('vjti-2026')`);
    const [c] = await as<{ is_member: boolean }>(C, `select * from competition_info('vjti-2026')`);
    expect(a).toMatchObject({ is_member: true, members: 2 });
    expect(c.is_member).toBe(false);
  });
  it('the home page shows it to members only, unless it is featured', async () => {
    expect((await as(A, `select * from active_competitions()`)).length).toBe(1);
    expect((await as(C, `select * from active_competitions()`)).length).toBe(0);
    await owner(`update competitions set featured = true where id = 'vjti-2026'`);
    expect((await as(C, `select * from active_competitions()`)).length).toBe(1);
    await owner(`update competitions set featured = false where id = 'vjti-2026'`);
  });
});

describe('competition boards rank only members', () => {
  it('a global player who plays during the window is not ranked', async () => {
    await finished(A, 'dns-detective', 1200, 3, iso(0));
    await finished(B, 'dns-detective', 1500, 3, iso(0));
    await finished(C, 'dns-detective', 9000, 3, iso(0));
    const board = await as<{ nickname: string }>(null, `select nickname from competition_board('vjti-2026')`);
    expect(board.map((b) => b.nickname)).toEqual(['raft_raccoon', 'vjti_ace']);
  });
  it('the report card knows membership', async () => {
    const me = await one<{ member: boolean; rank: number }>(A, `select competition_me('vjti-2026')`);
    expect(me).toMatchObject({ member: true, rank: 2 });
    const other = await one<{ member: boolean; rank: number | null }>(C, `select competition_me('vjti-2026')`);
    expect(other).toMatchObject({ member: false, rank: null });
  });
});

describe('claim codes are scoped', () => {
  it('verify for this competition only', async () => {
    const ok = await one<{ valid: boolean; rank: number }>(null, `select verify_claim('vjti-2026', $1, 'VJTI_ACE', $2)`, [key, claimA]);
    expect(ok).toMatchObject({ valid: true, rank: 2 });
    const [o2] = await as<{ admin_key: string; join_code: string }>(ORG, `select * from create_competition('other-cup', 'Other', $1, $2)`, [iso(-1), iso(48)]);
    const bad = await one<{ valid: boolean; reason: string }>(null, `select verify_claim('other-cup', $1, 'vjti_ace', $2)`, [o2.admin_key, claimA]);
    expect(bad.valid).toBe(false);
    expect(bad.reason).toMatch(/did not join/);
  });
  it('a new code replaces the old one', async () => {
    const fresh = await one<string>(A, `select competition_new_claim('vjti-2026')`);
    expect((await one<{ valid: boolean }>(null, `select verify_claim('vjti-2026', $1, 'vjti_ace', $2)`, [key, claimA])).valid).toBe(false);
    expect((await one<{ valid: boolean }>(null, `select verify_claim('vjti-2026', $1, 'vjti_ace', $2)`, [key, fresh])).valid).toBe(true);
    claimA = fresh;
    await expect(as(C, `select competition_new_claim('vjti-2026')`)).rejects.toThrow(/join the competition first/);
  });
});

describe('the organiser', () => {
  it('sees the join code, members and nobody else’s scores', async () => {
    const a = await one<{ join_code: string; members: number; standings: { nickname: string }[] }>(null, `select competition_admin('vjti-2026', $1)`, [key]);
    expect(a.join_code).toBe(join);
    expect(a.members).toBe(2);
    expect(a.standings.map((s) => s.nickname)).toEqual(['raft_raccoon', 'vjti_ace']);
  });
  it('disqualifies with the key only; the player disappears from every board; data is kept', async () => {
    await expect(as(null, `select competition_disqualify('vjti-2026', 'WRONG', 'raft_raccoon', 'x')`)).rejects.toThrow(/organiser key/);
    expect(await one<{ ok: boolean }>(null, `select competition_disqualify('vjti-2026', $1, 'Raft_Raccoon', 'scripted runs')`, [key])).toMatchObject({ ok: true });
    expect((await as<{ nickname: string }>(null, `select nickname from competition_board('vjti-2026')`)).map((b) => b.nickname)).toEqual(['vjti_ace']);
    expect((await as<{ nickname: string }>(null, `select nickname from competition_board('vjti-2026', 1)`)).map((b) => b.nickname)).toEqual(['vjti_ace']);
    const a = await one<{ disqualified: { nickname: string; reason: string }[] }>(null, `select competition_admin('vjti-2026', $1)`, [key]);
    expect(a.disqualified).toEqual([expect.objectContaining({ nickname: 'raft_raccoon', reason: 'scripted runs' })]);
    expect((await owner(`select count(*)::int as n from runs where user_id = $1`, [B]))[0]).toMatchObject({ n: 1 });
    const [i] = await as<{ disqualified: boolean }>(B, `select * from competition_info('vjti-2026')`);
    expect(i.disqualified).toBe(true);
  });
  it('reinstates', async () => {
    await as(null, `select competition_reinstate('vjti-2026', $1, 'raft_raccoon')`, [key]);
    expect((await as(null, `select nickname from competition_board('vjti-2026')`)).length).toBe(2);
  });
});

describe('classes', () => {
  let cls = '';
  let claimClass = '';
  it('joining needs a nickname and returns a code for that class', async () => {
    const [c] = await as<{ code: string }>(ORG, `select * from create_class('Jetking Nashik', 'Nashik')`);
    cls = c.code;
    await expect(as(NEW, `select join_class($1)`, [cls])).rejects.toThrow(/nickname/);
    await expect(as(A, `select join_class('ZZZZZZ')`)).rejects.toThrow(/wrong class code/);
    claimClass = await one<string>(A, `select join_class($1)`, [cls.toLowerCase()]);
    expect(claimClass).toMatch(/^BTC-/);
    const [r] = await as<{ kind: string }>(null, `select * from find_join_code($1)`, [cls]);
    expect(r.kind).toBe('class');
  });
  it('the report lists members with minutes and concepts, even before they play', async () => {
    await as(A, `insert into events (type, data) values ('active', '{"s": 120}'), ('active', '{"s": 60}')`);
    await as(A, `insert into events (type, game_id, task) values ('task_done', 'traffic-cop', 1), ('task_done', 'traffic-cop', 2), ('task_done', 'traffic-cop', 2)`);
    // A second class, whose instructor key we keep (only its hash is stored).
    const [c2] = await as<{ code: string; admin_key: string }>(ORG, `select * from create_class('Seed Infotech', 'Pune')`);
    await as(A, `select join_class($1)`, [c2.code]);
    const rep = await one<{ summary: { learners: number }; learners: { name: string; minutes: number; concepts: number }[] }>(null, `select class_report($1, $2)`, [c2.code, c2.admin_key]);
    expect(rep.summary.learners).toBe(1);
    expect(rep.learners[0]).toMatchObject({ name: 'vjti_ace' });
    // Events from before joining this class do not count for it.
    expect(rep.learners[0].minutes).toBe(0);
    await as(A, `insert into events (type, data) values ('active', '{"s": 120}')`);
    const rep2 = await one<{ learners: { minutes: number }[] }>(null, `select class_report($1, $2)`, [c2.code, c2.admin_key]);
    expect(rep2.learners[0].minutes).toBe(2);
  });
  it('restore: a new phone takes over the nickname and progress with the class claim code', async () => {
    await expect(as(NEW, `select restore_progress('class', $1, 'vjti_ace', 'BTC-WRNG-CODE')`, [cls])).rejects.toThrow(/do not match/);
    expect(await one<string>(NEW, `select restore_progress('class', $1, 'VJTI_Ace', $2)`, [cls, claimClass.toLowerCase()])).toBe('vjti_ace');
    expect((await owner<{ user_id: string }>(`select user_id from profiles where nickname = 'vjti_ace'`))[0].user_id).toBe(NEW);
    expect((await owner<{ n: number }>(`select count(*)::int as n from runs where user_id = $1`, [NEW]))[0].n).toBe(1);
    expect((await owner<{ n: number }>(`select count(*)::int as n from events where user_id = $1`, [A]))[0].n).toBe(0);
    // The competition membership moved too, and its claim code still verifies.
    expect((await one<{ valid: boolean }>(null, `select verify_claim('vjti-2026', $1, 'vjti_ace', $2)`, [key, claimA])).valid).toBe(true);
    const me = await one<{ member: boolean; rank: number }>(NEW, `select competition_me('vjti-2026')`);
    expect(me.member).toBe(true);
  });
});

describe('telemetry', () => {
  it('players insert their own events; nobody reads them through the API', async () => {
    await as(C, `insert into events (type, game_id, data) values ('visit', null, '{"page":"home","device":"phone","country":"IN"}'), ('game_open', 'traffic-cop', '{}')`);
    await expect(as(C, `insert into events (user_id, type) values ($1, 'visit')`, [B])).rejects.toThrow(/permission denied/);
    await expect(as(C, `select * from events`)).rejects.toThrow(/permission denied/);
    await expect(as(null, `insert into events (type) values ('visit')`)).rejects.toThrow(/permission denied/);
    await expect(as(C, `select * from learner_summary`)).rejects.toThrow(/permission denied/);
  });
  it('rejects unknown types and oversized data; drops bad active time silently', async () => {
    await expect(as(C, `insert into events (type) values ('mine_bitcoin')`)).rejects.toThrow(/check/);
    await expect(as(C, `insert into events (type, data) values ('visit', $1)`, [JSON.stringify({ x: 'y'.repeat(2000) })])).rejects.toThrow(/check/);
    await as(C, `insert into events (type, data) values ('active', '{"s": 99999}'), ('active', '{"s": "lots"}')`);
    expect((await owner<{ n: number }>(`select count(*)::int as n from events where user_id = $1 and type = 'active'`, [C]))[0].n).toBe(0);
  });
  it('caps a player at 300 events per 10 minutes', async () => {
    await as(B, `insert into events (type) select 'visit' from generate_series(1, 320)`);
    expect((await owner<{ n: number }>(`select count(*)::int as n from events where user_id = $1`, [B]))[0].n).toBe(300);
  });
  it('the owner’s summaries add up minutes, concepts and countries', async () => {
    await as(C, `insert into events (type, data) values ('active', '{"s": 90}'), ('active', '{"s": 30}')`);
    await as(C, `insert into events (type, game_id, task, data) values ('check', 'traffic-cop', 1, '{"ok": true}'), ('check', 'traffic-cop', 2, '{"ok": false}'), ('task_done', 'traffic-cop', 1, '{}'), ('book_click', null, null, '{"where":"welcome-book"}')`);
    const [s] = await owner<{ nickname: string; active_minutes: string; concepts_learned: number; checks_answered: number; checks_right: number; book_clicked: boolean; country: string; device: string }>(`select * from learner_summary where user_id = $1`, [C]);
    expect(s).toMatchObject({ nickname: 'global_gopher', concepts_learned: 1, checks_answered: 2, checks_right: 1, book_clicked: true, country: 'IN', device: 'phone' });
    expect(Number(s.active_minutes)).toBe(2);
    const [imp] = await owner<{ learners: number; countries: number; active_hours: string }>(`select * from impact_summary`);
    expect(Number(imp.learners)).toBeGreaterThanOrEqual(3);
    expect(Number(imp.countries)).toBe(1);
    expect((await owner(`select * from impact_weekly`)).length).toBeGreaterThan(0);
  });
  it('delete my data removes events, runs, memberships and the nickname', async () => {
    expect(await one<boolean>(C, `select delete_my_data()`)).toBe(true);
    for (const t of ['events', 'runs', 'profiles', 'competition_members', 'class_members'])
      expect((await owner<{ n: number }>(`select count(*)::int as n from ${t} where user_id = $1`, [C]))[0].n).toBe(0);
  });
});
