-- Competitions (e.g. a college event with prizes), without collecting personal information.
--   * A player picks a nickname and gets a secret claim code (shown once; only a hash is stored).
--   * A competition has a start and end; only runs finished inside the window count.
--   * Boards: per game (existing), per level and overall = sum of best scores per game.
--   * The organiser (secret key, like a class) sees final standings, finalists' runs, and verifies a winner's claim code.

-- ---------- game → level (keep in sync with src/games/registry.ts; a unit test checks it) ----------
create table public.game_levels (game_id text primary key, level smallint not null check (level between 1 and 8));
insert into public.game_levels values
  ('dns-detective', 1), ('handshake', 1), ('latency-budget', 1),
  ('traffic-cop', 2), ('heartbeat', 2), ('rate-limiter', 2),
  ('cache-hit', 3), ('replica-diff', 3), ('thundering-herd', 3),
  ('the-ring', 4), ('autoscaler', 4), ('backpressure', 4),
  ('retry-storm', 5), ('circuit-breaker', 5), ('blast-radius', 5),
  ('partition', 6), ('quorum', 6), ('clock-skew', 6),
  ('split-brain', 7), ('two-phase-commit', 7), ('saga', 7),
  ('gossip', 8), ('byzantine-generals', 8), ('crdt-merge', 8);
alter table public.game_levels enable row level security;
revoke all on public.game_levels from anon, authenticated;
grant select on public.game_levels to anon, authenticated;
create policy game_levels_read on public.game_levels for select using (true);

-- ---------- claim codes ----------
alter table public.profiles add column claim_hash text, add column claim_issued_at timestamptz;
-- Clients may still only write user_id and nickname (column grants from the leaderboard migration),
-- and may read only the public columns: never the claim hash.
revoke select on public.profiles from anon, authenticated;
grant select (user_id, nickname, created_at) on public.profiles to anon, authenticated;

-- Issue (or re-issue) the caller's claim code. Needs a nickname. Re-issuing replaces the old code.
create or replace function public.issue_claim_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_code text;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles where user_id = auth.uid()) then
    raise exception 'pick a nickname first' using errcode = 'P0001';
  end if;
  v_code := 'BTC-' || public.random_code(4) || '-' || public.random_code(4);
  update public.profiles set claim_hash = md5(v_code || user_id::text), claim_issued_at = now() where user_id = auth.uid();
  return v_code;
end $$;

-- ---------- competitions ----------
create table public.competitions (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  name text not null check (char_length(btrim(name)) between 3 and 80),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  key_hash text not null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
alter table public.competitions enable row level security;
revoke all on public.competitions from anon, authenticated;

create or replace function public.create_competition(p_id text, p_name text, p_starts timestamptz, p_ends timestamptz)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_key text;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = 'P0001'; end if;
  if (select count(*) from public.competitions c where c.created_by = auth.uid() and c.created_at > now() - interval '1 day') >= 3 then
    raise exception 'too many competitions created today' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.competitions c where c.id = lower(btrim(p_id))) then
    raise exception 'that competition link is taken' using errcode = 'P0001';
  end if;
  v_key := public.random_code(20);
  insert into public.competitions (id, name, starts_at, ends_at, key_hash)
  values (lower(btrim(p_id)), btrim(p_name), p_starts, p_ends, md5(v_key || lower(btrim(p_id))));
  return v_key;
end $$;

-- Public: name and window of a competition, and the ones running now (for the home page banner).
create or replace function public.competition_info(p_comp text)
returns table (id text, name text, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.starts_at, c.ends_at from public.competitions c where c.id = lower(btrim(p_comp))
$$;
create or replace function public.active_competitions()
returns table (id text, name text, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.starts_at, c.ends_at from public.competitions c
  where now() between c.starts_at - interval '7 days' and c.ends_at + interval '7 days'
  order by c.starts_at limit 3
$$;

-- Best run per player per game inside the window, for players with a nickname. Internal.
create or replace function public.competition_best(p_comp text, p_level int default null)
returns table (user_id uuid, game_id text, level smallint, points int, stars smallint, ms int, finished_at timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (r.user_id, r.game_id) r.user_id, r.game_id, g.level, r.points, r.stars, r.ms, r.finished_at
  from public.runs r
  join public.competitions c on c.id = lower(btrim(p_comp))
  join public.game_levels g on g.game_id = r.game_id
  join public.profiles p on p.user_id = r.user_id
  where r.status = 'finished' and r.finished_at between c.starts_at and c.ends_at
    and (p_level is null or g.level = p_level)
  order by r.user_id, r.game_id, r.points desc, r.finished_at asc
$$;

-- Overall (p_level null) or one level. Ties: more points, then more stars, then whoever got there first.
create or replace function public.competition_board(p_comp text, p_level int default null, p_limit int default 50)
returns table (rank bigint, nickname text, points int, games int, stars int, reached_at timestamptz, is_me boolean)
language sql stable security definer set search_path = public as $$
  with tot as (
    select b.user_id, sum(b.points)::int as points, count(*)::int as games, sum(b.stars)::int as stars, max(b.finished_at) as reached_at
    from public.competition_best(p_comp, p_level) b group by b.user_id
  )
  select rank() over (order by t.points desc, t.stars desc, t.reached_at asc), p.nickname, t.points, t.games, t.stars, t.reached_at,
         coalesce(t.user_id = auth.uid(), false)
  from tot t join public.profiles p on p.user_id = t.user_id
  order by 1, p.nickname
  limit least(greatest(coalesce(p_limit, 50), 1), 500)
$$;

-- The caller's report card: rank overall and per level, best score per game.
create or replace function public.competition_me(p_comp text)
returns jsonb
language sql stable security definer set search_path = public as $$
  with mine as (select * from public.competition_best(p_comp) where user_id = auth.uid()),
  overall as (select * from public.competition_board(p_comp, null, 500) where is_me),
  total as (select count(distinct user_id) as n from public.competition_best(p_comp))
  select jsonb_build_object(
    'nickname', (select nickname from public.profiles where user_id = auth.uid()),
    'rank', (select rank from overall),
    'of', (select n from total),
    'points', coalesce((select points from overall), 0),
    'stars', coalesce((select stars from overall), 0),
    'games', coalesce((select games from overall), 0),
    'per_game', coalesce((select jsonb_agg(jsonb_build_object('game_id', game_id, 'level', level, 'points', points, 'stars', stars) order by level, game_id) from mine), '[]'::jsonb),
    'per_level', coalesce((
      select jsonb_agg(jsonb_build_object('level', l.level, 'points', l.points,
        'rank', (select b.rank from public.competition_board(p_comp, l.level, 500) b where b.is_me)) order by l.level)
      from (select level, sum(points)::int as points from mine group by level) l), '[]'::jsonb))
$$;

-- ---------- organiser ----------
create or replace function public.competition_check_key(p_comp text, p_key text) returns public.competitions
language plpgsql stable security definer set search_path = public as $$
declare c public.competitions;
begin
  select * into c from public.competitions where id = lower(btrim(p_comp));
  if c.id is null or c.key_hash <> md5(coalesce(p_key, '') || c.id) then
    raise exception 'wrong competition link or organiser key' using errcode = 'P0001';
  end if;
  return c;
end $$;

-- Final standings plus each finalist's best runs (task times, mistakes) for a fairness review.
create or replace function public.competition_admin(p_comp text, p_key text, p_top int default 20)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c public.competitions;
begin
  c := public.competition_check_key(p_comp, p_key);
  return jsonb_build_object(
    'competition', jsonb_build_object('id', c.id, 'name', c.name, 'starts_at', c.starts_at, 'ends_at', c.ends_at),
    'players', (select count(distinct user_id) from public.competition_best(c.id)),
    'standings', coalesce((select jsonb_agg(to_jsonb(b) - 'is_me' order by b.rank) from public.competition_board(c.id, null, 500) b), '[]'::jsonb),
    'level_winners', coalesce((
      select jsonb_agg(jsonb_build_object('level', l, 'winner', (select b.nickname from public.competition_board(c.id, l, 1) b limit 1),
                                          'points', (select b.points from public.competition_board(c.id, l, 1) b limit 1)) order by l)
      from generate_series(1, 8) l), '[]'::jsonb),
    'finalists', coalesce((
      select jsonb_agg(jsonb_build_object('nickname', f.nickname, 'rank', f.rank, 'runs', (
        select jsonb_agg(jsonb_build_object('game_id', r.game_id, 'points', r.points, 'ms', r.ms, 'mistakes', r.mistakes, 'task_ms', r.task_ms, 'finished_at', r.finished_at) order by r.game_id)
        from (select distinct on (r.game_id) r.* from public.runs r join public.profiles p on p.user_id = r.user_id
              where p.nickname = f.nickname and r.status = 'finished' and r.finished_at between c.starts_at and c.ends_at
              order by r.game_id, r.points desc, r.finished_at asc) r)) order by f.rank)
      from (select * from public.competition_board(c.id, null, least(greatest(coalesce(p_top, 20), 1), 100))) f), '[]'::jsonb));
end $$;

-- Is this the right claim code for this nickname? Organiser only. Returns the player's standing.
create or replace function public.verify_claim(p_comp text, p_key text, p_nickname text, p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c public.competitions;
  p public.profiles;
  b record;
begin
  c := public.competition_check_key(p_comp, p_key);
  select * into p from public.profiles where lower(nickname) = lower(btrim(p_nickname));
  if p.user_id is null then return jsonb_build_object('valid', false, 'reason', 'no player with that nickname'); end if;
  if p.claim_hash is null or p.claim_hash <> md5(upper(btrim(p_code)) || p.user_id::text) then
    return jsonb_build_object('valid', false, 'reason', 'the claim code does not match this nickname');
  end if;
  select * into b from public.competition_board(c.id, null, 500) x where x.nickname = p.nickname;
  return jsonb_build_object('valid', true, 'nickname', p.nickname, 'rank', b.rank, 'points', b.points, 'games', b.games, 'code_issued_at', p.claim_issued_at);
end $$;

revoke execute on function public.issue_claim_code(), public.create_competition(text, text, timestamptz, timestamptz),
  public.competition_info(text), public.active_competitions(), public.competition_best(text, int), public.competition_board(text, int, int),
  public.competition_me(text), public.competition_check_key(text, text), public.competition_admin(text, text, int),
  public.verify_claim(text, text, text, text) from public;
grant execute on function public.issue_claim_code(), public.create_competition(text, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.competition_info(text), public.active_competitions(), public.competition_board(text, int, int),
  public.competition_me(text), public.competition_admin(text, text, int), public.verify_claim(text, text, text, text) to anon, authenticated;
