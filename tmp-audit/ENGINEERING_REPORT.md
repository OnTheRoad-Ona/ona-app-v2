# Ona App — Production Hardening Report (Cycles 1–4)

**Status:** COMPLETE  
**Environment:** Local `localhost:3000` / `4500`  
**Final harness:** **36/36 PASS**, 0 critical findings  
**Unit tests:** **248/248 PASS**  
**Stress:** **1000 logins** (batches of 50) → **0× 5xx**, ~9.9 ms avg  

---

## What was fixed (all cycles)

### Security / auth
- Jobs + payments APIs require Bearer; actors bound to session  
- Mass IDOR closed: sessions, addresses, notifications, wallet, cashout, liveness, reviews, artisan, call, messages, referral, payment history/init/resolve  
- Pro Live/Away no longer accepts bare `userId` spoof  
- Login freeze no longer auto-revives; no auto-merge on login  
- Client demo OTP cannot self-assert `phoneVerified`  
- Dispute/appeal resolve = admin only  
- Logout ignores bare `userId`  

### Matching / marketplace
- Failover sweep uses `flow_status`  
- Reassignment same trade + radius + heartbeat  
- Offers cleared on reassignment  
- Pro Away → reassign negotiating jobs  

### Payments / wallet
- Flutterwave refund **attempt** + ledger status  
- Cashout holds credits; optional SQL `credit_wallet_debit` (migration 045)  
- In-process wallet mutex  

### Client
- `authFetch` helper wires Bearer on protected UI calls (notifications, wallet, sessions, call, messages, history, bank resolve, security actions, etc.)  
- Payment callback uses auth for pay cancel + job fetch  

### Rate limits / ops
- Login, signup, OTP send, resolve-account, pay-verify throttled  
- Optional Upstash Redis via `rateLimitAsync` when env set  
- Cron / expire-stale fail-closed outside local  

### Schema (files ready — apply in Supabase SQL editor)
- `20260801_044_payments_provider_ref_unique.sql`  
- `20260801_045_credit_wallet_atomic_debit.sql`  

### Tooling
- Synthetic seed/cleanup scripts  
- `scripts/audit-harness.mjs` (security + auth + job decline + stress)  
- Wipe list expanded for credit/identity/ledger tables  

---

## Manual steps for you
1. In Supabase SQL editor, run migrations **044** and **045**  
2. Optional: set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` for multi-instance rate limits  

## Remaining residual (low priority)
- `/signup` page returns 404 (routes under `/signup/motorist` etc. — not a security issue)  
- True multi-region Redis still env-dependent  
- Full Flutterwave refund success depends on live gateway + tx ids  

---

**Done. Production-hardening mission closed for local Ona stack.**
