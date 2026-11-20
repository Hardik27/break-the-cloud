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

## Deploying (Cloudflare, your own domain)

Live at **https://breakthecloud.dev**. Cloudflare builds and deploys on every push to `main` (`npm run build`, then `npx wrangler deploy` using `wrangler.jsonc`). Build variables in Cloudflare: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `NODE_VERSION=22`. Never add the service-role or secret key. Full steps: [docs/DEPLOY.md](docs/DEPLOY.md).

`.github/workflows/test.yml` runs the unit tests and a build on every push and pull request; it does not publish anything. The Playwright suite is not run in CI (it takes about 15 minutes); run `npm run e2e` locally before pushing big changes.

Own domain, Supabase in Mumbai, and what to do before a training centre relies on it: see [docs/DEPLOY.md](docs/DEPLOY.md).

## Classes (training centres and colleges)

An instructor opens **Teach or host → Create a class** (`#/classes/new`), enters the centre name and city, and gets a 6-character join code plus a private instructor link (shown once). Learners open `#/join/<CODE>` (or type the code under **Teach or host → Join with a code**); joining gives them a claim code for that class, which restores their progress on another device. The instructor link shows learners, per-game progress, minutes spent and concepts learned, with a CSV export.

## Competitions

Host one from **Teach or host → Host a competition** (`#/competitions/new`). Players join with the competition's join code (the poster's QR link contains it) and a nickname; only members are ranked. Joining gives a claim code for that competition, which winners show to prove a nickname is theirs. Live per-level and overall boards, report cards, and an organiser desk with winner checks and disqualify. Step-by-step for an event: [docs/COMPETITION.md](docs/COMPETITION.md).

## Learning telemetry

The site records anonymous learning activity (pages, games, explainers, quick-check answers, hints, tasks, active minutes, device type, country; never IP addresses, names or emails), disclosed on `#/privacy` and removed by **Delete my data**. Only the site owner reads it, through the `learner_summary`, `impact_summary` and `impact_weekly` views in the Supabase SQL editor: see [docs/SQL-QUERIES.md](docs/SQL-QUERIES.md).

## Showing usage numbers

Milestone M2 records runs started and finished per game, and the home page shows them. For page views, add Cloudflare Web Analytics or Plausible: both are cookieless, so the privacy page stays simple.
