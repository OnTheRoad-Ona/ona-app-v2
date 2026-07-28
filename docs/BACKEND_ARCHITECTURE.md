# Ona Backend Architecture

## Overview

Ona is a two-sided marketplace connecting motorists with repair professionals (mechanics, vulcanizers, tow trucks, etc.) in Nigeria. The backend is a Next.js 16 App Router monolith backed by Supabase (PostgreSQL).

**Key principles:**
- Nigeria-first (NGN, Africa's Talking SMS, Flutterwave payments)
- Mobile-first (iPhone 16 393x844 phone-shell UI)
- Escrow-based payments with full dispute lifecycle
- Service-role server pattern (most API routes bypass RLS via admin Supabase client)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2.10 (App Router) |
| Language | TypeScript (strict) |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth + service-role admin |
| Payments | Flutterwave (primary), Paystack (secondary) |
| SMS | Africa's Talking |
| Email | Resend |
| Maps | Leaflet/OSM + Google Maps fallback |
| Validation | Zod v4 |

---

## Project Structure

```
src/
  app/api/             — Route handlers (Next.js App Router)
    auth/              — Signup, login, OTP, password management
    jobs/              — Job CRUD, transitions, offers, disputes
    pros/              — Pro profiles, live status, reviews
    payments/          — Init, verify, release, refund, payout
    profile/           — Profile update
    messages/          — In-app messaging
    calls/             — WebRTC signaling
    admin/             — Admin panel RBAC
    verify/            — NIN, BVN, identity verification
    health/            — Health check
    config/            — Public config
    log-error/         — Client-side error logging
    notifications/     — Push notification management
    sessions/          — User sessions
    liveness/          — Face liveness verification
    reverse-geocode/   — Reverse geocoding
    artisan/           — Artisan onboarding
    addresses/         — Saved addresses

  lib/
    server/            — Server-only modules
      modules/         — Admin submodules (RBAC, audit, security, etc.)
        admin-roles/   — L1-L5 admin RBAC
        audit/         — Audit logging
        security/      — Rate limiting, security policies
        support/       — Customer support tools
        wallet/        — Wallet (stubs)
        settings/      — App settings
      jobs/            — Job store (CRUD, transitions)
      payments/        — Escrow store, providers, payout settlement
      auth/            — Server auth utilities
      db/              — Database utilities
      google-eta.ts    — Google Distance Matrix ETA
      api-json.ts      — Response helpers (apiOk / apiFail)
      africastalking.ts — SMS helper

    supabase/          — Supabase client config
      server.ts        — Service-role client
      app-api.ts       — Client-side API layer (1573 lines)
      admin.ts         — Admin auth client
      mappers.ts       — DB row → TS type mappers
      env.ts           — Environment config

    jobs/              — Shared job domain
      types.ts         — Job record types
      constants.ts     — Negotiation, payment, dispute constants
      state-machine.ts — Pure transition engine

    types.ts           — Shared app types
    pricing.ts         — Service charge split (87.5/5/7.5)
    store.tsx          — Monolithic React context provider
```

---

## API Response Format

All routes use a consistent response format:

```ts
// Success
{ ok: true, data: T }

// Error
{ ok: false, error: { code: string, message: string, ...extra } }
```

Helpers: `apiOk(data)`, `apiFail(message, status?, code?, extra?)` in `src/lib/server/api-json.ts`

---

## Authentication

### Client Auth
1. User signs up via `/api/auth/signup` (service-role creates Supabase Auth user)
2. User logs in via OTP (phone SMS) or password
3. Access token stored in memory/headers for subsequent API calls

### API Auth Pattern
Every route follows this pattern:
1. Extract `access_token` from Authorization header or request body
2. Create anonymous Supabase client with token
3. Call `supabase.auth.getUser(access_token)` to validate
4. Extract `userId` from validated user

### Admin Auth
Multi-level RBAC (L1-L5):
- Cookie-based admin session
- Per-path access control
- Idle timeout
- Sensitive-action unlock codes
- Audit logging

---

## Job Lifecycle (Escrow)

```
negotiating ──ACCEPT_OFFER──> agreed ──PAYMENT_SUCCESS──> paid_booked
  │  │                          │                            │
  │  └──EXPIRE_NEGOTIATION──> expired   CANCEL──> cancelled   │
  │                                                            │
  └──CANCEL──> cancelled              START_TRIP──> en_route
                                                      │
                                              MARK_ARRIVED──> arrived
                                                                │
                                                        START_WORK──> in_progress
                                                                        │
                                                                MARK_COMPLETED──> completed
                                                                                  │
                                                                          SATISFIED──> satisfied
                                                                                          │
                                                                                  RELEASE──> released
```

Disputes can be opened at any stage (paid_booked through released) and follow:
```
disputed ──RESOLVE_DISPUTE──> released | refunded
    │
    └──OPEN_APPEAL──> under_appeal ──RESOLVE_APPEAL──> released | refunded
```

---

## Payment Pipeline

1. Customer agrees on price → status `agreed`
2. Customer pays via Flutterwave → status `paid_booked`, escrow `held`
3. Pro completes work → status `completed`
4. Customer confirms satisfaction → status `satisfied`
5. System releases payout → escrow `release_pending` → `pending_settlement` → `released`

**Settlement split (service charge S):**
- Pro: 87.5% (S - 5% Ona - 7.5% VAT)
- Ona: 5% (absorbs Flutterwave fees)
- VAT: 7.5% stays on Flutterwave

**Payout retry:** Every 10 min for 24h (max 144 retries) if Flutterwave balance insufficient.

---

## Database

### Key Tables
- `profiles` — User accounts (motorist + repair_pro dual role)
- `motorist_profiles` — Motorist-specific data
- `repair_pro_profiles` — Pro-specific data (services, bank, location, verification)
- `jobs` — Job records with full lifecycle
- `payments` — Escrow payment records
- `job_offers` — Negotiation offers
- `job_media` — Photos/voice notes
- `job_disputes` — Dispute records
- `payout_transfer_ledger` — Pro payout transfer audit (UNIQUE transfer_ref prevents double-pay)

### RLS Strategy
- Migration 031 hardened security: column-level grants, security-invoker views, table locking
- Most API routes use service-role client (bypasses RLS)
- RLS is defense-in-depth for direct DB access

### Migrations
34+ numbered migrations in `supabase/migrations/` with ISO date prefixes. Apply via `npm run db:apply`.

---

## Testing

Tests use Vitest and are co-located with source files as `__tests__/*.test.ts`.

**Test categories:**
- State machine tests (pure function, no mocking)
- Constants/pricing tests (pure function)
- API response helpers
- Escrow store tests (memory fallback)
- Payout settlement tests (pure functions)
- Africa's Talking helper tests
- Route handler integration tests (mocked Supabase)

Run: `npm test`
Watch: `npm run test:watch`

---

## Key Developer Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start dev server on :3000 |
| `npm run dev:admin` | Start admin panel on :4500 |
| `npm run db:setup` | Apply schema + seed admin + sync DB |
| `npm run db:apply` | Apply pending migrations |
| `npm run db:sync` | Sync DB to latest state |
| `npm run test` | Run all tests |
| `npm run lint` | Run ESLint |
| `npm run build` | Production build |

---

## Environment Variables

See `.env.example` for full list. Key variables:
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — Supabase
- `FLUTTERWAVE_SECRET_KEY` — Payment processing
- `AT_USERNAME` + `AT_API_KEY` — SMS OTP
- `RESEND_API_KEY` — Email
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — Maps
