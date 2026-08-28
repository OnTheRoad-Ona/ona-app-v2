# Ona — human developer handover

**Date:** 2026-08-28  
**Branch:** `main`  
**Do not rewrite the product or the visual system.** Finish, secure, and own.

This file is the index. Read it once, then follow the frozen docs and the code.

---

## Read in this order

1. This file
2. `docs/RULES.md` — fees, 14 trades, split, Express, timers
3. `docs/ANTI_REGRESSION.md` + `AGENTS.md` — bugs that already shipped once
4. `docs/UI.md` — phone shell, colour, chrome (do not restyle)
5. `src/lib/jobs/constants.ts` + `src/lib/jobs/state-machine.ts`
6. `docs/PAYOUT_SYNC_RELEASE.md` — job escrow transfers
7. Shop: `docs/ONA_SHOP_ARCHITECTURE.md` (boundaries) + `docs/ONA_SHOP_PHASE3_REPORT.md` (as-built)

Then `docs/CODEMAP.md` to find files. CODEMAP is a map, not a spec.

---

## Do not rebuild these (already shipped)

| Domain | Live source |
|--------|-------------|
| Call-out | `src/lib/callout/*` + tests |
| Split 87.5 / 5 / 7.5 on **total** (labour + call-out) | `src/lib/pricing.ts` |
| SSPE pairing (144s, 1–5 km) | `src/lib/server/pairing/pairing-engine.ts`, merit-engine, migration `047` |
| Job escrow + Flutterwave payout | `payout-settlement.ts`, `providers.ts` |
| Shop retail (not job escrow) | `src/lib/server/shop/*` |
| Express (no SSPE) | `src/lib/express/pricing.ts` |
| Phone shell / Call / Back | `docs/ANTI_REGRESSION.md`, `docs/UI.md` |

`docs/SSPE_REFACTOR_PLAN.md` is **historical**. Ignore 66s and 15–50 km.

---

## One product decision still open

**Wallet — pick one, then implement gaps:**

- **v1 as-built** (recommended default): `docs/DESIGN_wallet_cashout.md` + `src/lib/server/security/cashout-engine.ts` (`ona_cash_*`).
- **v2 draft:** `docs/WALLET_CASHOUT_DESIGN.md` — **not approved**. Collides with v1 and with Express migration `076`.

Do not invent a third ledger. Stub tables `wallet_accounts` stay unused.

---

## Docs that lie if you skip the stamp

| File | Treat as |
|------|----------|
| `README.md` | Run book only — not the product list |
| `CUSTOMER_CARE.md` | Ops workflow; **split is not 95/5** |
| `BACKEND_MIGRATION_PLAN.md` | Phase A history; much of B–D already exists |
| `BACKEND_ARCHITECTURE.md` | Jobs table is `service_requests`, not `jobs` |
| Wallet module README | Stub; live path is `security/cashout-engine.ts` |

---

## Leftover work (gap-fill, not redesign)

**Product / backend**

- Shop: no `/shop/search` page (API exists); no `/shop/saved` (table exists)
- Artisan onboarding still `localStorage` (`src/lib/artisan/local-store.ts`) while `/api/artisan/profile` exists
- Notification settings UI ≠ `/api/notifications/settings` contract
- Demo OTP `336699` allowed in production by default (`src/lib/auth/demo-otp.ts`) — turn off when SMS is live
- `.env.example` incomplete vs live (VAPID, cron secrets, FLW proxy, Redis, `OTP_DEMO_MODE`)
- In-memory fallbacks in `job-store.ts` `listJobsForUser` and `security-store.ts` (multi-instance risk)
- `split95_5` **name** still returns 87.5/5/7.5 — do not “fix” the name into 95/5 math

**UI/UX (finish inside the freeze — see `docs/UI.md`)**

- Settings: Export personal data, Blocked users still “coming soon”
- `/wallet` chrome still titled Referral & Earn; cashout UI is amount-only
- Notification settings still says “Server sync coming soon”
- God files: `job-store.ts` ~5k, `job-flow-screen.tsx` ~4.5k, `store.tsx` ~4k — split only with anti-regression smoke, never as a restyle

**Do not** redo incoming-request panel geometry, copper accent, 6px radius, or light `#c8c9cd` / dark black chrome.

---

## Run / gate

```bash
npm install
cp .env.example .env.local   # then fill real keys; example is incomplete
npm run dev                  # http://localhost:3000
npm run dev:admin            # http://localhost:4500/admin
```

Before any commit:

```bash
npm run lint && npm run typecheck && npm run test
```

`npm run lint` must have **0 errors**. Remaining items are warnings (unused vars, hook deps) — do not add `any`, and do not mix warning cleanup with a product change.

Smoke: `docs/ANTI_REGRESSION.md` §8 (Call, Chat, Back, multi-request, negotiate 20 min / 6 offers).

Production: https://ona-mi.vercel.app — ops keys in `docs/HANDOFF_KEYS.md` (never commit secrets).

---

## Protected files

Fee / assignment / timer files listed in `docs/RULES.md` §10. Do not regenerate. Change only with tests + human review.
