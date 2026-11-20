/**
 * Tests the real leaderboard migration (tables, RLS, grants, functions) in PGlite, an in-process Postgres.
 * Supabase's auth schema is replaced by a minimal stand-in: auth.users and auth.uid().
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
let db: PGlite;

const SUPABASE_STUB = `
  create role anon nologin; create role authenticated nologin;
  -- Like newer Supabase projects: service_role bypasses RLS but has no table privileges unless granted.
  create role service_role nologin bypassrls;
  grant usage on schema public to service_role;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  insert into auth.users values ('${A}'), ('${B}');
`;

/** Run SQL as a player (or as anon when uid is null). */
async function as<T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}
/** Run SQL as the service role (what the Edge Function uses: bypasses RLS). */
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(readFileSync('supabase/migrations/20261118000000_leaderboard.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261120000000_classes.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261121000000_class_leaderboard.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261123000000_service_role_grants.sql', 'utf8'));
}, 60_000);

describe('runs: clients can start runs but never set times or points', () => {
  it('a player starts a run; the server sets user, status and start time', async () => {
    const [r] = await as<{ id: string; user_id: string; status: string }>(A, `insert into runs (game_id, client_version) values ('traffic-cop', 'web-1') returning id, user_id, status`);
    expect(r.user_id).toBe(A);
    expect(r.status).toBe('started');
  });
  it('a player cannot choose the start time, status or points', async () => {
    await expect(as(A, `insert into runs (game_id, started_at) values ('traffic-cop', now() - interval '1 hour')`)).rejects.toThrow(/permission denied/);
    await expect(as(A, `insert into runs (game_id, points) values ('traffic-cop', 99999)`)).rejects.toThrow(/permission denied/);
    await expect(as(A, `insert into runs (game_id, status) values ('traffic-cop', 'finished')`)).rejects.toThrow(/permission denied/);
  });
  it('a player cannot create a run for someone else', async () => {
    await expect(as(A, `insert into runs (game_id, user_id) values ('traffic-cop', '${B}')`)).rejects.toThrow(/permission denied/);
  });
  it('nobody can update a run from the client', async () => {
    await expect(as(A, `update runs set points = 99999, status = 'finished'`)).rejects.toThrow(/permission denied/);
  });
  it('anonymous visitors cannot start runs', async () => {
    await expect(as(null, `insert into runs (game_id) values ('traffic-cop')`)).rejects.toThrow(/permission denied/);
  });
});

describe('reading and ranking', () => {
  it('others see only finished runs; the owner sees their own started run', async () => {
    const before = await as(B, `select id from runs where user_id = '${A}'`);
    expect(before).toHaveLength(0);
    expect((await as(A, `select id from runs where user_id = '${A}'`)).length).toBe(1);
  });
  it('after the Edge Function finishes runs, the leaderboard ranks best scores and hides user ids', async () => {
    // The service role finishes A's run, and a run for B.
    await admin(`update runs set status = 'finished', finished_at = now(), ms = 60000, points = 2100, stars = 3 where user_id = '${A}'`);
    await admin(`insert into runs (user_id, game_id) values ('${B}', 'traffic-cop')`);
    await admin(`update runs set status = 'finished', finished_at = now(), ms = 70000, points = 1500, stars = 2 where user_id = '${B}'`);
    await as(A, `insert into profiles (user_id, nickname) values ('${A}', 'packet_pusher')`);

    const anonView = await as<{ rank: number; nickname: string; points: number; is_me: boolean }>(null, `select * from leaderboard('traffic-cop')`);
    expect(anonView.map((r) => [Number(r.rank), r.nickname, r.points, r.is_me])).toEqual([
      [1, 'packet_pusher', 2100, false],
      [2, 'anonymous', 1500, false],
    ]);
    expect(Object.keys(anonView[0])).not.toContain('user_id');
    const asA = await as<{ is_me: boolean }>(A, `select * from leaderboard('traffic-cop')`);
    expect(asA[0].is_me).toBe(true);
    const mine = await as<{ rank: number; total: number }>(B, `select * from my_rank('traffic-cop')`);
    expect([Number(mine[0].rank), Number(mine[0].total)]).toEqual([2, 2]);
    const counts = await as<{ game_id: string; started: number; finished: number }>(null, `select * from play_counts()`);
    expect(counts.map((c) => [c.game_id, Number(c.started), Number(c.finished)])).toEqual([['traffic-cop', 2, 2]]);
    const weekly = await as(null, `select * from leaderboard('traffic-cop', now() + interval '1 day')`);
    expect(weekly).toHaveLength(0);
  });
  it('the scores view keeps each player’s best run per game', async () => {
    await admin(`insert into runs (user_id, game_id, status, finished_at, ms, points, stars) values ('${A}', 'traffic-cop', 'finished', now(), 50000, 1800, 2)`);
    const rows = await as<{ points: number }>(null, `select points from scores where game_id = 'traffic-cop' order by points desc`);
    expect(rows.map((r) => r.points)).toEqual([2100, 1500]);
  });
});

describe('nicknames', () => {
  it.each(['ab', 'a'.repeat(21), 'visit evil.com', 'www dot', 'FuCk_you', '<script>', 'admin'])('rejects %j', async (n) => {
    await expect(as(B, `insert into profiles (user_id, nickname) values ($1, $2)`, [B, n])).rejects.toThrow();
  });
  it('rejects a nickname someone already has (case-insensitive)', async () => {
    await expect(as(B, `insert into profiles (user_id, nickname) values ($1, 'PACKET_PUSHER')`, [B])).rejects.toThrow(/duplicate|unique/);
  });
  it('accepts a normal nickname, and upsert can change it', async () => {
    await as(B, `insert into profiles (user_id, nickname) values ($1, 'raft raccoon')`, [B]);
    await as(B, `insert into profiles (user_id, nickname) values ($1, 'raft_raccoon2') on conflict (user_id) do update set user_id = excluded.user_id, nickname = excluded.nickname`, [B]);
    expect((await admin<{ nickname: string }>(`select nickname from profiles where user_id = '${B}'`))[0].nickname).toBe('raft_raccoon2');
  });
  it('a player cannot change someone else’s nickname', async () => {
    const r = await as(B, `update profiles set nickname = 'hacked' where user_id = '${A}' returning user_id`);
    expect(r).toHaveLength(0);
    expect((await admin<{ nickname: string }>(`select nickname from profiles where user_id = '${A}'`))[0].nickname).toBe('packet_pusher');
  });
});

describe('abuse and deletion', () => {
  it('limits runs started per player per 10 minutes', async () => {
    const id = '00000000-0000-0000-0000-0000000000cc';
    await admin(`insert into auth.users values ('${id}')`);
    for (let i = 0; i < 30; i++) await as(id, `insert into runs (game_id) values ('split-brain')`);
    await expect(as(id, `insert into runs (game_id) values ('split-brain')`)).rejects.toThrow(/too many runs/);
  });
  it('Delete my data removes only your own runs and nickname', async () => {
    const del = await as(B, `delete from runs where user_id = '${A}' returning id`);
    expect(del).toHaveLength(0);
    await as(A, `delete from runs where user_id = '${A}'`);
    await as(A, `delete from profiles where user_id = '${A}'`);
    expect(await admin(`select id from runs where user_id = '${A}'`)).toHaveLength(0);
    expect(await admin(`select 1 from profiles where user_id = '${A}'`)).toHaveLength(0);
    expect((await admin(`select id from runs where user_id = '${B}'`)).length).toBeGreaterThan(0);
  });
});

describe('service role (the finish-run Edge Function)', () => {
  it('can read a started run and record its result', async () => {
    const [r] = await as<{ id: string }>(A, `insert into runs (game_id, client_version) values ('heartbeat', 'web-1') returning id`);
    await db.exec('set role service_role');
    try {
      const rows = (await db.query<{ status: string }>(`select id, user_id, game_id, status, started_at from runs where id = $1`, [r.id])).rows;
      expect(rows[0].status).toBe('started');
      const up = await db.query(`update runs set status = 'finished', finished_at = now(), ms = 20000, points = 900, stars = 3 where id = $1 and status = 'started'`, [r.id]);
      expect(up.affectedRows).toBe(1);
    } finally {
      await db.exec('reset role');
    }
  });
});
