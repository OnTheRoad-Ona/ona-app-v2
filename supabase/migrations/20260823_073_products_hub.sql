-- Products hub: per-product availability override.
-- null = Auto (derived from stock). Forced values win on the storefront.

alter table public.shop_products
  add column if not exists listing_override text;

alter table public.shop_products
  add constraint shop_products_listing_override_check
  check (
    listing_override is null or listing_override in (
      'available', 'low_stock', 'out_of_stock',
      'pre_order', 'coming_soon'
    )
  );
