# Running a competition (e.g. at VJTI)

Players need only a **nickname**. Winners prove who they are with a **claim code** (shown once, screenshot it). You collect no personal data until you hand over a prize.

## 1. Before the event (a week ahead)

1. **Deploy the latest database and function** (from the project folder on your Mac):
   ```bash
   supabase db push --remote
   ```
   ```bash
   supabase functions deploy finish-run --project-ref lvrxvhpbafzmkszmqvqk
   ```
2. **Push the site** so the live site has the competition pages:
   ```bash
   git push
   ```
3. **Supabase settings** (Authentication):
   - **Allow anonymous sign-ins: ON.**
   - **Rate Limits → anonymous sign-ins per hour: 1000 or more.** On college Wi-Fi every student shares one internet address; the default (30) would block the 31st student.
4. **Create the competition** on the live site: footer → **Host a competition** (`https://YOUR-SITE/#/competitions/new`).
   - Name: `VJTI Break the Cloud Cup`, link: `vjti-2026`, start and end times.
   - **Save the organiser link** in your password manager. It is shown once and is the only way to see final standings and verify winners.
5. **Poster / slide:** the public link `https://YOUR-SITE/#/c/vjti-2026`, made into a QR code (any free QR generator), plus three lines:
   - Scan, pick a nickname, then **screenshot your claim code** (it stays on screen until you tick “I took a screenshot”).
   - Play in **one browser, not incognito**.
   - Best score per game counts; total over all 24 games wins. Level prizes too.
6. **Dry run:** play one game on a phone on the college Wi-Fi; check the result card says “Posted” and your nickname appears on `#/c/vjti-2026`.
7. If the Supabase project is on the free plan, make sure it is **not paused** the day before (open the dashboard; a paused project shows a “Restore” button). For a big event, Pro ($25/month, cancel afterwards) removes that risk.

## 2. During the event

- Put `https://YOUR-SITE/#/c/vjti-2026` on the hall projector and press **Projector mode**: big leaderboard, refreshes every 30 seconds.
- Remind players: screenshot the claim code the moment it appears. The QR link opens the competition page, which asks for a nickname straight away; any game page does the same for a player without one. The code stays in its own window until the player confirms they saved it.
- Lost the code but still in the same browser? **My report card → Get a new claim code** (the old one stops working).
- The **Level** tabs show who leads each level, for level prizes or shout-outs.

## 3. After the event

1. Open your **organiser link** (`#/c/vjti-2026/admin?key=…`).
   - **Final standings:** download the CSV and keep it (evidence of participation).
   - **Level winners** are listed per level.
2. **Fairness check:** open each finalist under *Finalists’ runs*. Warning signs: task times far below everyone else’s, zero mistakes everywhere, many games finished seconds apart. If unsure, ask that finalist to replay one game live (in person or on a video call).
3. **Verify each winner:** ask them for their **nickname and claim code** (from their screenshot) and enter both under *Verify a winner*. ✓ Valid means the nickname is theirs.
4. Only then ask the winner for what you need to deliver the prize (UPI ID, address), privately.

## Rules (already on the competition page)

1. Pick a nickname before you play; only players with a nickname are ranked. No email or phone is collected.
2. Save your claim code (screenshot). Prize winners must show their nickname and claim code. Lost codes cannot be recovered, but you can issue a new one from your report card while you still have access in the same browser.
3. Only games finished between the start and end count. Your best score per game counts; your total is the sum over all 24 games.
4. Level boards add up the games of one level. Ties: more points, then more stars, then whoever reached the score first.
5. Play in one browser, not incognito.
6. Scores are checked on the server. Finalists may be asked to replay a game live before prizes are given. One player per person.

## For your records (EB-1A)

Keep: the event poster or announcement from VJTI (dated, with the site’s name), the final standings CSV, a photo of the projector leaderboard, and a short letter or email from the organising club or faculty saying how many students took part.
