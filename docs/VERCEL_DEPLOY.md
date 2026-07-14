# OgaMecho — Vercel deploy

You must be logged in first:

```bash
cd "/Users/mac/Desktop/Code/OGA MECHO"
npx vercel login
```

## Project A — Public app

```bash
npx vercel --yes --name ogamecho
npx vercel --prod --yes --name ogamecho
```

Alias: **https://ogamecho.vercel.app**

Env vars:

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_USE_LIVE_MAPS=true`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Project B — Admin backend

```bash
npx vercel --yes --name ogamecho-backend
npx vercel --prod --yes --name ogamecho-backend
```

Alias: **https://ogamecho-backend.vercel.app**

Env vars (same as public **plus**):

- `SUPABASE_SERVICE_ROLE_KEY`  ← secret, backend only
- `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` (optional; seed is a one-time script)

## After deploy

1. Open https://ogamecho-backend.vercel.app/admin/login  
2. Sign in with seed admin  
3. Restrict Google Maps key referrers to both domains  

## Local ports

| Surface | URL |
|---------|-----|
| Public OgaMecho | http://localhost:3000 |
| Admin backend | http://localhost:4500/admin |
