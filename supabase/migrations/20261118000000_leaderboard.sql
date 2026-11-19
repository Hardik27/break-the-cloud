-- Break the Cloud leaderboard (milestone M2).
-- Players sign in anonymously. Clients may only create a run (server sets started_at) and read finished runs.
-- Only the finish-run Edge Function (service role) can finish a run and set its time and points.

-- ---------- nicknames ----------
-- Keep in sync with src/lib/nickname.ts.
create or replace function public.nickname_allowed(n text) returns boolean
language sql immutable as $$
  select n is not null
    and char_length(n) between 3 and 20
    and n ~ '^[A-Za-z0-9 _.-]+$'
    and n !~* '(https?|www|\.(com|net|org|io|gg|xyz|app|dev|me|co)([^a-z]|$))'
    and not exists (
      select 1
      from unnest(array['fuck','shit','cunt','bitch','dick','cock','pussy','whore','slut','nigg','fag','retard',
                         'rape','nazi','hitler','porn','sex','penis','vagina','asshole','bastard','admin','moderator']) as w
      where position(w in lower(regexp_replace(n, '[^A-Za-z0-9]', '', 'g'))) > 0
    )
$$;

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  nickname text not null constraint nickname_ok check (public.nickname_allowed(nickname)),
  created_at timestamptz not null default now()
);
create unique index profiles_nickname_unique on public.profiles (lower(nickname));

-- ---------- runs ----------
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  game_id text not null check (game_id ~ '^[a-z0-9-]{2,40}$'),
  client_version text check (client_version is null or char_length(client_version) <= 40),
  status text not null default 'started' check (status in ('started', 'finished', 'rejected')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ms integer check (ms is null or ms >= 0),
  moves integer,
  mistakes integer,
  points integer,
  stars smallint check (stars is null or stars between 1 and 3),
  task_ms integer[],
  reject_reason text
);
create index runs_board on public.runs (game_id, status, points desc, ms asc);
create index runs_user on public.runs (user_id, started_at desc);

-- Rate limit: at most 30 runs started per player per 10 minutes (stops play-count spam).
create or replace function public.runs_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.runs where user_id = new.user_id and started_at > now() - interval '10 minutes') >= 30 then
    raise exception 'too many runs started, slow down' using errcode = 'P0001';
  end if;
  new.started_at := now();      -- never trust a client timestamp
  new.status := 'started';
  return new;
end $$;
create trigger runs_rate_limit before insert on public.runs for each row execute function public.runs_rate_limit();

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.runs enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant insert (user_id, nickname), update (user_id, nickname), delete on public.profiles to authenticated;

create policy profiles_read on public.profiles for select using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (user_id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profiles_delete on public.profiles for delete to authenticated using (user_id = auth.uid());

revoke all on public.runs from anon, authenticated;
grant select on public.runs to anon, authenticated;
-- Clients can only choose the game and client version; id, user_id, started_at and status come from defaults/trigger.
grant insert (game_id, client_version) on public.runs to authenticated;
grant delete on public.runs to authenticated;
-- No UPDATE grant at all: nobody can change ms or points from the client.

create policy runs_read on public.runs for select using (status = 'finished' or user_id = auth.uid());
create policy runs_insert on public.runs for insert to authenticated with check (user_id = auth.uid());
create policy runs_delete on public.runs for delete to authenticated using (user_id = auth.uid());

-- ---------- views and functions ----------
-- Best finished run per player per game.
create view public.scores with (security_invoker = on) as
  select distinct on (user_id, game_id) user_id, game_id, points, ms, stars, finished_at
  from public.runs
  where status = 'finished'
  order by user_id, game_id, points desc, ms asc;
grant select on public.scores to anon, authenticated;

-- Top players for a game, all time (p_since null) or since a date. Never exposes user ids.
create or replace function public.leaderboard(p_game text, p_since timestamptz default null, p_limit int default 20)
returns table (rank bigint, nickname text, points int, ms int, stars smallint, is_me boolean)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (r.user_id) r.user_id, r.points, r.ms, r.stars
    from public.runs r
    where r.game_id = p_game and r.status = 'finished' and (p_since is null or r.finished_at >= p_since)
    order by r.user_id, r.points desc, r.ms asc
  )
  select rank() over (order by b.points desc, b.ms asc), coalesce(p.nickname, 'anonymous'), b.points, b.ms, b.stars,
         coalesce(b.user_id = auth.uid(), false)
  from best b left join public.profiles p on p.user_id = b.user_id
  order by 1, 4
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;

-- The caller's rank for a game, and how many players are ranked.
create or replace function public.my_rank(p_game text, p_since timestamptz default null)
returns table (rank bigint, points int, ms int, total bigint)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (r.user_id) r.user_id, r.points, r.ms
    from public.runs r
    where r.game_id = p_game and r.status = 'finished' and (p_since is null or r.finished_at >= p_since)
    order by r.user_id, r.points desc, r.ms asc
  ), ranked as (
    select user_id, points, ms, rank() over (order by points desc, ms asc) as rank, count(*) over () as total from best
  )
  select rank, points, ms, total from ranked where user_id = auth.uid()
$$;

-- Public play counts per game, for the stats line on the home page.
create or replace function public.play_counts()
returns table (game_id text, started bigint, finished bigint)
language sql stable security definer set search_path = public as $$
  select game_id, count(*), count(*) filter (where status = 'finished') from public.runs group by game_id
$$;

revoke execute on function public.leaderboard(text, timestamptz, int), public.my_rank(text, timestamptz), public.play_counts() from public;
grant execute on function public.leaderboard(text, timestamptz, int), public.my_rank(text, timestamptz), public.play_counts() to anon, authenticated;
revoke execute on function public.runs_rate_limit() from public, anon, authenticated;
