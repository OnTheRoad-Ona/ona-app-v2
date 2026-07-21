# OgaMecho — Supabase setup (new project)

## 1. Create project

1. Open https://supabase.com/dashboard
2. **New project**
   - Name: `oga-mecho`
   - Database password: generate and **save it**
   - Region: closest available (e.g. `eu-west-1` or `eu-central-1`)
3. Wait until the project is **Healthy**

## 2. Run SQL migration

1. Left menu → **SQL** → **New query**
2. Paste the full contents of:

   `supabase/migrations/20260714_001_init.sql`

3. **Run** (success = no errors)

## 3. Copy API keys

**Project Settings → API**

| Env var | Value |
|---------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key (**secret**) |

Paste into `.env.local` (never commit).

## 4. Auth settings

**Authentication → Providers → Email**

- Enable Email
- Disable “Confirm email” for faster local testing (optional), **or** keep on and use seed script (`email_confirm: true`)

## 5. Seed Super Admin

```bash
cd "/Users/mac/Desktop/Code/OGA MECHO"
npm run db:seed-admin
```

Credentials (from your approval):

- Email: `Oluwatosinabdullahime@gmail.com`
- Password: `Alliswell123$`
- Role: `admin`

## 6. Start admin backend

```bash
npm run dev:admin
open http://localhost:4500/admin/login
```

## 7. Vercel

| Project | Domain | Notes |
|---------|--------|--------|
| **`ogamecho`** (primary) | https://ona-mi.vercel.app | Public app **and** `/admin` + all APIs |
| `ogamecho-backend` (optional) | https://ona-backend.vercel.app | Same codebase; avoid if possible (extra bandwidth) |

Put the **same** Supabase + Maps env on `ogamecho`, including:

- `SUPABASE_SERVICE_ROLE_KEY` (needed for server APIs and admin — not backend-only)
- `NEXT_PUBLIC_APP_URL=https://ona-mi.vercel.app`

If production shows **“This deployment is temporarily paused”**, the team is soft-blocked (Hobby fair use / Fast Origin Transfer) — see `docs/VERCEL_DEPLOY.md`. Local `npm run dev` / `npm run dev:admin` still works with `.env.local`.

You must run `npx vercel login` once before deploy.
