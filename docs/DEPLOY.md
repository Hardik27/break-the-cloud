# Deploying Break the Cloud on your own domain

## How it works (no VM needed)

Break the Cloud is a **static site**: after `npm run build` it is just HTML, CSS and JavaScript files in `dist/`. Nothing runs on a server of yours. Every visitor's browser downloads those files and runs the games locally. So you do **not** rent a virtual machine (VM). You need three things:

| Piece | What it does | Who provides it | Cost |
|---|---|---|---|
| **Domain name** | The address people type, e.g. `breakthecloud.in` | A registrar: Cloudflare Registrar, Namecheap, GoDaddy, BigRock… | about ₹600–1,500 a year (`.in` cheaper, `.com` / `.dev` more) |
| **Static hosting** | Serves the files in `dist/` over HTTPS, worldwide | GitHub Pages (already set up in this repo) or Cloudflare Pages | Free |
| **Backend** | Leaderboard, play counts, classes for training centres | Supabase (Postgres + anonymous sign-in + one Edge Function) | Free tier; Pro is $25/month when real classes depend on it |

How a visit works: the browser asks **DNS** where your domain lives → DNS answers with GitHub's servers → GitHub sends the files → the games run in the browser and talk to Supabase directly for scores and classes.

A VM would only make sense if you had your own server code to run. You don't: Supabase is your server.

---

## Step 1: put the code on GitHub (once)

See the README section “Deploying to GitHub Pages”. In short:

```bash
git remote add origin https://github.com/YOUR-USERNAME/break-the-cloud.git
git push -u origin main
```

Then on github.com: **Settings → Pages → Source: GitHub Actions**. Every push now runs the tests and publishes the site to `https://YOUR-USERNAME.github.io/break-the-cloud/`.

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

4. In GitHub: **Settings → Secrets and variables → Actions**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Supabase → Project Settings → API). The anon key is meant to be public; never put the `service_role` key anywhere in the site or GitHub.
5. Push any commit (or Actions → Run workflow). The leaderboard and classes switch on.

## Step 3: buy the domain

1. Pick a registrar. **Cloudflare Registrar** sells at cost with no markup and has free DNS; Indian registrars (BigRock, GoDaddy India) accept UPI. Check that the name you want is free there.
2. Buy it for 1–2 years and turn on **auto-renew**. A lapsed domain can be bought by someone else.
3. Keep the registrar account safe (two-factor login): whoever controls it controls the site.

## Step 4: point the domain at GitHub Pages

In your registrar's **DNS** settings, add these records (replace `YOUR-USERNAME`):

| Type | Name | Value |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `YOUR-USERNAME.github.io` |

Then on GitHub: **Settings → Pages → Custom domain**: type your domain (e.g. `breakthecloud.in`), save, wait for the DNS check (minutes to a few hours), and tick **Enforce HTTPS**. GitHub gets a free HTTPS certificate for you.

If you use Cloudflare for DNS, set those records to **DNS only** (grey cloud) at first, so GitHub can issue the certificate.

## Step 5: check it

- Open `https://YOUR-DOMAIN/` on a phone and a laptop. Play one game to the end: the result card should say “Posted”.
- Create a test class at `https://YOUR-DOMAIN/#/classes/new`, join it from another browser, play, and open the instructor link.
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

GitHub tests and redeploys in about 2 minutes. If you add a new file to `supabase/migrations/`, also run `supabase db push`.

## Before a training centre relies on it

- **Supabase free projects pause after a week with no activity.** Upgrade to Pro ($25/month) before a centre uses it in class, or the first lab of the week starts with a paused database.
- Keep a list of class codes and who you gave them to (centre, contact, date). The instructor link is shown once: store it in your password manager.
- Back up: Supabase Pro has daily backups; on the free tier, export the `runs` and `classes` tables occasionally (Table editor → Export).
- Add cookieless analytics if you want page views (Cloudflare Web Analytics is free), and mention it on the privacy page.
