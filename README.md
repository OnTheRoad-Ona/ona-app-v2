# Ona

Nigeria-first live dispatch: motorists and repair pros (14 trades), escrow jobs, Shop, Express, admin.

This README is how to run the app. **Product and UI law live in docs — do not redesign from this page.**

| Start here | File |
|------------|------|
| Handover | [`docs/HANDOFF.md`](docs/HANDOFF.md) |
| Product rules | [`docs/RULES.md`](docs/RULES.md) |
| Visual freeze | [`docs/UI.md`](docs/UI.md) |
| Anti-regression | [`docs/ANTI_REGRESSION.md`](docs/ANTI_REGRESSION.md) |
| Code map | [`docs/CODEMAP.md`](docs/CODEMAP.md) |

## Stack

- **Next.js 16** App Router + **TypeScript**
- **Tailwind CSS** v4
- **Supabase** Postgres + Auth
- Mobile-first **phone shell** 390×844 (`#ona-phone`)
- Payments: Flutterwave (escrow jobs; Shop/Express separate)

## Run

```bash
npm install
cp .env.example .env.local   # example is incomplete — see docs/HANDOFF.md
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Admin: `npm run dev:admin` → [http://localhost:4500/admin](http://localhost:4500/admin).

## Scripts

- `npm run dev` — app on port 3000
- `npm run dev:admin` — admin on port 4500
- `npm run lint && npm run typecheck && npm run test` — **pre-merge gate**
- `npm run build` / `npm run start`

Never commit API keys. `.env.local` is gitignored. Ops notes: `docs/HANDOFF_KEYS.md`.
