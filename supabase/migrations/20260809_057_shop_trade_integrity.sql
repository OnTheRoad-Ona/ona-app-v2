-- ============================================================
-- ONA SHOP trade integrity enforcement (Phase 1 trade separation)
-- The database — not just the frontend — must keep a product's trade
-- consistent with the category tree it lives under, and forbid
-- vehicle fitment rows for non-vehicle trades.
-- ============================================================

-- ------------------------------------------------------------
-- 1) shop_products.trade_key must equal its category's trade_key
-- ------------------------------------------------------------
create or replace function public.ona_shop_enforce_trade_category()
returns trigger
language plpgsql
as $$
declare
  cat_trade text;
begin
  select c.trade_key into cat_trade
    from public.shop_trade_categories c
    where c.id = new.category_id;

  if cat_trade is null then
    raise exception 'shop category % does not exist', new.category_id;
  end if;

  if new.trade_key <> cat_trade then
    raise exception
      'product trade_key % does not match its category trade %',
      new.trade_key, cat_trade;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ona_shop_enforce_trade_category
  on public.shop_products;
create trigger trg_ona_shop_enforce_trade_category
  before insert or update of category_id, trade_key on public.shop_products
  for each row
  execute function public.ona_shop_enforce_trade_category();

-- ------------------------------------------------------------
-- 2) Vehicle fitment rows are vehicle-trade-only
--    (shop_product_fitments can only be attached to a variant whose
--     product lives in a vehicle-based trade)
-- ------------------------------------------------------------
create or replace function public.ona_shop_enforce_fitment_trade()
returns trigger
language plpgsql
as $$
declare
  prod_trade text;
begin
  select p.trade_key into prod_trade
    from public.shop_products p
    join public.shop_product_variants v on v.product_id = p.id
    where v.id = new.variant_id;

  if prod_trade is null then
    raise exception 'variant % does not exist', new.variant_id;
  end if;

  if prod_trade not in ('mechanic', 'vulcanizer', 'towing', 'ac', 'battery', 'body', 'electrical', 'diagnostics') then
    raise exception
      'vehicle fitment is not allowed for trade %', prod_trade;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ona_shop_enforce_fitment_trade
  on public.shop_product_fitments;
create trigger trg_ona_shop_enforce_fitment_trade
  before insert or update of variant_id on public.shop_product_fitments
  for each row
  execute function public.ona_shop_enforce_fitment_trade();

comment on function public.ona_shop_enforce_trade_category() is
  'A shop product can only be filed under a category of the same trade.';
comment on function public.ona_shop_enforce_fitment_trade() is
  'Vehicle make/model fitment exists only for vehicle-based trades.';