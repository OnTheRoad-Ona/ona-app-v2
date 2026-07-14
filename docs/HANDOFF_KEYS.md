# Paste these after Supabase project is created

Edit `.env.local` (already gitignored):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Then:

1. Run SQL from `supabase/migrations/20260714_001_init.sql` in Supabase SQL editor  
2. `npm run db:seed-admin`  
3. Open http://localhost:4500/admin/login  
4. Login: `Oluwatosinabdullahime@gmail.com` / `Alliswell123$`

Reply in chat with the three Supabase values (or say “keys ready in .env.local”) and I will finish seed + verify login end-to-end.

For Vercel:

```bash
npx vercel login
```

Then follow `docs/VERCEL_DEPLOY.md` for:
- https://ogamecho.vercel.app  
- https://ogamecho-backend.vercel.app  
