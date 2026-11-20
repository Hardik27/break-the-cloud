/** Competitions, claim codes and level/overall boards: the real migrations in PGlite. */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { GAMES } from '../../src/games/registry';

const ORG = '00000000-0000-0000-0000-0000000000d0';
const P1 = '00000000-0000-0000-0000-0000000000d1';
const P2 = '00000000-0000-0000-0000-0000000000d2';
const P3 = '00000000-0000-0000-0000-0000000000d3'; // no nickname
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
const admin = async <R = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<R>(sql, params)).rows;

/** A finished run at a given time (what the Edge Function would record). */
async function finished(uid: string, game: string, points: number, stars: number, at: string) {
  await as(uid, `insert into runs (game_id) values ($1)`, [game]);
  await admin(`update runs set status = 'finished', points = $3, stars = $4, ms = 60000, mistakes = 1, task_ms = '{0,10000}', finished_at = $5
               where id = (select id from runs where user_id = $1 and game_id = $2 and status = 'started' order by started_at desc limit 1)`, [uid, game, points, stars, at]);
}

let key = '';
let code1 = '';

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${ORG}'), ('${P1}'), ('${P2}'), ('${P3}');`);
  for (const f of ['20261118000000_leaderboard', '20261120000000_classes', '20261121000000_class_leaderboard', '20261122000000_competitions'])
    await db.exec(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'));
}, 60_000);

describe('game levels', () => {
  it('match the registry', async () => {
    const rows = await admin<{ game_id: string; level: number }>(`select game_id, level from game_levels`);
    expect(Object.fromEntries(rows.map((r) => [r.game_id, Number(r.level)]))).toEqual(Object.fromEntries(GAMES.map((g) => [g.id, g.level])));
  });
});

describe('claim codes', () => {
  it('need a nickname first', async () => {
    await expect(as(P1, `select issue_claim_code()`)).rejects.toThrow(/nickname/);
  });
  it('are issued once a nickname exists, and only a hash is stored', async () => {
    await as(P1, `insert into profiles (user_id, nickname) values ($1, 'packet_panda')`, [P1]);
    await as(P2, `insert into profiles (user_id, nickname) values ($1, 'raft_raccoon')`, [P2]);
    const [{ issue_claim_code: c }] = await as<{ issue_claim_code: string }>(P1, `select issue_claim_code()`);
    expect(c).toMatch(/^BTC-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    code1 = c;
    const [p] = await admin<{ claim_hash: string }>(`select claim_hash from profiles where user_id = $1`, [P1]);
    expect(p.claim_hash).not.toContain(c);
  });
  it('nobody can read claim hashes', async () => {
    await expect(as(P2, `select claim_hash from profiles`)).rejects.toThrow(/permission denied/);
    expect((await as(null, `select nickname from profiles`)).length).toBe(2);
  });
});

describe('a competition', () => {
  it('an organiser creates one and gets a secret key; links are unique', async () => {
    const [{ create_competition: k }] = await as<{ create_competition: string }>(ORG, `select create_competition('vjti-2026', 'VJTI Break the Cloud Cup', '2026-12-01T00:00:00Z', '2026-12-15T23:59:59Z')`);
    expect(k).toHaveLength(20);
    key = k;
    await expect(as(ORG, `select create_competition('vjti-2026', 'Again', '2026-12-01', '2026-12-02')`)).rejects.toThrow(/taken/);
    await expect(as(null, `select create_competition('x-anon', 'Anon', '2026-12-01', '2026-12-02')`)).rejects.toThrow();
  });
  it('counts only best scores inside the window, only for players with a nickname', async () => {
    await finished(P1, 'dns-detective', 900, 2, '2026-11-30T10:00:00Z'); // before: ignored
    await finished(P1, 'dns-detective', 1200, 3, '2026-12-02T10:00:00Z');
    await finished(P1, 'dns-detective', 1000, 2, '2026-12-03T10:00:00Z'); // worse: ignored
    await finished(P1, 'traffic-cop', 800, 2, '2026-12-04T10:00:00Z');
    await finished(P2, 'dns-detective', 1500, 3, '2026-12-05T10:00:00Z');
    await finished(P2, 'gossip', 400, 1, '2026-12-16T10:00:00Z'); // after: ignored
    await finished(P3, 'dns-detective', 5000, 3, '2026-12-05T10:00:00Z'); // no nickname: never ranked
    const board = await as<{ rank: number; nickname: string; points: number; games: number }>(null, `select * from competition_board('vjti-2026')`);
    expect(board.map((b) => [Number(b.rank), b.nickname, b.points, b.games])).toEqual([[1, 'packet_panda', 2000, 2], [2, 'raft_raccoon', 1500, 1]]);
  });
  it('a level board sums only that level’s games', async () => {
    const l1 = await as<{ nickname: string; points: number }>(null, `select * from competition_board('vjti-2026', 1)`);
    expect(l1.map((b) => [b.nickname, b.points])).toEqual([['raft_raccoon', 1500], ['packet_panda', 1200]]);
  });
  it('ties go to more stars, then to whoever got there first', async () => {
    await finished(P2, 'heartbeat', 500, 1, '2026-12-06T10:00:00Z'); // P2: 2000 points, 4 stars; P1: 2000 points, 5 stars
    const b = await as<{ nickname: string; points: number }>(null, `select * from competition_board('vjti-2026')`);
    expect(b.map((x) => x.nickname)).toEqual(['packet_panda', 'raft_raccoon']);
  });
  it('a player’s report card has their rank overall and per level', async () => {
    const [{ competition_me: me }] = await as<{ competition_me: { rank: number; of: number; points: number; per_level: { level: number; rank: number }[]; per_game: unknown[] } }>(P1, `select competition_me('vjti-2026')`);
    expect(me).toMatchObject({ rank: 1, of: 2, points: 2000 });
    expect(me.per_game).toHaveLength(2);
    expect(me.per_level.find((l) => l.level === 1)!.rank).toBe(2);
  });
});

describe('the organiser', () => {
  it('needs the key', async () => {
    await expect(as(null, `select competition_admin('vjti-2026', 'WRONG')`)).rejects.toThrow(/organiser key/);
  });
  it('sees standings, level winners and finalists’ runs', async () => {
    const [{ competition_admin: a }] = await as<{ competition_admin: { players: number; standings: { nickname: string }[]; level_winners: { level: number; winner: string | null }[]; finalists: { nickname: string; runs: { task_ms: number[] }[] }[] } }>(null, `select competition_admin('vjti-2026', $1)`, [key]);
    expect(a.players).toBe(2);
    expect(a.standings[0].nickname).toBe('packet_panda');
    expect(a.level_winners.find((l) => l.level === 1)!.winner).toBe('raft_raccoon');
    expect(a.finalists[0].runs[0].task_ms).toEqual([0, 10000]);
  });
  it('verifies a winner’s claim code, and rejects a wrong one', async () => {
    const [{ verify_claim: ok }] = await as<{ verify_claim: { valid: boolean; rank: number } }>(null, `select verify_claim('vjti-2026', $1, 'Packet_Panda', $2)`, [key, code1.toLowerCase()]);
    expect(ok).toMatchObject({ valid: true, rank: 1 });
    const [{ verify_claim: bad }] = await as<{ verify_claim: { valid: boolean } }>(null, `select verify_claim('vjti-2026', $1, 'raft_raccoon', $2)`, [key, code1]);
    expect(bad.valid).toBe(false);
  });
  it('re-issuing a code invalidates the old one', async () => {
    await as(P1, `select issue_claim_code()`);
    const [{ verify_claim: old }] = await as<{ verify_claim: { valid: boolean } }>(null, `select verify_claim('vjti-2026', $1, 'packet_panda', $2)`, [key, code1]);
    expect(old.valid).toBe(false);
  });
});
