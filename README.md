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

## Deploying (after M2)

Ask Claude Code: "Set up deployment to Cloudflare Pages (or GitHub Pages) with a GitHub Action that runs tests before deploying." Add the two `VITE_SUPABASE_*` values as build secrets.

## Showing usage numbers

Milestone M2 records runs started and finished per game, and the home page shows them. For page views, add Cloudflare Web Analytics or Plausible: both are cookieless, so the privacy page stays simple.
