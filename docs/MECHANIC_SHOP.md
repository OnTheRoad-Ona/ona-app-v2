# ONA Mechanic Shop

Nigerian automotive catalog architecture integrated into the existing Ona Shop.

## Access

| Role | Experience |
|------|------------|
| Customer | Full market → Mechanic trade → Mechanic Shop |
| Repair Pro · Mechanic | **Mechanic Shop only** |
| Repair Pro · other | Own trade shop only |
| Browse ALL PARTS | **Mechanic pro + customers only** (not other trades) |

## Data model (migration `20260810_061_mechanic_shop_master.sql`)

- `shop_products` — master product identity (**no prices**)
- `shop_product_trades` — product ↔ multi-trade
- `shop_sellers` — platform seller `ona-platform`
- `shop_seller_listings` — status + qty + **listing price**
- `shop_product_requests` — zero-result demand
- Six listing statuses: `available`, `low_stock`, `out_of_stock`, `pre_order`, `coming_soon`, `discontinued`
- UI `ALL` is a filter only, not a stored status

## Taxonomy

30 root categories + subcategories: `src/lib/shop/mechanic-taxonomy.ts`

```bash
npm run db:sync
npm run db:seed-mechanic
```

## APIs

| Endpoint | Role |
|----------|------|
| `GET /api/shop/home` | Scoped title, trades, products |
| `GET /api/shop/products` | Trade-gated |
| `GET /api/shop/search` | Trade-gated for pros |
| `GET /api/shop/all-parts` | Mechanic-only for pros |
| `POST /api/shop/product-requests` | Zero-result request |
| `GET /api/admin/shop/product-requests` | Admin demand |
| `GET /api/admin/shop/analytics` | Zero-result + listing counts |

## Rules

- Do not put prices on master products
- Do not fabricate OEM/SKU/specs
- Do not redesign Settings / auth / nav
- Extend existing `shop_*` tables
