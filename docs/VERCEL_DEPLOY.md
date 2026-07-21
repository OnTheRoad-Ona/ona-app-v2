# Ona — Vercel deploy

You must be logged in first:

```bash
cd "/Users/mac/Desktop/Code/OGA MECHO"
npx vercel login
```

## Important: one app, one project (recommended)

Ona is a **single Next.js app** (public UI + `/admin` + all `/api/*` routes).

| Surface | Local | Production (team **wit7**) |
|---------|-------|-------------------------------------|
| Public app | http://localhost:3000 | **https://ona-mi.vercel.app** |
| Admin / backend | http://localhost:4500/admin | **https://ona-backend.vercel.app/admin** |

**Account:** `oluwatosinabdullahime@gmail.com` · team **WIT** (`wit7`)

| Project | Domain | Role |
|---------|--------|------|
| `ona-mi` (was `ogamecho`) | https://ona-mi.vercel.app | Public consumer app |
| `ona-backend` (was `ogamecho-backend`) | https://ona-backend.vercel.app | Admin + APIs (same codebase, service role env) |

Local project links: `.vercel` → app · `.vercel-backend` → backend  

Legacy aliases (may still resolve): `ogamecho-mi.vercel.app`, `ogamecho-backend-mi.vercel.app`.

## Project A — frontend (`ogamecho` → ona-mi)

```bash
npx vercel --prod --yes
# Assign / confirm production domain:
npx vercel alias set <deployment-url> ona-mi.vercel.app
```

Production URL: **https://ona-mi.vercel.app**

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
| `NEXT_PUBLIC_APP_URL` | `https://ona-mi.vercel.app` (payments, emails) |

Optional: payment / SMS / Resend keys as in `.env.example`.

## Project B — backend (`ogamecho-backend` → ona-backend)

```bash
npx vercel --prod --yes --cwd . --local-config .vercel-backend
# or deploy with backend project link, then:
npx vercel alias set <deployment-url> ona-backend.vercel.app
```

Production URL: **https://ona-backend.vercel.app**  
Same env as primary (including service role). Staff can also use **https://ona-mi.vercel.app/admin**.

## After deploy

1. Open https://ona-mi.vercel.app  
2. Admin: https://ona-backend.vercel.app/admin/login (or https://ona-mi.vercel.app/admin/login)  
3. Restrict Google Maps key referrers to production domains  

## Local ports

| Surface | URL |
|---------|-----|
| Public Ona | http://localhost:3000 |
| Admin (same codebase) | http://localhost:4500/admin |

```bash
npm run dev          # public
npm run dev:admin    # admin on 4500
```
