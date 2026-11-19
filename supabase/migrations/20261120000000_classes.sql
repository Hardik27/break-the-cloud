-- Classes (training centres and college sections).
-- An instructor creates a class and gets a public join code plus a secret instructor key (shown once).
-- Learners join with the code; every run they start is tagged with it.
-- The instructor report (per game, per learner) needs the key, so it works from any device without an account.

create table public.classes (
  code text primary key check (code ~ '^[A-Z2-9]{6}$'),
  name text not null check (char_length(btrim(name)) between 3 and 80),
  city text not null check (char_length(btrim(city)) between 2 and 60),
  course text check (course is null or char_length(course) <= 80),
  key_hash text not null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index classes_creator on public.classes (created_by, created_at desc);

alter table public.runs add column class_code text references public.classes(code) on delete set null;
create index runs_class on public.runs (class_code, game_id, status);

-- Nobody reads the table directly (it holds key hashes); everything goes through the functions below.
alter table public.classes enable row level security;
revoke all on public.classes from anon, authenticated;

-- Learners may now also choose the class a run belongs to (it must exist: foreign key).
grant insert (game_id, client_version, class_code) on public.runs to authenticated;

-- Join codes avoid look-alike characters (0/O, 1/I).
create or replace function public.random_code(n int) returns text
language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, n)
$$;

-- Create a class. Returns the join code and the instructor key (the key is stored only as a hash).
create or replace function public.create_class(p_name text, p_city text, p_course text default null)
returns table (code text, admin_key text)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_code text;
  v_key text;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = 'P0001'; end if;
  if (select count(*) from public.classes c where c.created_by = auth.uid() and c.created_at > now() - interval '1 day') >= 10 then
    raise exception 'too many classes created today' using errcode = 'P0001';
  end if;
  loop
    v_code := public.random_code(6);
    exit when not exists (select 1 from public.classes c where c.code = v_code);
  end loop;
  v_key := public.random_code(20);
  insert into public.classes (code, name, city, course, key_hash)
  values (v_code, btrim(p_name), btrim(p_city), nullif(btrim(coalesce(p_course, '')), ''), md5(v_key || v_code));
  return query select v_code, v_key;
end $$;

-- What a learner sees before joining: the class name, city and course. Public.
create or replace function public.class_info(p_code text)
returns table (code text, name text, city text, course text)
language sql stable security definer set search_path = public as $$
  select c.code, c.name, c.city, c.course from public.classes c where c.code = upper(btrim(p_code))
$$;

-- The instructor report. Needs the instructor key. Learners appear by nickname (or an anonymous label), never by id.
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
        'learners', count(distinct r.user_id),
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
          'games_finished', u.games_finished,
          'points', u.points,
          'last_active', u.last_active) order by u.points desc, u.last_active desc)
      from (
        select r.user_id,
               count(distinct r.game_id) filter (where r.status = 'finished') as games_finished,
               max(r.started_at) as last_active,
               (select coalesce(sum(z.best), 0) from (
                  select max(r2.points) as best from public.runs r2
                  where r2.user_id = r.user_id and r2.class_code = c.code and r2.status = 'finished'
                  group by r2.game_id) z)::int as points
        from public.runs r where r.class_code = c.code group by r.user_id) u
      left join public.profiles p on p.user_id = u.user_id), '[]'::jsonb)
  );
end $$;

revoke execute on function public.random_code(int), public.create_class(text, text, text), public.class_info(text), public.class_report(text, text) from public;
grant execute on function public.create_class(text, text, text) to authenticated;
grant execute on function public.class_info(text), public.class_report(text, text) to anon, authenticated;
