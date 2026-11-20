# Deploying Break the Cloud on your own domain

## How it works (no VM needed)

Break the Cloud is a **static site**: after `npm run build` it is just HTML, CSS and JavaScript files in `dist/`. Nothing runs on a server of yours. Every visitor's browser downloads those files and runs the games locally. So you do **not** rent a virtual machine (VM). You need three things:

| Piece | What it does | Who provides it | Cost |
|---|---|---|---|
| **Domain name** | The address people type, e.g. `breakthecloud.in` | A registrar: Cloudflare Registrar, Namecheap, GoDaddy, BigRock… | about ₹600–1,500 a year (`.in` cheaper, `.com` / `.dev` more) |
| **Static hosting** | Serves the files in `dist/` over HTTPS, worldwide | Cloudflare Workers static assets (works with a private repository) | Free |
| **Backend** | Leaderboard, play counts, classes for training centres | Supabase (Postgres + anonymous sign-in + one Edge Function) | Free tier; Pro is $25/month when real classes depend on it |

How a visit works: the browser asks **DNS** where your domain lives → DNS answers with Cloudflare's servers → Cloudflare sends the files → the games run in the browser and talk to Supabase directly for scores and classes.

A VM would only make sense if you had your own server code to run. You don't: Supabase is your server.

---

## Step 1: put the code on GitHub (once)

```bash
git remote add origin https://github.com/YOUR-USERNAME/break-the-cloud.git
```
```bash
git push -u origin main
```

The repository can stay **private**. On every push, GitHub Actions (`.github/workflows/test.yml`) runs the unit tests and checks that the site builds. A green ✓ in the **Actions** tab means nothing broke. GitHub does not publish the site; Cloudflare does (Step 4).

## Step 2: set up Supabase (the backend)

1. Create a free project at supabase.com. Pick the **Mumbai (ap-south-1)** region: closest to students in India.
2. **Authentication → Sign In / Providers → Anonymous sign-ins: on.**
3. On your Mac, link the project and create the tables (this applies both migrations: the leaderboard and classes):

```bash
supabase login
```
```bash
supabase link --project-ref YOUR-PROJECT-REF
```
```bash
supabase db push
```
```bash
supabase functions deploy finish-run
```

4. Note the **Project URL** and the **anon / publishable key** (Supabase → Project Settings → API). You add them to Cloudflare in Step 4. The anon key is meant to be public; never put the `service_role` or secret key anywhere in the site, GitHub or Cloudflare.

## Step 3: buy the domain

1. Use **Cloudflare Registrar** (dash.cloudflare.com → **Domain Registration → Register Domains**): it sells at cost with no markup, and the domain then sits next to the hosting, so DNS and HTTPS are set up for you. It takes a card or PayPal (not UPI). If you buy elsewhere (BigRock, GoDaddy India accept UPI), you will add the domain to Cloudflare in Step 4 and change its nameservers at that registrar.
2. Buy it for 1–2 years and turn on **auto-renew**. A lapsed domain can be bought by someone else.
3. Keep the registrar account safe (two-factor login): whoever controls it controls the site.

## Step 4: host the site on Cloudflare and attach the domain

Live setup: **https://breakthecloud.dev**, served by a Cloudflare Worker named `break-the-cloud` with static assets. The repo's `wrangler.jsonc` says where the built files are (`dist/`), which domains the site answers on (`breakthecloud.dev`, `www.breakthecloud.dev`), and turns off the `*.workers.dev` address.

1. dash.cloudflare.com → **Workers & Pages → Create → Import a repository** → connect GitHub (only this repository) → pick `break-the-cloud`.
2. Settings:
   - **Project name:** `break-the-cloud` (must match `name` in `wrangler.jsonc`)
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy` (the default)
   - **Advanced settings → Build variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (from Step 2) and `NODE_VERSION` = `22`. Leave **API token** empty: Cloudflare creates the build token itself.
3. **Deploy.** Every push to `main` builds and deploys again in about a minute (**Deployments** tab shows the log).
4. Domains: listed in `wrangler.jsonc` under `routes`, so a deploy attaches them, creates the DNS records and issues HTTPS certificates. With a domain bought on Cloudflare there is nothing else to do. A new domain can take up to an hour before every network can resolve it.
5. Supabase values changed later? Edit them under **Settings → Build → Variables and secrets** and redeploy: they are baked in at build time.

### Alternative: GitHub Pages

Only for a **public** repository on a free GitHub account (private needs a paid plan). Add a Pages deploy job to the workflow (`actions/upload-pages-artifact` + `actions/deploy-pages`), turn on **Settings → Pages → Source: GitHub Actions**, add the two `VITE_SUPABASE_*` values as repository secrets, and point the domain at GitHub (`A` records `185.199.108.153`–`185.199.111.153`, `CNAME www` → `YOUR-USERNAME.github.io`).

## Step 5: check it

- Open `https://breakthecloud.dev/` on a phone and a laptop. Play one game to the end: the result card should say “Posted”.
- Create a test class at `https://breakthecloud.dev/#/classes/new`, join it from another browser, play, and open the instructor link.
- In Supabase: **Authentication → URL Configuration → Site URL** = your domain.

## Later updates

Edit, then:

```bash
git add -A
```
```bash
git commit -m "Describe the change"
```
```bash
git push
```

GitHub runs the tests and Cloudflare redeploys in about a minute (watch it under **Workers & Pages → break-the-cloud → Deployments**). If you add a new file to `supabase/migrations/`, also run `supabase db push`.

## Before a training centre relies on it

- **Supabase free projects pause after a week with no activity.** Upgrade to Pro ($25/month) before a centre uses it in class, or the first lab of the week starts with a paused database.
- Keep a list of class codes and who you gave them to (centre, contact, date). The instructor link is shown once: store it in your password manager.
- Back up: Supabase Pro has daily backups; on the free tier, export the `runs` and `classes` tables occasionally (Table editor → Export).
- Add cookieless analytics if you want page views (Cloudflare Web Analytics is free), and mention it on the privacy page.
