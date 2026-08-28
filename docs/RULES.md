# Ona Product Rules — Frozen Reference

> **This document is the single source of truth for all Ona product rules.**
> Do not modify without explicit product approval.
> AI agents must not regenerate fee/assignment logic without human review.
>
> Handover index: `docs/HANDOFF.md`. Visual freeze: `docs/UI.md`. Anti-regression: `docs/ANTI_REGRESSION.md`.

---

## 1. Services (14 Total)

| Service | Call-Out Eligible | Base Fee (₦) |
|---------|-------------------|--------------|
| mechanic | ✅ | 3,000 |
| vulcanizer | ❌ | 1,500 |
| towing | ✅ | 4,000 |
| battery | ❌ | 2,000 |
| ac | ✅ | 2,500 |
| body | ✅ | 3,000 |
| electrical | ✅ | 2,500 |
| diagnostics | ✅ | 3,000 |
| fashion | ✅ | 1,500 |
| solar | ✅ | 3,000 |
| generator | ✅ | 2,500 |
| plumber | ✅ | 2,000 |
| carpenter | ✅ | 2,500 |
| painter | ✅ | 2,500 |

> **Rule:** `vulcanizer` and `battery` are **hard-excluded** from Call-Out fees (never charge, regardless of distance).

---

## 2. Call-Out Fee Engine

### Base Formula
```
Call-Out Fee = (Trade Base Fee + Distance Charge) × Urgency Multiplier
```

| Component | Calculation |
|-----------|-------------|
| **Base Fee** | Per trade (see table above) |
| **Distance Rate** | ₦350/km |
| **Minimum Billable Distance** | 0.5 km (0–500m bills as 0.5km) |
| **Billing Increment** | 0.1 km |
| **Maximum Radius** | 5 km |
| **Short Distance (<500m)** | Both Base + Distance reduced by 60% (×0.40) AFTER multiplier |

### Urgency Multipliers (Priority Order — Highest Wins)

| Priority | Condition | Multiplier |
|----------|-----------|------------|
| 1 | Night (9PM–5AM local) | 1.50× |
| 2 | Remote (4.95–5.00 km approved route) | 1.35× |
| 3 | Emergency (customer chip) | 1.25× |
| 4 | Normal | 1.00× |

**Rule:** Multipliers never stack — highest applicable wins.

### Excluded Trades
- `vulcanizer` — never charges Call-Out
- `battery` — never charges Call-Out

---

## 3. Payment Split (Total = Labour + Call-Out)

**Single Source of Truth:** `splitServiceChargeMinor(totalMinor)` in `src/lib/pricing.ts`

| Party | Share | Calculation |
|-------|-------|-------------|
| **Repair Pro** | 87.5% | `total - 5% - 7.5% VAT` |
| **Ona Platform** | 5% | Flutterwave fees come from this |
| **VAT (Nigeria)** | 7.5% | Held on Flutterwave, not transferred |

**Rule:** Split is always on **TOTAL** (labour + callout), never labour-only.

### Pro Net Payout
```
proNet = totalMinor - platformFeeMinor - vatMinor
       = totalMinor × 87.5%
```

---

## 4. Express (Ona Express)

| Trade | Fee |
|-------|-----|
| Mechanic | ₦20,000 |
| All other vehicle trades (towing, battery, ac, body, electrical, diagnostics) | ₦15,000 |

**Rules:**
- No SSPE (Single-Source Provider Engine) — direct assignment
- No Accept/Reject after final assignment
- Fixed price, no negotiation

---

## 5. Call-Out Distance Rules

| Rule | Value |
|------|-------|
| Rate | ₦350/km |
| Minimum billable | 0.5 km (0–500m) |
| Billing increment | 0.1 km |
| Maximum radius | 5 km |
| Short distance (<0.5km) | Base + Distance × 0.40 AFTER multiplier |

---

## 6. Cancellation States

| State | When | Call-Out Fee |
|-------|------|--------------|
| **BEFORE_TRAVEL** | Pro hasn't left | Full refund (Call-Out waived) |
| **TRAVELLING** | Pro en route | Call-Out due |
| **ARRIVED** | Pro on site | Full Call-Out due |

---

## 6. Express Cancellation

| State | Rule |
|-------|------|
| Express assigned | Pro cannot reject after final assignment |
| Customer cancels BEFORE_TRAVEL | Full refund |

---

## 7. Shop (Ona Shop)

- **Catalog:** Automedics live catalog only (real SKUs, not demo)
- **Categories:** 18 categories (batteries, engine-oil, brake-pads, etc.)
- **Pricing:** Naira major units, `null` = contact for price
- **No demo products in production flows**

---

## 8. Payment Split Constants (Code Reference)

```typescript
// src/lib/pricing.ts
export const PLATFORM_COMMISSION_PERCENT = 5;
export const VAT_PERCENT_NG = 7.5;
export const PRO_NET_PAYOUT_PERCENT = 87.5; // 100 - 5 - 7.5
export const MAX_DISCOUNT_PERCENT = 50;
export const MIN_OFFER_AMOUNT_MAJOR = 120; // ₦120 minimum labour
```

---

## 9. Timing Constants

| Constant | Value |
|----------|-------|
| Negotiation window | 20 minutes |
| SSPE dispatch window | 144 seconds |
| Max pairing offers/wave | 6 |
| Second pro delay | 60 minutes |
| Payment window | 11 minutes |
| Max payment attempts | 3 |
| Pay-to-book window | 30 minutes |
| Booked completion window | 6 hours |
| Auto-release window | 6 hours |
| Satisfied reminder | 1 hour |
| Appeal window | 48 hours |
| Post-release dispute | 48 hours |

---

## 10. Protected Files (AI Must Not Regenerate)

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

## 11. Enforcement

- **AI agents must not modify** fee/assignment logic in protected files without explicit human approval
- Any change to fee constants, split logic, or callout rules requires human review
- Tests in `src/lib/callout/__tests__/` and `src/lib/__tests__/pricing.test.ts` are the contract — they must pass