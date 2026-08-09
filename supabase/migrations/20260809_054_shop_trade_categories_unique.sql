-- Prevent double-seeded trades (migration re-run created duplicates)
-- Unique on (trade_key, slug) so ON CONFLICT works and UI shows each trade once.

create unique index if not exists shop_trade_categories_trade_slug_uidx
  on public.shop_trade_categories (trade_key, slug);
