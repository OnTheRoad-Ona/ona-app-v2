# Ona Code Map — "Fees Live Here, Express Lives Here, Shop Lives Here"

> **Map only, not a spec.** Product law is `docs/RULES.md` + `docs/ANTI_REGRESSION.md`. Visual law is `docs/UI.md`. Start at `docs/HANDOFF.md`.
>
> Express fees live in `src/lib/express/pricing.ts` (not `pricing.ts:61`).
> Duplicate trees / repeated section numbers below are historical; use the tables.

---

## Domain Map

```
src/
├── lib/
│   ├── callout/           # CALL-OUT ENGINE (server-owned)
│   │   ├── constants.ts   # Fees, multipliers, rules (FROZEN)
│   │   ├── engine.ts      # Pure pricing + eligibility (server)
│   │   ├── payable.ts     # payableCalloutMajor(), jobTotalMajor(), getDisplayTotalMajor()
│   │   ├── urgency.ts     # Multiplier resolution
│   │   └── __tests__/     # Engine + payable tests
│   ├── pricing.ts         # SPLIT LOGIC (FROZEN)
│   │   ├── splitServiceChargeMinor()   -- 87.5/5/7.5 on TOTAL
│   │   ├── buildCustomerChargeMajor()  -- labour + callout = total
│   │   └── splitServiceChargeMinor()   -- core split
│   ├── pricing.test.ts    # Split contract tests
│   ├── server/
│   │   ├── payments/
│   │   │   ├── payout-settlement.ts   -- attemptProPayout(), split95_5(total)
│   │   │   ├── escrow-store.ts
│   │   │   └── providers.ts
│   │   └── jobs/
│   │       └── job-store.ts           -- splitMinor(total) for escrow
│   ├── jobs/
│   │   ├── constants.ts    -- All timing, fees, statuses (FROZEN)
│   │   ├── client.ts       -- API client
│   │   ├── state-machine.ts
│   │   └── types.ts        -- JobRecord, CalloutQuote (snake_case aliases)
│   ├── shop/
│   │   ├── automedics-catalog.ts   -- Real SKUs (18 categories)
│   │   ├── demo-catalog.ts         -- Demo only (not prod)
│   │   └── client.ts               -- API client
│   ├── pricing.ts          -- CENTRAL SPLIT LOGIC
│   ├── callout/            -- Call-out engine
│   ├── jobs/               -- Job flow, constants, types
│   ├── shop/               -- Shop catalog + client
│   ├── server/
│   │   ├── payments/       -- Escrow, payout, providers
│   │   └── jobs/           -- Job store, idempotency
│   ├── app-config.ts       -- Central env config (single source)
│   └── store.tsx           -- Client state (React context)
├── components/
│   ├── jobs/
│   │   ├── job-flow-screen.tsx     -- Main job UI (uses getDisplayTotalMajor)
│   │   ├── callout-fee-lines.tsx   -- Fee breakdown display
│   │   └── motorist-release-pay-gate.tsx  -- Release UI (uses getDisplayTotalMajor)
│   ├── shop/
│   │   ├── product-card.tsx
│   │   ├── product-sheet.tsx
│   │   └── shop-vehicle-bar.tsx
│   └── ui/                    -- shadcn/ui primitives
├── app/
│   ├── dashboard/             -- Pro dashboard (Payment processing section)
│   ├── jobs/                  -- Job flow pages
│   ├── payments/              -- Checkout, verify, release
│   ├── shop/                  -- Shop pages
│   ├── dashboard/             -- Pro dashboard
│   ├── api/
│   │   ├── jobs/              -- Job CRUD, callout, transitions
│   │   ├── payments/          -- Verify, release, refund
│   │   ├── shop/              -- Catalog, search, cart
│   │   └── auth/              -- OTP, login, signup
│   └── api/
│       ├── jobs/
│   │   └── callout/route.ts      -- Server callout quote
│   │   └── [id]/route.ts         -- Job transitions
│   └── api/
│       ├── payments/
│   │   ├── verify/route.ts       -- Flutterwave verify → held
│   │   ├── release/route.ts      -- Dual confirm → attemptProPayout
│   │   └── refund/route.ts
│   └── shop/...
├── components/
│   ├── ui/                 -- shadcn/ui primitives (Button, Card, etc.)
│   ├── jobs/               -- Job flow UI
│   ├── shop/               -- Shop UI
│   └── ui/                 -- Primitives
└── lib/
    ├── app-config.ts          -- Central env config (single source)
    ├── pricing.ts             -- Split logic (FROZEN)
    ├── callout/               -- Call-out engine
    ├── jobs/                  -- Job constants, types, client
    └── shop/                  -- Shop catalog + client
```

---

## 1. Fees Live Here

| Concern | File | Function |
|---------|------|----------|
| **Total split (87.5/5/7.5)** | `src/lib/pricing.ts:45` | `splitServiceChargeMinor(totalMinor)` |
| **Total split (alias)** | `src/lib/server/payments/payout-settlement.ts:178` | `split95_5(totalMinor)` |
| **Checkout display** | `src/lib/pricing.ts:65` | `buildCustomerChargeMajor(labour, callout)` |
| **Display total** | `src/lib/callout/payable.ts:63` | `getDisplayTotalMajor()` |
| **Server payout** | `src/lib/server/payments/payout-settlement.ts:286` | `split95_5(total)` |
| **Release UI** | `src/components/jobs/motorist-release-pay-gate.tsx:437` | `proShare = total * 0.875` |
| **Job store mock** | `src/lib/server/jobs/job-store.ts:3938` | `splitMinor(total)` |
| **Constants** | `src/lib/pricing.ts:12` | `PLATFORM_COMMISSION_PERCENT=5`, `VAT_PERCENT_NG=7.5`, `PRO_NET_PAYOUT_PERCENT=87.5` |

**Rule:** All splits use `total` (labour + callout). Never `labour` alone.

---

## 2. Express Lives Here

| Concern | File |
|---------|------|
| **Fees** | `src/lib/express/pricing.ts` — Mechanic ₦20k, others ₦15k |
| **Question Engine** | `src/lib/express/question-engine.ts` |
| **No SSPE** | `src/lib/express/question-engine.ts` (no SSPE logic) |
| **Assignment** | `src/app/api/jobs/[id]/transition/route.ts` |
| **UI** | `src/components/jobs/job-flow-screen.tsx` (Express section) |
| **Constants** | `src/lib/jobs/constants.ts` — `EXPRESS_*` constants |

---

## 3. Shop Lives Here

| Concern | File |
|---------|------|
| **Catalog** | `src/lib/shop/automedics-catalog.ts` — Real SKUs (18 categories) |
| **Demo** | `src/lib/shop/demo-catalog.ts` — Demo only |
| **API Client** | `src/lib/shop/client.ts` |
| **Taxonomy** | `src/lib/shop/taxonomy.ts`, `trade-attributes.ts` |
| **Catalog Status** | `src/lib/shop/catalog-status.ts` |
| **UI** | `src/app/shop/page.tsx`, `src/components/shop/` |
| **API** | `src/app/api/shop/` (home, search, products, cart, checkout) |

---

## 3. Call-Out Engine

| Concern | File |
|---------|------|
| **Constants** | `src/lib/callout/constants.ts` (fees, multipliers, rules) |
| **Engine** | `src/lib/callout/engine.ts` (pure pricing + eligibility) |
| **Payable** | `src/lib/callout/payable.ts` (payableCalloutMajor, jobTotalMajor, getDisplayTotalMajor) |
| **Urgency** | `src/lib/callout/urgency.ts` |
| **Tests** | `src/lib/callout/__tests__/engine.test.ts` |

---

## 3. Job Flow & State Machine

| Concern | File |
|---------|------|
| **Constants** | `src/lib/jobs/constants.ts` (all timing, fees, statuses) |
| **State Machine** | `src/lib/jobs/state-machine.ts` |
| **Client API** | `src/lib/jobs/client.ts` |
| **Types** | `src/lib/jobs/types.ts` (JobRecord, CalloutQuote) |
| **Server Store** | `src/lib/server/jobs/job-store.ts` |
| **UI** | `src/components/jobs/job-flow-screen.tsx` |

---

## 4. Payments & Escrow

| Concern | File |
|---------|------|
| **Escrow Store** | `src/lib/server/payments/escrow-store.ts` |
| **Payout Settlement** | `src/lib/server/payments/payout-settlement.ts` (attemptProPayout) |
| **Providers** | `src/lib/server/payments/providers.ts` (Flutterwave/Paystack) |
| **API Routes** | `src/app/api/payments/` (verify, release, refund) |
| **Release UI** | `src/components/jobs/motorist-release-pay-gate.tsx` |

---

## 4. Shop & Catalog

| Concern | File |
|---------|------|
| **Real Catalog** | `src/lib/shop/automedics-catalog.ts` (18 categories, real SKUs) |
| **Demo Catalog** | `src/lib/shop/demo-catalog.ts` (isolated, not prod) |
| **Taxonomy** | `src/lib/shop/taxonomy.ts`, `trade-attributes.ts` |
| **Client** | `src/lib/shop/client.ts` |
| **UI** | `src/app/shop/page.tsx`, `src/components/shop/` |

---

## 5. Express (Ona Express)

| Concern | File |
|---------|------|
| **Fees** | `src/lib/express/pricing.ts` — Mechanic ₦20k, others ₦15k |
| **Question Engine** | `src/lib/express/question-engine.ts` |
| **No SSPE** | `src/lib/express/question-engine.ts` |
| **Assignment** | `src/app/api/jobs/[id]/transition/route.ts` |

---

## 5. Configuration & Types

| Concern | File |
|---------|------|
| **Central Config** | `src/lib/app-config.ts` (all env, validated) |
| **Job Types** | `src/lib/jobs/types.ts` (JobRecord, CalloutQuote) |
| **Callout Types** | `src/lib/callout/constants.ts` (CalloutQuote) |
| **Pricing Constants** | `src/lib/pricing.ts` (top of file) |
| **Job Constants** | `src/lib/jobs/constants.ts` (all timing, fees) |

---

## 6. Tests Map

| Test File | Covers |
|-----------|--------|
| `src/lib/__tests__/pricing.test.ts` | `splitServiceChargeMinor`, `buildCustomerChargeMajor` |
| `src/lib/callout/__tests__/engine.test.ts` | `billableDistanceKm`, `calculateCalloutFee`, `isCalloutExcludedTrade`, `resolveCalloutEligibility`, `classifyRequest` |
| `src/lib/callout/__tests__/payable.test.ts` | `payableCalloutMajor`, `jobTotalMajor`, `composeCustomerPayableMajor` |
| `src/lib/callout/__tests__/urgency.test.ts` | `calloutUrgencyMultiplier` |
| `src/lib/jobs/__tests__/*.test.ts` | State machine, pairing, evidence |
| `src/lib/notifications/__tests__/*.test.ts` | Toast gating, stack rules |

---

## 7. Protected Files (AI Must Not Regenerate)

```
src/lib/callout/constants.ts
src/lib/callout/engine.ts
src/lib/callout/payable.ts
src/lib/pricing.ts
src/lib/callout/payable.ts
src/lib/callout/__tests__/engine.test.ts
src/lib/callout/__tests__/payable.test.ts
src/lib/pricing.ts
src/lib/pricing.test.ts
src/lib/server/payments/payout-settlement.ts
src/lib/server/jobs/job-store.ts
src/lib/jobs/constants.ts
src/components/jobs/callout-fee-lines.tsx
src/components/jobs/motorist-release-pay-gate.tsx
src/components/jobs/job-flow-screen.tsx (display logic only)
src/app/dashboard/page.tsx
src/components/jobs/callout-fee-lines.tsx
src/lib/app-config.ts
src/lib/jobs/types.ts
src/lib/callout/constants.ts
supabase/migrations/20260827_021_display_total_fix.sql
```

---

## 7. Quick Commands

```bash
npm run dev          # http://localhost:3000
npm run dev:admin    # http://localhost:4500/admin
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
npm run test:watch   # vitest watch
npm run db:apply     # Apply migrations
npm run db:sync      # Sync DB
```

---

## 8. Protected Files (AI Must Not Regenerate)

See `docs/RULES.md` — full list of 20+ files that AI must not regenerate without human approval.