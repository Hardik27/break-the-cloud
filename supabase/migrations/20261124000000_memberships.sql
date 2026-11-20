-- Memberships: competitions and classes are joined with a code.
--   * Global players need only a nickname: no claim code.
--   * Joining a competition or a class issues a claim code that works only for that competition or class
--     (it proves "this nickname is mine" to the organiser, and restores progress on another device).
--   * Only members are ranked on a competition board; the organiser can disqualify (and reinstate) a member.
--   * Competitions get a join code and a "featured" flag (set by the site owner in SQL; featured ones show on every home page).

-- Claim codes: BTC-XXXX-XXXX. Only an md5 fingerprint (code + scope) is stored; clients can never read it.
create or replace function public.new_claim_code() returns text
language sql volatile as $$ select 'BTC-' || public.random_code(4) || '-' || public.random_code(4) $$;
create or replace function public.claim_fingerprint(p_code text, p_scope text) returns text
language sql immutable as $$ select md5(upper(btrim(coalesce(p_code, ''))) || ':' || p_scope) $$;

-- ---------- competitions: join code, featured ----------
alter table public.competitions add column join_code text, add column featured boolean not null default false;
update public.competitions set join_code = public.random_code(6) where join_code is null;
alter table public.competitions alter column join_code set not null, add constraint competitions_join_code_key unique (join_code);

create table public.competition_members (
  comp_id text not null references public.competitions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  claim_hash text,
  claim_issued_at timestamptz,
  disqualified_at timestamptz,
  disqualified_reason text check (disqualified_reason is null or char_length(disqualified_reason) <= 200),
  primary key (comp_id, user_id)
);
create index competition_members_user on public.competition_members (user_id);
alter table public.competition_members enable row level security;
revoke all on public.competition_members from anon, authenticated;

-- ---------- classes: members ----------
create table public.class_members (
  class_code text not null references public.classes(code) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  claim_hash text,
  claim_issued_at timestamptz,
  primary key (class_code, user_id)
);
create index class_members_user on public.class_members (user_id);
alter table public.class_members enable row level security;
revoke all on public.class_members from anon, authenticated;

-- A fresh 6-character join code, unique across classes and competitions.
create or replace function public.new_join_code() returns text
language plpgsql volatile set search_path = public as $$
declare v text;
begin
  loop
    v := public.random_code(6);
    exit when not exists (select 1 from public.classes k where k.code = v)
          and not exists (select 1 from public.competitions c where c.join_code = v);
  end loop;
  return v;
end $$;

-- ---------- creating a competition now also returns its join code ----------
drop function public.create_competition(text, text, timestamptz, timestamptz);
create function public.create_competition(p_id text, p_name text, p_starts timestamptz, p_ends timestamptz)
returns table (admin_key text, join_code text)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare v_key text; v_join text; v_id text := lower(btrim(p_id));
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = 'P0001'; end if;
  if (select count(*) from public.competitions c where c.created_by = auth.uid() and c.created_at > now() - interval '1 day') >= 3 then
    raise exception 'too many competitions created today' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.competitions c where c.id = v_id) then
    raise exception 'that competition link is taken' using errcode = 'P0001';
  end if;
  v_key := public.random_code(20);
  v_join := public.new_join_code();
  insert into public.competitions (id, name, starts_at, ends_at, key_hash, join_code)
  values (v_id, btrim(p_name), p_starts, p_ends, md5(v_key || v_id), v_join);
  return query select v_key, v_join;
end $$;

-- Public info, plus whether the caller is a member (and was disqualified).
drop function public.competition_info(text);
create function public.competition_info(p_comp text)
returns table (id text, name text, starts_at timestamptz, ends_at timestamptz, members int, is_member boolean, disqualified boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.starts_at, c.ends_at,
         (select count(*)::int from public.competition_members m where m.comp_id = c.id and m.disqualified_at is null),
         exists (select 1 from public.competition_members m where m.comp_id = c.id and m.user_id = auth.uid()),
         exists (select 1 from public.competition_members m where m.comp_id = c.id and m.user_id = auth.uid() and m.disqualified_at is not null)
  from public.competitions c where c.id = lower(btrim(p_comp))
$$;

-- Home page banner: only competitions the caller joined, plus featured ones (set by the site owner).
create or replace function public.active_competitions()
returns table (id text, name text, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.starts_at, c.ends_at from public.competitions c
  where now() between c.starts_at - interval '7 days' and c.ends_at + interval '7 days'
    and (c.featured or exists (select 1 from public.competition_members m where m.comp_id = c.id and m.user_id = auth.uid()))
  order by c.starts_at limit 3
$$;

-- Which class or competition does a join code belong to? Public (you need the code to ask).
create or replace function public.find_join_code(p_code text)
returns table (kind text, id text, name text)
language sql stable security definer set search_path = public as $$
  select 'class', k.code, k.name from public.classes k where k.code = upper(btrim(p_code))
  union all
  select 'competition', c.id, c.name from public.competitions c where c.join_code = upper(btrim(p_code))
  limit 1
$$;

-- Join with the code. Needs a nickname. Returns a claim code for this competition (re-joining issues a new one).
create or replace function public.join_competition(p_comp text, p_code text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare c public.competitions; v_code text;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles where user_id = auth.uid()) then
    raise exception 'pick a nickname first' using errcode = 'P0001';
  end if;
  select * into c from public.competitions where id = lower(btrim(p_comp));
  if c.id is null or c.join_code <> upper(btrim(coalesce(p_code, ''))) then
    raise exception 'wrong competition code' using errcode = 'P0001';
  end if;
  if now() > c.ends_at then raise exception 'this competition has ended' using errcode = 'P0001'; end if;
  v_code := public.new_claim_code();
  insert into public.competition_members (comp_id, user_id, claim_hash, claim_issued_at)
  values (c.id, auth.uid(), public.claim_fingerprint(v_code, 'comp:' || c.id), now())
  on conflict (comp_id, user_id) do update set claim_hash = excluded.claim_hash, claim_issued_at = excluded.claim_issued_at;
  return v_code;
end $$;

-- A member who lost the code (same browser): a new one; the old one stops working.
create or replace function public.competition_new_claim(p_comp text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_code text; v_id text := lower(btrim(p_comp));
begin
  if not exists (select 1 from public.competition_members m where m.comp_id = v_id and m.user_id = auth.uid()) then
    raise exception 'join the competition first' using errcode = 'P0001';
  end if;
  v_code := public.new_claim_code();
  update public.competition_members set claim_hash = public.claim_fingerprint(v_code, 'comp:' || v_id), claim_issued_at = now()
  where comp_id = v_id and user_id = auth.uid();
  return v_code;
end $$;

-- Join a class (the class code is the join code). Needs a nickname. Returns a claim code for this class.
create or replace function public.join_class(p_code text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_class text := upper(btrim(coalesce(p_code, ''))); v_code text;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles where user_id = auth.uid()) then
    raise exception 'pick a nickname first' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.classes k where k.code = v_class) then
    raise exception 'wrong class code' using errcode = 'P0001';
  end if;
  v_code := public.new_claim_code();
  insert into public.class_members (class_code, user_id, claim_hash, claim_issued_at)
  values (v_class, auth.uid(), public.claim_fingerprint(v_code, 'class:' || v_class), now())
  on conflict (class_code, user_id) do update set claim_hash = excluded.claim_hash, claim_issued_at = excluded.claim_issued_at;
  return v_code;
end $$;

-- ---------- boards rank only members who are not disqualified ----------
create or replace function public.competition_best(p_comp text, p_level int default null)
returns table (user_id uuid, game_id text, level smallint, points int, stars smallint, ms int, finished_at timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (r.user_id, r.game_id) r.user_id, r.game_id, g.level, r.points, r.stars, r.ms, r.finished_at
  from public.runs r
  join public.competitions c on c.id = lower(btrim(p_comp))
  join public.competition_members m on m.comp_id = c.id and m.user_id = r.user_id and m.disqualified_at is null
  join public.game_levels g on g.game_id = r.game_id
  join public.profiles p on p.user_id = r.user_id
  where r.status = 'finished' and r.finished_at between c.starts_at and c.ends_at
    and (p_level is null or g.level = p_level)
  order by r.user_id, r.game_id, r.points desc, r.finished_at asc
$$;

create or replace function public.competition_me(p_comp text)
returns jsonb
language sql stable security definer set search_path = public as $$
  with mem as (select * from public.competition_members m where m.comp_id = lower(btrim(p_comp)) and m.user_id = auth.uid()),
  mine as (select * from public.competition_best(p_comp) where user_id = auth.uid()),
  overall as (select * from public.competition_board(p_comp, null, 500) where is_me),
  total as (select count(distinct user_id) as n from public.competition_best(p_comp))
  select jsonb_build_object(
    'nickname', (select nickname from public.profiles where user_id = auth.uid()),
    'member', exists (select 1 from mem),
    'disqualified', exists (select 1 from mem where disqualified_at is not null),
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
create or replace function public.competition_admin(p_comp text, p_key text, p_top int default 20)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c public.competitions;
begin
  c := public.competition_check_key(p_comp, p_key);
  return jsonb_build_object(
    'competition', jsonb_build_object('id', c.id, 'name', c.name, 'starts_at', c.starts_at, 'ends_at', c.ends_at),
    'join_code', c.join_code,
    'members', (select count(*) from public.competition_members m where m.comp_id = c.id and m.disqualified_at is null),
    'players', (select count(distinct user_id) from public.competition_best(c.id)),
    'standings', coalesce((select jsonb_agg(to_jsonb(b) - 'is_me' order by b.rank) from public.competition_board(c.id, null, 500) b), '[]'::jsonb),
    'level_winners', coalesce((
      select jsonb_agg(jsonb_build_object('level', l, 'winner', (select b.nickname from public.competition_board(c.id, l, 1) b limit 1),
                                          'points', (select b.points from public.competition_board(c.id, l, 1) b limit 1)) order by l)
      from generate_series(1, 8) l), '[]'::jsonb),
    'disqualified', coalesce((
      select jsonb_agg(jsonb_build_object('nickname', p.nickname, 'reason', m.disqualified_reason, 'at', m.disqualified_at) order by m.disqualified_at)
      from public.competition_members m join public.profiles p on p.user_id = m.user_id
      where m.comp_id = c.id and m.disqualified_at is not null), '[]'::jsonb),
    'finalists', coalesce((
      select jsonb_agg(jsonb_build_object('nickname', f.nickname, 'rank', f.rank, 'runs', (
        select jsonb_agg(jsonb_build_object('game_id', r.game_id, 'points', r.points, 'ms', r.ms, 'mistakes', r.mistakes, 'task_ms', r.task_ms, 'finished_at', r.finished_at) order by r.game_id)
        from (select distinct on (r.game_id) r.* from public.runs r join public.profiles p on p.user_id = r.user_id
              where p.nickname = f.nickname and r.status = 'finished' and r.finished_at between c.starts_at and c.ends_at
              order by r.game_id, r.points desc, r.finished_at asc) r)) order by f.rank)
      from (select * from public.competition_board(c.id, null, least(greatest(coalesce(p_top, 20), 1), 100))) f), '[]'::jsonb));
end $$;

-- Disqualify (hide from every board of this competition) or reinstate a member. Organiser only. Their data is kept.
create or replace function public.competition_disqualify(p_comp text, p_key text, p_nickname text, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare c public.competitions; v_user uuid;
begin
  c := public.competition_check_key(p_comp, p_key);
  select p.user_id into v_user from public.profiles p where lower(p.nickname) = lower(btrim(p_nickname));
  update public.competition_members set disqualified_at = now(), disqualified_reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 200)
  where comp_id = c.id and user_id = v_user;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no member with that nickname'); end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.competition_reinstate(p_comp text, p_key text, p_nickname text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare c public.competitions; v_user uuid;
begin
  c := public.competition_check_key(p_comp, p_key);
  select p.user_id into v_user from public.profiles p where lower(p.nickname) = lower(btrim(p_nickname));
  update public.competition_members set disqualified_at = null, disqualified_reason = null where comp_id = c.id and user_id = v_user;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no member with that nickname'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Is this the right claim code for this nickname in this competition? Organiser only.
create or replace function public.verify_claim(p_comp text, p_key text, p_nickname text, p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c public.competitions;
  p public.profiles;
  m public.competition_members;
  b record;
begin
  c := public.competition_check_key(p_comp, p_key);
  select * into p from public.profiles where lower(nickname) = lower(btrim(p_nickname));
  if p.user_id is null then return jsonb_build_object('valid', false, 'reason', 'no player with that nickname'); end if;
  select * into m from public.competition_members where comp_id = c.id and user_id = p.user_id;
  if m.user_id is null then return jsonb_build_object('valid', false, 'reason', 'this nickname did not join this competition'); end if;
  if m.claim_hash is null or m.claim_hash <> public.claim_fingerprint(p_code, 'comp:' || c.id) then
    return jsonb_build_object('valid', false, 'reason', 'the claim code does not match this nickname');
  end if;
  if m.disqualified_at is not null then
    return jsonb_build_object('valid', false, 'reason', 'this player was disqualified' || coalesce(': ' || m.disqualified_reason, ''));
  end if;
  select * into b from public.competition_board(c.id, null, 500) x where x.nickname = p.nickname;
  return jsonb_build_object('valid', true, 'nickname', p.nickname, 'rank', b.rank, 'points', b.points, 'games', b.games, 'code_issued_at', m.claim_issued_at);
end $$;

-- ---------- global claim codes are retired (only competitions and classes have them now) ----------
drop function if exists public.issue_claim_code();
alter table public.profiles drop column if exists claim_hash, drop column if exists claim_issued_at;

-- ---------- permissions ----------
revoke execute on function public.new_claim_code(), public.claim_fingerprint(text, text), public.new_join_code(),
  public.create_competition(text, text, timestamptz, timestamptz), public.competition_info(text), public.find_join_code(text),
  public.join_competition(text, text), public.competition_new_claim(text), public.join_class(text),
  public.competition_disqualify(text, text, text, text), public.competition_reinstate(text, text, text) from public;
grant execute on function public.create_competition(text, text, timestamptz, timestamptz), public.join_competition(text, text),
  public.competition_new_claim(text), public.join_class(text) to authenticated;
grant execute on function public.competition_info(text), public.find_join_code(text),
  public.competition_disqualify(text, text, text, text), public.competition_reinstate(text, text, text) to anon, authenticated;
