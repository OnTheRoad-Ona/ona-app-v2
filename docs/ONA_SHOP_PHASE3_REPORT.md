# ONA Shop — Phase 3 Gap-Fill Report

Date: 2026-08-09 · Scope: audit + gap-fill (no rebuild) of the Phase 2 ONA Shop against the existing Ona design.

---

## 1. Approach

Phase 1–2 built the trade-aware catalog engine (smart search, fitment, filters, import pipeline, admin catalog CRUD, demo seed). Phase 3 audited what was missing between that backend and a production-ready retail shop, then filled the gaps: **server-authoritative money/delivery**, **atomic inventory**, **zone-based delivery**, **search ranking**, **idempotent checkout**, and **buyer + admin UI**. No existing Phase 1–2 design was rebuilt.

## 2. Scope guardrails honoured

- Ona is the **sole seller**; buyers are motorists **and** repair pros. No marketplace, no escrow on shop payments.
- Server controls price, delivery fee and totals. Client input is never trusted.
- Account context comes from the session (`profiles.role === "repair_pro"`); the `?ctx=` spoof path was removed.
- Job escrow flows, call/messages, navigation and negotiation were **not** touched.

## 3. Audit findings (summarised)

- **Backend**: CART partial · ORDERS partial (no idempotency, no reserve-on-pay) · PAYMENTS partial · DELIVERY **missing** (fee hardcoded ₦1,500 in UI) · INVENTORY partial (no atomic reserve) · SEARCH partial (no ranking) · ADMIN partial (no refund/cancel).
- **Frontend**: wired to the real backend but no dynamic filter UI, no delivery address/zone/fee UI, no variant/quantity selector, broken mock-payment flow.

## 4. Delivery engine (new)

`src/lib/server/shop/delivery.ts` — zone-based delivery:

- `computeDeliveryFee` (pure): zone surcharge + service base, free above threshold.
- `resolveDeliveryZone` / `getActiveDeliveryService` / `estimateDelivery` / `listDeliveryZones` / `listDeliveryServices`.
- Provider abstraction (`DeliveryProvider`, `DELIVERY_PROVIDERS`) with `OnaInternalDeliveryProvider` active; courier integration is a drop-in later.

## 5. Database (migration 20260809_059_shop_phase3.sql — applied)

- `shop_delivery_zones` seeded: `default` (Lagos Mainland), `island` (Lagos Island, +₦500 surcharge), `other`.
- `shop_delivery_services`: `ona_standard` base ₦1,500, free above ₦100,000.
- `user_addresses.delivery_zone_code`; `shop_orders` gained `checkout_token` (unique partial index), `refunded_at`, `delivery_zone_code`, `delivery_service_code`, `delivery_eta_minutes`.
- `shop_payments` gained `refunded_at`, `provider_txn_id`.
- `shop_deliveries` gained `zone_code/zone_name/service_code/eta_minutes`.
- Query indexes for product status/trade/brand and price lookups.
- Atomic RPCs granted to `service_role`:
  - `ona_shop_reserve(order_id, qty, tx_id) → boolean`
  - `ona_shop_release(order_id) → int`
  - `ona_shop_fulfill_deduct(order_id) → int`

## 6. Order engine (rewritten)

`src/lib/server/shop/orders.ts`:

- `createOrderFromCart` is **idempotent** on `checkout_token` (same cart + items → same order).
- `reserveInventoryForOrder` / `releaseInventoryForOrder` / `deductInventoryForOrder` wrap the atomic RPCs.
- `markShopOrderPaid` = reserve → mark paid → create delivery row (zone/service/ETA snapshot) → close cart → notify buyer.
- `cancelUnpaidOrder`, `refundShopOrder` (releases stock, refunds payment, cancels delivery, logs event).
- `getUserOrders`, `getOrderForUser` (includes items, delivery, payments, events).

## 7. Payment flow

`src/lib/server/shop/payments.ts` + `providers.ts`:

- `createShopPaymentAndInit` — idempotent per order, Flutterwave pay-now (no escrow).
- `initFlutterwave` for shop: description "Ona Shop purchase · Bank transfer only", `escrowMode: "none"`, `splitEnabled: false`, `shop: true`. Job escrow copy untouched.
- `verifyShopPayment` — on success: mark paid then reserve; **if stock ran out**, releases stock, marks order + payment `refunded` (`stock_unavailable`) and surfaces an honest error ("Payment received but the item went out of stock…").
- Mock amount check: mock verify carries no real amount, so the recorded payment amount is authoritative for `mock`.

## 8. Checkout API + UI

- `src/app/api/shop/checkout/route.ts` — requires `addressId`, persists the chosen zone on the address, computes delivery **server-side**, returns order + payment + delivery estimate. Token: `cart:{cartId}:{sha256(itemSig)…16}`.
- New `GET /api/shop/delivery/estimate?addressId=&subtotalMinor=&zoneCode=` for preview.
- Checkout page: saved-address selector + inline add, delivery-zone chips, server-computed fee + ETA, total reflects zone surcharge/free delivery.

## 9. Search ranking (Phase 3 ladder)

`src/lib/server/shop/search.ts` — `relevanceScore` implements the spec priority:

1. exact product name → 2. exact SKU/MPN/OEM (via `loadPartMatchMap` over `shop_product_variants`) → 3. exact brand → 4. contains part identity → 5. category/slug → 6. trade → 7. attribute value → 8. partial text → weak fallback.

Sort: relevance → fitment score → in stock → price. `brandName` was threaded into `ShopProductCard` and both `listProducts` selects + `getProductBySlug`.

## 10. Account context (spoof removed)

`resolveAccountContext(req)` in `catalog.ts` derives context from `getUserFromRequest` + `profiles.role` (guests → motorist). Swapped into `home`, `products`, `products/[slug]`, `search`, `all-parts` routes.

## 11. Dynamic filters (new UI + price facet)

- New `ShopFacetBar` (`src/components/shop/shop-facet-bar.tsx`) on trade pages: availability, price range, category chips, enum attribute chips; re-runs the locked-trade search with `category / minPrice / maxPrice / availability / attr.*` params.
- `ProductFilterOptions` gained `minPriceMinor` / `maxPriceMinor`; applied in `listProducts` via active prices sub-query.

## 12. Product page

Variant selector (option label/title/SKU, per-variant price, sold-out disabled), quantity stepper (clamped to available stock), stock availability surfaced per variant from `shop_inventory`, and add-to-cart with the selected variant + qty.

## 13. Order tracking

Order detail shows status, items with SKUs, delivery status/zone/service/ETA/address/courier, payment records + refund flag, and a chronological event timeline (`shop_order_events`).

## 14. Mock payment (shop-aware)

`/payments/mock-checkout` now detects `kind=ona_shop`: verifies via `/api/shop/payments/verify` and returns to `/shop/checkout/callback`. Job flow unchanged.

## 15. Admin

- `PATCH /api/admin/shop/orders/:id` — cancel (unpaid) / refund (paid) using the order engine; admin orders UI gained the matching buttons.
- Existing admin catalog (create/edit/price/stock/image) and delivery assignment already covered the rest.

## 16. Vehicle DB (NHTSA)

`scripts/shop-seed-vehicle-years.mjs` back-filled accurate model year ranges + `vehicle_generations` from the offline NHTSA-built `src/lib/data/vehicles-catalog.json` (128 makes). Result: 20 NG makes, 1,628 models, **242 accurate year ranges** + generations (Corolla now 1980–2027 instead of soft 1995–2027).

## 17. Verification — E2E integration (live DB)

`scripts/shop-e2e-verify.mts` (throwaway auth user, cleaned up after):

```
cart subtotal 5,700,000 · delivery (island) +200,000
order created → idempotent re-checkout returns SAME order id
mock payment init → verify: reserve 0 → 2, order paid,
delivery row pending (zone Lagos Island / ona_standard / ETA 120),
cart → converted, refund → release 2 → 0, payment refunded
E2E VERIFY PASSED
```

## 18. Verification — trade matrix (live DB)

`scripts/shop-trade-matrix-verify.mts` — for all **14 trades**: trade-locked search returns non-duplicate ids, sorted by `relevance`, all scores set, no trade leak; in-stock and price-window facet filters return; per-trade filter config exists. **14/14 passed.**

## 19. Automated gate

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **464/464 passed** (added 7: delivery fee math + ranking ladder; fixed stale job-constants tests).
- `npx eslint` on changed files — clean (full-repo lint remains noisy with pre-existing errors/warnings in unrelated code).

## 20. Remaining / follow-ups

- Expand vehicle catalog to all 128 offline makes (run `scripts/download-vehicle-catalog.mjs`, then re-run `shop-seed-vehicle-years.mjs`) — currently the 20 Nigeria-common makes are populated.
- Courier provider integration via `DELIVERY_PROVIDERS` (admin already assigns courier/status).
- Live Flutterwave end-to-end (keys present; verify path confirmed via mock).
- Home-page global search facets (trade pages have them; global search intentionally left unfaceted to avoid cross-trade ambiguity).
