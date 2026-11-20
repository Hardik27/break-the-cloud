-- Learning telemetry: what each (anonymous) learner did and for how long.
--   * Clients may only INSERT their own events; nobody can read them through the API.
--   * The site owner reads the summaries (learner_summary, impact_summary, impact_weekly) in the Supabase SQL editor.
--   * No IP addresses, names or emails. Country (from Cloudflare) and device type (phone/computer) only.
--   * "Delete my data" removes a player's events with everything else (delete_my_data).

create table public.events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid,
  type text not null check (type in (
    'visit',          -- a page was opened (data: page, device, country)
    'game_open',      -- a game page was opened
    'learn_done',     -- a concept card was read to the end (or skipped: data.skipped)
    'check',          -- a quick-check question was answered (data.ok)
    'predict',        -- a prediction was made before a run (data.ok)
    'hint',           -- a hint was opened (data.level 1-3)
    'tutorial_done',  -- the guided tutorial was finished
    'task_done',      -- a task was cleared (task = index)
    'game_finish',    -- every task cleared (data: points, stars, ms)
    'abandon',        -- the player left a game part-way (task = where, data.ms)
    'active',         -- seconds of active time (data.s): counted only while the tab is visible and the learner interacts
    'book_click'      -- the free book link was opened (data.where)
  )),
  game_id text check (game_id is null or game_id ~ '^[a-z0-9-]{2,40}$'),
  task smallint check (task is null or task between 0 and 20),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 1024),
  created_at timestamptz not null default now()
);
create index events_user on public.events (user_id, created_at);
create index events_type on public.events (type, created_at);

alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
grant insert (session_id, type, game_id, task, data) on public.events to authenticated;
create policy events_insert on public.events for insert to authenticated with check (user_id = auth.uid());

-- Server time only; at most 300 events per player per 10 minutes; active time at most 120 s per event.
-- Rows over the limit are dropped silently (the client never sees an error for telemetry).
create or replace function public.events_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if new.type = 'active' and not (jsonb_typeof(new.data -> 's') = 'number' and (new.data ->> 's')::numeric between 1 and 120) then
    return null;
  end if;
  if (select count(*) from public.events e where e.user_id = new.user_id and e.created_at > now() - interval '10 minutes') >= 300 then
    return null;
  end if;
  return new;
end $$;
create trigger events_guard before insert on public.events for each row execute function public.events_guard();
revoke execute on function public.events_guard() from public, anon, authenticated;

-- ---------- summaries for the site owner (SQL editor only) ----------
create view public.learner_summary with (security_invoker = on) as
with ids as (
  select user_id from public.events union select user_id from public.runs union select user_id from public.profiles
), e as (
  select user_id,
    min(created_at) as first_seen,
    max(created_at) as last_seen,
    round(coalesce(sum((data ->> 's')::numeric) filter (where type = 'active'), 0) / 60.0, 1) as active_minutes,
    count(distinct session_id) as sessions,
    count(*) filter (where type = 'visit') as page_views,
    count(distinct game_id) filter (where type = 'game_open') as games_opened,
    count(distinct (game_id, task)) filter (where type = 'learn_done') as explainers_read,
    count(distinct (game_id, task)) filter (where type = 'task_done') as concepts_learned,
    count(*) filter (where type = 'check') as checks_answered,
    count(*) filter (where type = 'check' and (data ->> 'ok')::boolean) as checks_right,
    count(*) filter (where type = 'predict') as predictions,
    count(*) filter (where type = 'predict' and (data ->> 'ok')::boolean) as predictions_right,
    count(*) filter (where type = 'hint') as hints_used,
    count(*) filter (where type = 'abandon') as games_abandoned,
    bool_or(type = 'book_click') as book_clicked,
    (array_agg(data ->> 'country' order by created_at desc) filter (where data ? 'country'))[1] as country,
    (array_agg(data ->> 'device' order by created_at desc) filter (where data ? 'device'))[1] as device
  from public.events group by user_id
), r as (
  select r.user_id,
    count(*) as runs_started,
    count(*) filter (where r.status = 'finished') as runs_finished,
    count(distinct r.game_id) filter (where r.status = 'finished') as games_finished,
    max(g.level) filter (where r.status = 'finished') as top_level,
    min(r.started_at) as first_run,
    max(coalesce(r.finished_at, r.started_at)) as last_run
  from public.runs r left join public.game_levels g on g.game_id = r.game_id
  group by r.user_id
)
select ids.user_id, p.nickname,
  least(e.first_seen, r.first_run, p.created_at) as first_seen,
  greatest(e.last_seen, r.last_run) as last_seen,
  coalesce(e.active_minutes, 0) as active_minutes,
  coalesce(e.sessions, 0) as sessions,
  coalesce(e.page_views, 0) as page_views,
  coalesce(e.games_opened, 0) as games_opened,
  coalesce(r.games_finished, 0) as games_finished,
  coalesce(r.runs_started, 0) as runs_started,
  coalesce(r.runs_finished, 0) as runs_finished,
  r.top_level,
  coalesce(e.explainers_read, 0) as explainers_read,
  coalesce(e.concepts_learned, 0) as concepts_learned,
  coalesce(e.checks_answered, 0) as checks_answered,
  coalesce(e.checks_right, 0) as checks_right,
  coalesce(e.predictions, 0) as predictions,
  coalesce(e.predictions_right, 0) as predictions_right,
  coalesce(e.hints_used, 0) as hints_used,
  coalesce(e.games_abandoned, 0) as games_abandoned,
  coalesce(e.book_clicked, false) as book_clicked,
  e.country, e.device,
  (select string_agg(m.class_code, ', ') from public.class_members m where m.user_id = ids.user_id) as classes,
  (select string_agg(m.comp_id, ', ') from public.competition_members m where m.user_id = ids.user_id) as competitions
from ids
left join public.profiles p on p.user_id = ids.user_id
left join e on e.user_id = ids.user_id
left join r on r.user_id = ids.user_id;

-- One row: the totals to quote (learners, hours, concepts, countries).
create view public.impact_summary with (security_invoker = on) as
select
  count(*) as learners,
  count(*) filter (where nickname is not null) as learners_with_nickname,
  count(*) filter (where games_finished > 0) as learners_who_finished_a_game,
  round(sum(active_minutes) / 60.0, 1) as active_hours,
  sum(runs_finished) as games_finished,
  sum(concepts_learned) as concepts_learned,
  sum(checks_answered) as quick_checks_answered,
  count(distinct country) filter (where country is not null) as countries,
  count(*) filter (where book_clicked) as book_clicks,
  (select count(*) from public.classes) as classes,
  (select count(*) from public.class_members) as class_members,
  (select count(*) from public.competitions) as competitions,
  (select count(*) from public.competition_members) as competition_members,
  min(first_seen) as since
from public.learner_summary;

-- Week by week: new learners, active learners, hours and games.
create view public.impact_weekly with (security_invoker = on) as
with wk as (
  select date_trunc('week', created_at)::date as week, user_id, type, data from public.events
)
select w.week,
  count(distinct w.user_id) as active_learners,
  (select count(*) from public.learner_summary s where date_trunc('week', s.first_seen)::date = w.week) as new_learners,
  round(coalesce(sum((w.data ->> 's')::numeric) filter (where w.type = 'active'), 0) / 3600.0, 1) as active_hours,
  count(*) filter (where w.type = 'game_finish') as games_finished,
  count(*) filter (where w.type = 'task_done') as tasks_cleared
from wk w group by w.week order by w.week;

revoke all on public.learner_summary, public.impact_summary, public.impact_weekly from public, anon, authenticated;

-- ---------- the class report now shows members, minutes and concepts per learner ----------
create or replace function public.class_report(p_code text, p_key text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c public.classes;
begin
  select * into c from public.classes where classes.code = upper(btrim(p_code));
  if c.code is null or c.key_hash <> md5(coalesce(p_key, '') || c.code) then
    raise exception 'wrong class code or instructor key' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'class', jsonb_build_object('code', c.code, 'name', c.name, 'city', c.city, 'course', c.course, 'created_at', c.created_at),
    'summary', (
      select jsonb_build_object(
        'learners', (select count(*) from (select user_id from public.class_members m where m.class_code = c.code
                                           union select user_id from public.runs r2 where r2.class_code = c.code) u),
        'runs_started', count(*),
        'runs_finished', count(*) filter (where r.status = 'finished'),
        'first_activity', min(r.started_at),
        'last_activity', max(r.started_at))
      from public.runs r where r.class_code = c.code),
    'games', coalesce((
      select jsonb_agg(g order by g->>'game_id') from (
        select jsonb_build_object(
          'game_id', r.game_id,
          'learners_started', count(distinct r.user_id),
          'learners_finished', count(distinct r.user_id) filter (where r.status = 'finished'),
          'avg_points', round(avg(r.points) filter (where r.status = 'finished')),
          'avg_stars', round(avg(r.stars) filter (where r.status = 'finished'), 1)) as g
        from public.runs r where r.class_code = c.code group by r.game_id) x), '[]'::jsonb),
    'learners', coalesce((
      select jsonb_agg(jsonb_build_object(
          'name', coalesce(p.nickname, 'learner-' || substr(md5(u.user_id::text), 1, 4)),
          'games_finished', coalesce(rr.games_finished, 0),
          'points', coalesce(rr.points, 0),
          'minutes', coalesce(ev.minutes, 0),
          'concepts', coalesce(ev.concepts, 0),
          'last_active', coalesce(greatest(rr.last_active, ev.last_active), u.joined_at)) order by coalesce(rr.points, 0) desc, coalesce(ev.minutes, 0) desc)
      from (
        select user_id, min(joined_at) as joined_at from (
          select m.user_id, m.joined_at from public.class_members m where m.class_code = c.code
          union all select r.user_id, r.started_at from public.runs r where r.class_code = c.code) x
        group by user_id) u
      left join lateral (
        select count(distinct r.game_id) filter (where r.status = 'finished') as games_finished,
               max(r.started_at) as last_active,
               (select coalesce(sum(z.best), 0) from (
                  select max(r2.points) as best from public.runs r2
                  where r2.user_id = u.user_id and r2.class_code = c.code and r2.status = 'finished'
                  group by r2.game_id) z)::int as points
        from public.runs r where r.user_id = u.user_id and r.class_code = c.code) rr on true
      left join lateral (
        select round(coalesce(sum((e.data ->> 's')::numeric) filter (where e.type = 'active'), 0) / 60.0)::int as minutes,
               count(distinct (e.game_id, e.task)) filter (where e.type = 'task_done') as concepts,
               max(e.created_at) as last_active
        from public.events e where e.user_id = u.user_id and e.created_at >= u.joined_at) ev on true
      left join public.profiles p on p.user_id = u.user_id), '[]'::jsonb)
  );
end $$;

-- ---------- delete everything a player has on the server ----------
create or replace function public.delete_my_data() returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  delete from public.events where user_id = auth.uid();
  delete from public.runs where user_id = auth.uid();
  delete from public.competition_members where user_id = auth.uid();
  delete from public.class_members where user_id = auth.uid();
  delete from public.profiles where user_id = auth.uid();
  return true;
end $$;

-- ---------- restore progress on a new device with a claim code ----------
-- p_kind 'class' (p_id = class code) or 'competition' (p_id = competition id). The caller (a fresh anonymous
-- account in the new browser) takes over the nickname, runs, events and memberships of the old account.
create or replace function public.restore_progress(p_kind text, p_id text, p_nickname text, p_code text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_old uuid; v_me uuid := auth.uid(); v_hash text; v_scope text; v_nick text;
begin
  if v_me is null then raise exception 'sign in first' using errcode = 'P0001'; end if;
  select p.user_id, p.nickname into v_old, v_nick from public.profiles p where lower(p.nickname) = lower(btrim(p_nickname));
  if v_old is null then raise exception 'the nickname and claim code do not match' using errcode = 'P0001'; end if;
  if p_kind = 'class' then
    v_scope := 'class:' || upper(btrim(p_id));
    select m.claim_hash into v_hash from public.class_members m where m.class_code = upper(btrim(p_id)) and m.user_id = v_old;
  elsif p_kind = 'competition' then
    v_scope := 'comp:' || lower(btrim(p_id));
    select m.claim_hash into v_hash from public.competition_members m where m.comp_id = lower(btrim(p_id)) and m.user_id = v_old;
  else
    raise exception 'unknown kind' using errcode = 'P0001';
  end if;
  if v_hash is null or v_hash <> public.claim_fingerprint(p_code, v_scope) then
    raise exception 'the nickname and claim code do not match' using errcode = 'P0001';
  end if;
  if v_old = v_me then return v_nick; end if;
  -- The new browser's own nickname (if any) gives way; its runs and events are kept and merged.
  delete from public.profiles where user_id = v_me;
  update public.runs set user_id = v_me where user_id = v_old;
  update public.events set user_id = v_me where user_id = v_old;
  delete from public.class_members m where m.user_id = v_old and exists (select 1 from public.class_members x where x.user_id = v_me and x.class_code = m.class_code);
  update public.class_members set user_id = v_me where user_id = v_old;
  delete from public.competition_members m where m.user_id = v_old and exists (select 1 from public.competition_members x where x.user_id = v_me and x.comp_id = m.comp_id);
  update public.competition_members set user_id = v_me where user_id = v_old;
  update public.profiles set user_id = v_me where user_id = v_old;
  return v_nick;
end $$;

revoke execute on function public.delete_my_data(), public.restore_progress(text, text, text, text) from public;
grant execute on function public.delete_my_data(), public.restore_progress(text, text, text, text) to authenticated;
