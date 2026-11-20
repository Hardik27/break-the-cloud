# Break the Cloud: SQL queries for watching the site

Run these in **Supabase → SQL Editor → New query**: paste one, press **Run**.
All of them only read data (`select`). The SQL Editor has full database rights, so do not run `update` or `delete` here; to remove a player, use the site's **Delete my data** button.

A "user" is an **anonymous ID plus an optional nickname**. There is no email, phone or name to look up: that is the privacy promise on the site.

The one change you may make here: show a competition on everyone's home page (`featured`):
```sql
update public.competitions set featured = true where id = 'vjti-2026';
```

---

## Learning and impact (for reports and EB-1A)

These read the learning activity the site records (see `#/privacy`). Active minutes count only while the page is visible and the learner is interacting.

### A. The headline numbers
```sql
select * from public.impact_summary;
```
Learners, learners with a nickname, active hours, games finished, concepts learned, quick checks answered, countries, book clicks, classes, competitions, and the date it all started.

### B. Week by week
```sql
select * from public.impact_weekly;
```

### C. Every learner: what they studied and for how long
```sql
select nickname, first_seen, last_seen, active_minutes, sessions, games_finished, top_level,
       concepts_learned, explainers_read, checks_right || '/' || checks_answered as quick_checks,
       predictions_right || '/' || predictions as predictions, hints_used, games_abandoned,
       book_clicked, country, device, classes, competitions
from public.learner_summary
order by active_minutes desc;
```

### D. Most dedicated learners (top 20 by time)
```sql
select nickname, active_minutes, games_finished, concepts_learned, country
from public.learner_summary
where nickname is not null
order by active_minutes desc
limit 20;
```

### E. Countries and devices
```sql
select coalesce(country, '??') as country, count(*) as learners, round(sum(active_minutes) / 60, 1) as hours
from public.learner_summary group by 1 order by learners desc;
```
```sql
select coalesce(device, 'unknown') as device, count(*) as learners from public.learner_summary group by 1;
```

### F. Where learners give up (per game and task)
```sql
select game_id, task, count(*) as left_here
from public.events where type = 'abandon'
group by game_id, task order by left_here desc;
```

### G. Quick-check accuracy per game (which concept is hardest)
```sql
select game_id, count(*) as answers,
       round(100.0 * count(*) filter (where (data ->> 'ok')::boolean) / count(*)) as pct_right
from public.events where type = 'check'
group by game_id order by pct_right;
```

### H. Free book clicks, by where they clicked
```sql
select data ->> 'where' as place, count(*) as clicks, count(distinct user_id) as people
from public.events where type = 'book_click' group by 1 order by clicks desc;
```

### Feedback: newest first
```sql
select f.created_at, coalesce(p.nickname, 'anonymous') as who, f.rating, f.page, f.game_id, f.message
from public.feedback f left join public.profiles p using (user_id)
order by f.created_at desc
limit 50;
```
`rating`: 1 = confusing, 2 = OK, 3 = good, 4 = loved it.

### Feedback per game (average rating)
```sql
select game_id, count(*) as messages, round(avg(rating), 1) as avg_rating
from public.feedback where game_id is not null
group by game_id order by avg_rating;
```

### I. Competition members and who was removed
```sql
select c.name, count(*) as members, count(*) filter (where m.disqualified_at is not null) as removed
from public.competition_members m join public.competitions c on c.id = m.comp_id
group by c.name;
```

---

## Users

### 1. Totals
```sql
select count(*)                                as users,
       count(*) filter (where u.is_anonymous)  as anonymous,
       count(p.user_id)                        as with_nickname,
       count(*) filter (where u.created_at > now() - interval '1 day') as new_today
from auth.users u
left join public.profiles p on p.user_id = u.id;
```

### 2. Every user with their activity (most recently active first)
```sql
select p.nickname,
       u.created_at                                   as first_visit,
       u.last_sign_in_at                              as last_seen,
       (select count(*) from public.competition_members m where m.user_id = u.id) as competitions_joined,
       count(r.id)                                    as games_started,
       count(r.id) filter (where r.status = 'finished') as games_finished,
       coalesce(sum(r.points) filter (where r.status = 'finished'), 0) as total_points,
       string_agg(distinct r.class_code, ', ')        as class,
       u.id                                           as user_id
from auth.users u
left join public.profiles p on p.user_id = u.id
left join public.runs r     on r.user_id = u.id
group by u.id, p.nickname
order by u.last_sign_in_at desc nulls last;
```
`total_points` adds up every finished run. Leaderboards count only each player's **best** run per game (query 4).

### 3. Only players with a nickname
```sql
select p.nickname, p.created_at as nickname_since
from public.profiles p
order by p.created_at desc;
```

### 4. Each player's best score per game (what leaderboards use)
```sql
select p.nickname, r.game_id, max(r.points) as best_points, max(r.stars) as best_stars, count(*) as attempts
from public.runs r
join public.profiles p using (user_id)
where r.status = 'finished'
group by p.nickname, r.game_id
order by p.nickname, r.game_id;
```

### 5. Everything about one player
```sql
select r.game_id, r.status, r.points, r.stars,
       round(r.ms / 1000.0, 1) as seconds, r.mistakes, r.moves,
       r.task_ms, r.class_code, r.reject_reason, r.started_at, r.finished_at
from public.runs r
join public.profiles p using (user_id)
where lower(p.nickname) = lower('VJTI_Ace')      -- put the nickname here
order by r.started_at desc;
```

### 6. New users per day
```sql
select date(created_at) as day, count(*) as new_users
from auth.users
group by 1
order by 1 desc;
```

### 7. Visitors who never picked a nickname (playing unranked)
```sql
select u.id, u.created_at, u.last_sign_in_at,
       (select count(*) from public.runs r where r.user_id = u.id) as games_started
from auth.users u
where not exists (select 1 from public.profiles p where p.user_id = u.id)
order by u.created_at desc;
```
Users with **0 games started** here are mostly people who opened the site and left (or leftovers from early browser tests). They are harmless; delete them in **Authentication → Users** if you like.

---

## Games and activity

### 8. Today at a glance
```sql
select
  (select count(*) from auth.users)                                          as visitors_total,
  (select count(*) from public.profiles)                                     as players_with_nickname,
  (select count(*) from public.runs where started_at > now() - interval '1 day')  as games_started_24h,
  (select count(*) from public.runs where status = 'finished' and finished_at > now() - interval '1 day') as games_finished_24h,
  (select count(*) from public.runs where status = 'rejected')               as rejected_total;
```

### 9. Latest finished games
```sql
select p.nickname, r.game_id, r.points, r.stars, round(r.ms / 1000.0, 1) as seconds, r.mistakes, r.finished_at
from public.runs r left join public.profiles p using (user_id)
where r.status = 'finished'
order by r.finished_at desc
limit 30;
```

### 10. Most played games
```sql
select g.level, r.game_id,
       count(*) as started,
       count(*) filter (where r.status = 'finished') as finished,
       round(100.0 * count(*) filter (where r.status = 'finished') / count(*)) as finish_pct
from public.runs r join public.game_levels g using (game_id)
group by g.level, r.game_id
order by started desc;
```
A low `finish_pct` means students quit that game: a hint it is too hard or confusing.

### 11. Rejected runs (cheating, or a clock problem)
```sql
select p.nickname, r.game_id, r.reject_reason, r.started_at
from public.runs r left join public.profiles p using (user_id)
where r.status = 'rejected'
order by r.started_at desc
limit 30;
```
`impossibly fast` = likely scripted. `client clock` = usually a sleeping laptop or a backgrounded tab.

### 12. Who is playing right now
```sql
select count(distinct user_id) as players_last_10_min
from public.runs
where started_at > now() - interval '10 minutes';
```

---

## Competition (e.g. VJTI)

### 13. Overall standings
```sql
select rank, nickname, points, games, stars, reached_at
from public.competition_board('vjti-2026', null, 50);
```

### 14. One level's standings
```sql
select rank, nickname, points, games, stars
from public.competition_board('vjti-2026', 1, 10);   -- change 1 to any level 1–8
```

---

## Classes (training centres)

### 15. Classes with learners and progress
```sql
select c.code, c.name, c.city, c.created_at,
       count(distinct r.user_id) as learners,
       count(*) filter (where r.status = 'finished') as games_finished
from public.classes c left join public.runs r on r.class_code = c.code
group by c.code
order by c.created_at desc;
```

---

## From the Terminal instead (optional)

From the project folder, any query above can run read-only through the Supabase CLI:
```bash
supabase db query --remote --read-only "select count(*) from auth.users;"
```
