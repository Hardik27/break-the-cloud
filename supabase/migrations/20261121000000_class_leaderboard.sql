-- Class leaderboards: the same leaderboard and rank functions, optionally limited to one class.
drop function if exists public.leaderboard(text, timestamptz, int);
drop function if exists public.my_rank(text, timestamptz);

create or replace function public.leaderboard(p_game text, p_since timestamptz default null, p_limit int default 20, p_class text default null)
returns table (rank bigint, nickname text, points int, ms int, stars smallint, is_me boolean)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (r.user_id) r.user_id, r.points, r.ms, r.stars
    from public.runs r
    where r.game_id = p_game and r.status = 'finished'
      and (p_since is null or r.finished_at >= p_since)
      and (p_class is null or r.class_code = upper(btrim(p_class)))
    order by r.user_id, r.points desc, r.ms asc
  )
  select rank() over (order by b.points desc, b.ms asc), coalesce(p.nickname, 'anonymous'), b.points, b.ms, b.stars,
         coalesce(b.user_id = auth.uid(), false)
  from best b left join public.profiles p on p.user_id = b.user_id
  order by 1, 4
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;

create or replace function public.my_rank(p_game text, p_since timestamptz default null, p_class text default null)
returns table (rank bigint, points int, ms int, total bigint)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (r.user_id) r.user_id, r.points, r.ms
    from public.runs r
    where r.game_id = p_game and r.status = 'finished'
      and (p_since is null or r.finished_at >= p_since)
      and (p_class is null or r.class_code = upper(btrim(p_class)))
    order by r.user_id, r.points desc, r.ms asc
  ), ranked as (
    select user_id, points, ms, rank() over (order by points desc, ms asc) as rank, count(*) over () as total from best
  )
  select rank, points, ms, total from ranked where user_id = auth.uid()
$$;

revoke execute on function public.leaderboard(text, timestamptz, int, text), public.my_rank(text, timestamptz, text) from public;
grant execute on function public.leaderboard(text, timestamptz, int, text), public.my_rank(text, timestamptz, text) to anon, authenticated;
