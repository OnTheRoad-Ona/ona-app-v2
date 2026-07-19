# OgaMecho — Vercel deploy

You must be logged in first:

```bash
cd "/Users/mac/Desktop/Code/OGA MECHO"
npx vercel login
```

## Important: one app, one project (recommended)

OgaMecho is a **single Next.js app** (public UI + `/admin` + all `/api/*` routes).

| Surface | Local | Production (current team **wit7**) |
|---------|-------|-------------------------------------|
| Public app | http://localhost:3000 | **https://ogamecho-mi.vercel.app** |
| Admin / backend | http://localhost:4500/admin | **https://ogamecho-backend-mi.vercel.app/admin** |

**Account:** `oluwatosinabdullahime@gmail.com` · team **WIT** (`wit7`)

| Project | Domain | Role |
|---------|--------|------|
| `ogamecho` | https://ogamecho-mi.vercel.app | Public consumer app |
| `ogamecho-backend` | https://ogamecho-backend-mi.vercel.app | Admin + APIs (same codebase, service role env) |

Local project links: `.vercel` → app · `.vercel-backend` → backend  

The old domains `ogamecho.vercel.app` / `ogamecho-backend.vercel.app` belong to the blocked **Wavers Initiative Team** Hobby account — do not use them until that team is unblocked.

## Project A — `ogamecho` (primary)

```bash
npx vercel --yes --name ogamecho
# Only when you explicitly want production:
# npx vercel --prod --yes --name ogamecho
```

Alias: **https://ogamecho.vercel.app**

### Required env (Production)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon / publishable key |
| `SUPABASE_URL` | Same URL (server) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service/secret key (server APIs + admin) |
| `SUPABASE_SECRET_KEY` | Optional alias for service key |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Maps |
| `NEXT_PUBLIC_USE_LIVE_MAPS` | `true` |
| `NEXT_PUBLIC_APP_URL` | `https://ogamecho.vercel.app` (payments, emails) |

Optional: payment / SMS / Resend keys as in `.env.example`.

## Project B — `ogamecho-backend` (optional / legacy)

```bash
npx vercel --yes --name ogamecho-backend
```

Alias: **https://ogamecho-backend.vercel.app**  
Same env as primary (including service role). Prefer routing staff to **ogamecho.vercel.app/admin** instead.

## “This deployment is temporarily paused”

If both domains return **HTTP 402** / `DEPLOYMENT_DISABLED`:

1. Open [Vercel Dashboard](https://vercel.com/dashboard) → team **Wavers Initiative Team**
2. Check **Usage** / **Billing** — Hobby soft-block is often:
   - **`FAIR_USE_LIMITS_EXCEEDED`**
   - overage type **`fastOriginTransfer`** (Fast Origin Transfer)
3. Fix options:
   - Wait for the **monthly usage cycle** to reset, or  
   - **Upgrade** the team plan (Pro), or  
   - Reduce transfer (fewer production deploys, single project, less polling / large media)
4. Redeploying **will not** unpause while the team is soft-blocked.

Code and env can be correct while the **whole team** is paused.

## After the pause lifts

1. Open https://ogamecho.vercel.app  
2. Admin: https://ogamecho.vercel.app/admin/login  
3. Restrict Google Maps key referrers to production domains  

## Local ports

| Surface | URL |
|---------|-----|
| Public OgaMecho | http://localhost:3000 |
| Admin (same codebase) | http://localhost:4500/admin |

```bash
npm run dev          # public
npm run dev:admin    # admin on 4500
```
