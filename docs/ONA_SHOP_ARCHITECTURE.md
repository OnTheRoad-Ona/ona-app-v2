# ONA Shop — Architecture Map (Phase 1–2)

> Production repair-commerce subsystem **inside** Ona.  
> Ona is the only seller. Customers and Repair Pros are buyers.  
> No third-party sellers. No shop escrow. No separate identity.

**Locked product decisions**

| Topic | Decision |
|--------|----------|
| Delivery | `shop_deliveries` + admin assign/status now; courier providers later |
| Catalog | Multi-trade seed + licensed import pipeline |
| Payments | Flutterwave **pay-now** capture; separate `shop_payments` ledger |
| Pace | Phase 1→22 with verify gates |

---

## 1. Reuse matrix

| Domain | Exists | Shop action |
|--------|--------|-------------|
| Auth / `profiles` | Yes | Reuse `profiles.id` as buyer |
| Dual role switch | Yes | Shop is **shared** path for motorist + pro |
| Addresses | `user_addresses` + map pickers | Reuse for ship-to |
| Flutterwave keys / `initCharge` | `providers.ts` | Thin shop adapter only |
| Job escrow `payments` | Yes | **Do not use** for shop |
| Pro payout ledger | Yes | **Do not use** for shop |
| Notifications | `insertNotification` | Extend category or use `payments`/`system` + href `/shop/...` |
| Admin RBAC | Yes | New shop permissions |
| Storage | `avatars` only | New bucket `shop-media` |
| Trade taxonomy (UI) | `PRO_TRADE_OPTIONS` + `all` | Map to `shop_trade_categories` |
| Vehicle make/model | `vehicle-catalog` + motorist `vehicles` jsonb | Normalize into `user_vehicles` + fitment |
| Delivery / courier | **No** | Greenfield `shop_deliveries` |
| `/orders` route | Pro **job** desk | Shop uses `/shop/orders` only |

---

## 2. Hard boundaries (non-negotiable)

```
JOB PAY (escrow)                    SHOP PAY (retail)
service_requests                    shop_orders
payments.request_id                 shop_payments.order_id
held → release → pro transfer       captured → fulfilled
87.5/5/7.5 labour split             Ona keeps retail margin
```

Regression gate: existing `npm run lint && typecheck && test` + job pay flows must still pass.

---

## 3. Navigation integration

| Role | Entry |
|------|--------|
| Customer | Replace `all` tab in `category-tabs.tsx` with **Shop** → `/shop` |
| Repair Pro | Add **Shop** to `PRO_NAV` in `app-menu.tsx` → `/shop` |

Update: `routes.ts` (`isSharedAppPath`), `navigation.ts` back stack.

---

## 4. Route map (planned)

```
/shop                    Home (browse by trade)
/shop/search             Search results
/shop/c/[trade]          Trade category tree
/shop/p/[slug]           Product detail
/shop/cart               Cart
/shop/checkout           Checkout
/shop/orders             Order list
/shop/orders/[id]        Order detail + delivery track
/shop/vehicles           My vehicles (garage)
/shop/saved              Saved products

/api/shop/*              All shop APIs (requireUser)
/admin/shop/*            Admin catalog / inventory / orders
```

---

## 5. Data model (core)

```
shop_trade_categories (tree)
shop_brands / shop_manufacturers
shop_products → shop_product_variants
shop_attributes / shop_product_attributes
vehicle_makes → vehicle_models → vehicle_generations → vehicle_variants
user_vehicles
shop_product_fitments
shop_equipment_models / shop_product_compatibility
shop_inventory_locations / shop_inventory / shop_inventory_transactions
shop_prices
shop_carts / shop_cart_items
shop_orders / shop_order_items / shop_order_events
shop_payments
shop_deliveries
shop_saved_products / shop_recently_viewed
shop_catalog_sources / shop_catalog_import_jobs / shop_catalog_import_errors
shop_search_events / shop_audit_logs
```

---

## 6. Server modules (planned)

```
src/lib/server/shop/
  catalog.ts
  search.ts
  intent.ts
  compatibility.ts
  inventory.ts
  cart.ts
  checkout.ts
  payments.ts      # FLW pay-now only
  orders.ts
  delivery.ts
  vehicles.ts
  audit.ts
```

---

## 7. Phase status

| Phase | Status |
|-------|--------|
| 1 Audit | Done |
| 2 Architecture map | Done |
| 3 DB migrations | Done (`20260809_050_ona_shop_core.sql`) |
| 4 Catalog modules | Done (catalog, intent, search + seed script) |
| 5–6 Fitment/inventory schema | In migration |
| 7 Search API | Done (`/api/shop/search`) |
| 8 Cart | Done — `/api/shop/cart` + server validate |
| 9–10 Checkout + FLW pay-now | Done — `/api/shop/checkout`, `/api/shop/payments/verify` |
| 11 Orders | Done — create on checkout, list/detail UI |
| 12 Delivery | Row on paid; admin assign later |
| 14 Customer Shop UI | Home, trade, product, cart, checkout, orders |
| 15 Pro Shop entry | Hamburger **Shop** |
| 16 Admin shop | Done — `/admin/shop` orders + delivery assign |
| 17 Ingestion | Job tables + seed script |
| 21 Unit tests | Intent + cart validate (6 tests) |

---

## 8. Verify checklist (after each phase)

- [ ] Migration applies cleanly  
- [ ] Job escrow paths untouched  
- [ ] `lint && typecheck && test`  
- [ ] No `/orders` collision  
- [ ] Shop routes shared for both roles  
