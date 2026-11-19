/**
 * Class codes: the classes migration on top of the leaderboard migration, in PGlite.
 * Instructors create a class (join code + secret key); learners tag runs with the code; the report needs the key.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const T = '00000000-0000-0000-0000-0000000000a1'; // instructor
const L1 = '00000000-0000-0000-0000-0000000000b1';
const L2 = '00000000-0000-0000-0000-0000000000b2';
const X = '00000000-0000-0000-0000-0000000000c1'; // someone else
let db: PGlite;

const STUB = `
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  insert into auth.users values ('${T}'), ('${L1}'), ('${L2}'), ('${X}');
`;
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
const admin = async <R = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<R>(sql, params)).rows;

let code = '';
let key = '';

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(readFileSync('supabase/migrations/20261118000000_leaderboard.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261120000000_classes.sql', 'utf8'));
}, 60_000);

describe('creating a class', () => {
  it('an instructor gets a 6-character join code and a secret key', async () => {
    const [r] = await as<{ code: string; admin_key: string }>(T, `select * from create_class('Jetking Nashik', 'Nashik', 'Cloud & DevOps batch 3')`);
    expect(r.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(r.admin_key).toHaveLength(20);
    code = r.code;
    key = r.admin_key;
  });
  it('only a hash of the key is stored', async () => {
    const [c] = await admin<{ key_hash: string }>(`select key_hash from classes where code = $1`, [code]);
    expect(c.key_hash).not.toContain(key);
  });
  it('anonymous visitors cannot create classes, and nobody reads the table directly', async () => {
    await expect(as(null, `select * from create_class('x school', 'Pune')`)).rejects.toThrow();
    await expect(as(X, `select * from classes`)).rejects.toThrow(/permission denied/);
  });
  it('rejects bad names', async () => {
    await expect(as(T, `select * from create_class('x', 'Pune')`)).rejects.toThrow();
  });
  it('class_info shows the name and city to anyone with the code', async () => {
    const [r] = await as<{ name: string; city: string }>(null, `select * from class_info($1)`, [code.toLowerCase()]);
    expect(r).toMatchObject({ name: 'Jetking Nashik', city: 'Nashik' });
  });
});

describe('learners and the report', () => {
  it('learners tag their runs with the class code; an unknown code is refused', async () => {
    await as(L1, `insert into runs (game_id, class_code) values ('cache-hit', $1)`, [code]);
    await as(L2, `insert into runs (game_id, class_code) values ('cache-hit', $1)`, [code]);
    await as(L2, `insert into runs (game_id, class_code) values ('gossip', $1)`, [code]);
    await as(X, `insert into runs (game_id) values ('cache-hit')`);
    await expect(as(L1, `insert into runs (game_id, class_code) values ('cache-hit', 'ZZZZZZ')`)).rejects.toThrow();
    // The server (Edge Function, service role) finishes runs.
    await admin(`update runs set status = 'finished', points = 1200, stars = 2, ms = 60000 where user_id = $1 and game_id = 'cache-hit'`, [L1]);
    await admin(`update runs set status = 'finished', points = 900, stars = 1, ms = 80000 where user_id = $1 and game_id = 'cache-hit'`, [L2]);
    await as(L1, `insert into profiles (user_id, nickname) values ($1, 'riya_k')`, [L1]);
  });
  it('the report needs the instructor key', async () => {
    await expect(as(null, `select class_report($1, 'WRONGKEY')`, [code])).rejects.toThrow(/wrong class code or instructor key/);
  });
  it('the report counts learners, runs and per-game results for this class only', async () => {
    const [{ class_report: r }] = await as<{ class_report: { summary: Record<string, number>; games: { game_id: string; learners_started: number; learners_finished: number; avg_points: number }[]; learners: { name: string; points: number; games_finished: number }[] } }>(null, `select class_report($1, $2)`, [code, key]);
    expect(r.summary.learners).toBe(2);
    expect(r.summary.runs_started).toBe(3);
    expect(r.summary.runs_finished).toBe(2);
    const ch = r.games.find((g) => g.game_id === 'cache-hit')!;
    expect(ch).toMatchObject({ learners_started: 2, learners_finished: 2, avg_points: 1050 });
    expect(r.learners[0]).toMatchObject({ name: 'riya_k', points: 1200, games_finished: 1 });
    expect(r.learners[1].name).toMatch(/^learner-[0-9a-f]{4}$/);
  });
  it('a learner who deletes their data disappears from the report', async () => {
    await as(L2, `delete from runs where user_id = $1`, [L2]);
    const [{ class_report: r }] = await as<{ class_report: { summary: { learners: number } } }>(null, `select class_report($1, $2)`, [code, key]);
    expect(r.summary.learners).toBe(1);
  });
});
