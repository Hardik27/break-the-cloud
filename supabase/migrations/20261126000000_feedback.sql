-- Feedback from players: a short message, an optional 1-4 rating, and where it was sent from.
-- Anonymous (linked only to the random account id). Players may only INSERT; the site owner reads it in the SQL editor.

create table public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  page text check (page is null or char_length(page) <= 80),
  game_id text check (game_id is null or game_id ~ '^[a-z0-9-]{2,40}$'),
  rating smallint check (rating is null or rating between 1 and 4),
  message text not null check (char_length(btrim(message)) between 3 and 2000),
  created_at timestamptz not null default now()
);
create index feedback_created on public.feedback (created_at desc);

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant insert (page, game_id, rating, message) on public.feedback to authenticated;
create policy feedback_insert on public.feedback for insert to authenticated with check (user_id = auth.uid());

-- Server time only; at most 5 messages per player per hour (stops spam).
create or replace function public.feedback_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if (select count(*) from public.feedback f where f.user_id = new.user_id and f.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too much feedback, try again later' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger feedback_guard before insert on public.feedback for each row execute function public.feedback_guard();
revoke execute on function public.feedback_guard() from public, anon, authenticated;

-- "Delete my data" now removes feedback too.
create or replace function public.delete_my_data() returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  delete from public.events where user_id = auth.uid();
  delete from public.feedback where user_id = auth.uid();
  delete from public.runs where user_id = auth.uid();
  delete from public.competition_members where user_id = auth.uid();
  delete from public.class_members where user_id = auth.uid();
  delete from public.profiles where user_id = auth.uid();
  return true;
end $$;

-- Restoring progress on a new device also moves feedback.
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
  delete from public.profiles where user_id = v_me;
  update public.runs set user_id = v_me where user_id = v_old;
  update public.events set user_id = v_me where user_id = v_old;
  update public.feedback set user_id = v_me where user_id = v_old;
  delete from public.class_members m where m.user_id = v_old and exists (select 1 from public.class_members x where x.user_id = v_me and x.class_code = m.class_code);
  update public.class_members set user_id = v_me where user_id = v_old;
  delete from public.competition_members m where m.user_id = v_old and exists (select 1 from public.competition_members x where x.user_id = v_me and x.comp_id = m.comp_id);
  update public.competition_members set user_id = v_me where user_id = v_old;
  update public.profiles set user_id = v_me where user_id = v_old;
  return v_nick;
end $$;
