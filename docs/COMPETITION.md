# Running a competition (e.g. at VJTI)

Players join with a **6-character join code** and a **nickname**; only they are ranked. Joining gives each player a **claim code for this competition** (shown once, screenshot it). Winners prove who they are with it, so you collect no personal data until you hand over a prize.

## 1. Before the event (a week ahead)

1. **Deploy the latest database** (from the project folder on your Mac):
   ```bash
   supabase db push --remote
   ```
   The scoring function only needs redeploying when `supabase/functions/` changes:
   ```bash
   supabase functions deploy finish-run --project-ref lvrxvhpbafzmkszmqvqk
   ```
2. **Push the site** (Cloudflare redeploys `https://breakthecloud.dev` in about a minute):
   ```bash
   git push
   ```
3. **Supabase settings** (Authentication):
   - **Allow anonymous sign-ins: ON.**
   - **Rate Limits → anonymous sign-ins per hour: 1000 or more.** On college Wi-Fi every student shares one internet address; the default (30) would block the 31st student.
4. **Create the competition**: home page → **Teach or host → Host a competition** (`https://breakthecloud.dev/#/competitions/new`).
   - Name: `VJTI Break the Cloud Cup`, link: `vjti-2026`, start and end times.
   - You get the **join code**, the **join link** (it contains the code, e.g. `https://breakthecloud.dev/#/c/vjti-2026?code=K7Q2XM`) and the **organiser link**.
   - **Save the organiser link** in your password manager. It is shown once and is the only way to see final standings, verify winners and remove cheaters. The join code and link are also on the organiser page.
5. **Optional: show it on everyone's home page** (otherwise only players who joined see the banner). In Supabase → SQL Editor:
   ```sql
   update public.competitions set featured = true where id = 'vjti-2026';
   ```
6. **Poster / slide:** the **join link** (with the code) as a QR code (any free QR generator), the join code in big letters for people who type it, plus three lines:
   - Scan, pick a nickname, press **Join**, then **screenshot your claim code** (it stays on screen until you tick “I took a screenshot”).
   - Play in **one browser, not incognito**. Lost it? “Get your progress back” on the competition page, with your nickname and claim code.
   - Best score per game counts; total over all 24 games wins. Level prizes too.
7. **Dry run:** join on a phone on the college Wi-Fi, play one game; check the result card says “Posted” and your nickname appears on `#/c/vjti-2026`.
8. If the Supabase project is on the free plan, make sure it is **not paused** the day before (open the dashboard; a paused project shows a “Restore” button). For a big event, Pro ($25/month, cancel afterwards) removes that risk.

## 2. During the event

- Put `https://breakthecloud.dev/#/c/vjti-2026` on the hall projector and press **Projector mode**: big leaderboard, refreshes every 30 seconds.
- Without the code nobody can join, so strangers who find the page cannot get on your board.
- Remind players: screenshot the claim code the moment it appears.
- Lost the code but still in the same browser? **My report card → Get a new claim code** (the old one stops working). New phone or cleared browser? **Get your progress back** on the competition page, with the nickname and the claim code.
- The **Level** tabs show who leads each level, for level prizes or shout-outs.
- Offensive nickname or obvious cheating? Organiser page → **Remove** next to the player (or **Disqualify a player**). They disappear from every board of this competition; their data is kept and **Reinstate** undoes it.

## 3. After the event

1. Open your **organiser link** (`#/c/vjti-2026/admin?key=…`).
   - **Final standings:** download the CSV and keep it (evidence of participation).
   - **Level winners** are listed per level.
2. **Fairness check:** open each finalist under *Finalists’ runs*. Warning signs: task times far below everyone else’s, zero mistakes everywhere, many games finished seconds apart. If unsure, ask that finalist to replay one game live (in person or on a video call), and disqualify if needed.
3. **Verify each winner:** ask them for their **nickname and claim code** (from their screenshot) and enter both under *Verify a winner*. ✓ Valid means the nickname is theirs. A code from another competition, or a disqualified player, is not valid.
4. Only then ask the winner for what you need to deliver the prize (UPI ID, address), privately.
5. **Impact numbers** (minutes learned, concepts, countries): see the queries in [SQL-QUERIES.md](SQL-QUERIES.md).

## Rules (already on the competition page)

1. Join with the code from the organiser and a nickname. Only players who joined are ranked. No email or phone is collected.
2. Save your claim code (screenshot). It works only for this competition. Prize winners must show their nickname and claim code.
3. Only games finished between the start and end count. Your best score per game counts; your total is the sum over all 24 games.
4. Level boards add up the games of one level. Ties: more points, then more stars, then whoever reached the score first.
5. Play in one browser, not incognito.
6. Scores are checked on the server. Finalists may be asked to replay a game live before prizes are given. One player per person.

## For your records (EB-1A)

Keep: the event poster or announcement from VJTI (dated, with the site’s name), the final standings CSV, a photo of the projector leaderboard, the `impact_summary` numbers for the event, and a short letter or email from the organising club or faculty saying how many students took part.
