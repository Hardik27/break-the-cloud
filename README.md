# Break the Cloud: starter kit for Claude Code

## What's in this folder

| File | What it is | Do you edit it? |
|---|---|---|
| `CLAUDE.md` | Project rules Claude Code reads automatically every session: stack, design system, walkthrough rules, testing rules. | Yes, if you want to change a rule. |
| `docs/curriculum.md` | All 8 levels and 24 games, the tasks in each, and the 7 milestones. | Yes, to add or reorder games. |
| `PROMPT.md` | The first prompt to paste. | No. |
| `reference/split-brain.html` | The original Split Brain: the look to copy. | No. |
| `reference/break-the-cloud-v1.html` | v1 site with 3 working games, to port. | No. |

## Steps

1. Unzip this folder somewhere, for example `~/code/break-the-cloud`.
2. Open a terminal in it and run:
   ```
   git init
   claude
   ```
3. Paste the contents of `PROMPT.md`. It builds milestone M1 and stops.
4. Run `npm run dev` and play all three games. Tell Claude Code anything that confuses you.
5. For each next milestone, paste:
   ```
   Build milestone M2 from docs/curriculum.md. Follow CLAUDE.md. Run all tests and fix until they pass, then stop and tell me how to try it.
   ```
   Then M3, M4, and so on.

## Before M2 (leaderboard): set up Supabase

1. Create a free project at supabase.com.
2. Turn on Authentication → Sign In Methods → Anonymous sign-ins.
3. Copy the Project URL and the anon public key into a `.env.local` file:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
4. Install the Supabase CLI (`brew install supabase/tap/supabase`), run `supabase login`, then `supabase link` and pick your project.
5. Create the tables and policies, then deploy the scoring function:
   ```
   supabase db push
   supabase functions deploy finish-run
   ```
6. Restart `npm run dev`. The leaderboard switches on by itself; without the `.env.local` values the game runs offline and keeps best scores in the browser.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` runs the unit tests, builds the site and publishes it on every push to `main`.

1. On github.com, create an **empty** repository named `break-the-cloud` (no README, no .gitignore, no licence).
2. Push this folder (replace `YOUR-USERNAME`):
   ```
   git remote add origin https://github.com/YOUR-USERNAME/break-the-cloud.git
   git push -u origin main
   ```
   When git asks for a password, paste a personal access token (GitHub → Settings → Developer settings → Personal access tokens), not your account password.
3. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Optional, for the shared leaderboard: **Settings → Secrets and variables → Actions → New repository secret**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the same values as `.env.local`). Never add the service-role key here.
5. **Actions** tab → "Test and deploy" → **Run workflow** (or push any commit). After about 2 minutes the site is live at `https://YOUR-USERNAME.github.io/break-the-cloud/`.

Later updates: `git add -A`, `git commit -m "..."`, `git push`. Every push redeploys.

The Playwright suite is not run in CI (it takes about 15 minutes); run `npm run e2e` locally before pushing big changes.

Own domain, Supabase in Mumbai, and what to do before a training centre relies on it: see [docs/DEPLOY.md](docs/DEPLOY.md).

## Classes (training centres and colleges)

An instructor opens `#/classes/new`, enters the centre name and city, and gets a 6-character join code plus a private instructor link (shown once). Learners open `#/join/<CODE>`; from then on every run they start is tagged with the class. The instructor link shows learners, per-game progress and a CSV export. It needs Supabase (the `classes` migration).

## Competitions

Host one from the footer (`#/competitions/new`): players need only a nickname, winners prove themselves with a claim code, and you get live per-level and overall leaderboards, report cards and an organiser desk. Step-by-step for an event: [docs/COMPETITION.md](docs/COMPETITION.md).

## Showing usage numbers

Milestone M2 records runs started and finished per game, and the home page shows them. For page views, add Cloudflare Web Analytics or Plausible: both are cookieless, so the privacy page stays simple.
