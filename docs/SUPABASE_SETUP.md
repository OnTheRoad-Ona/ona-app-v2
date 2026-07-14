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

| Project | Domain | Command notes |
|---------|--------|----------------|
| `ogamecho` | https://ogamecho.vercel.app | public app |
| `ogamecho-backend` | https://ogamecho-backend.vercel.app | admin + APIs |

Add the same Supabase + Maps env vars in both projects.  
**Only** `ogamecho-backend` needs `SUPABASE_SERVICE_ROLE_KEY`.

You must run `npx vercel login` once before deploy.
