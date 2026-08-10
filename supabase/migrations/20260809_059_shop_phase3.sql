-- ═══════════════════════════════════════════════════════════════════════════
-- ONA SHOP — PHASE 3
-- Delivery zones/services, order idempotency, refund columns, query indexes.
-- Idempotent; safe to re-run via npm run db:sync.
-- ═══════════════════════════════════════════════════════════════════════════

-- --------------------------------------------------------------------------
-- Delivery zones (Ona delivers; no third-party courier).
-- --------------------------------------------------------------------------
create table if not exists public.shop_delivery_zones (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  surcharge_minor bigint not null default 0 check (surcharge_minor >= 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.shop_delivery_zones (code, name, surcharge_minor, sort_order)
values
  ('default', 'Lagos Mainland', 0, 0),
  ('island', 'Lagos Island', 50000, 1),
  ('other', 'Outside Lagos', 0, 2)
on conflict (code) do nothing;

-- --------------------------------------------------------------------------
-- Delivery services (modular: Ona internal op + future courier provider).
-- free_above_subtotal_minor NULL = free delivery never applies.
-- --------------------------------------------------------------------------
create table if not exists public.shop_delivery_services (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  base_fee_minor bigint not null default 0 check (base_fee_minor >= 0),
  eta_minutes_min int not null default 60,
  eta_minutes_max int not null default 180,
  free_above_subtotal_minor bigint,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.shop_delivery_services (code, name, base_fee_minor, eta_minutes_min, eta_minutes_max, free_above_subtotal_minor)
values
  ('ona_standard', 'Ona Standard Delivery', 150000, 60, 180, 10000000)
on conflict (code) do nothing;

-- Address → zone association (chosen by buyer at checkout).
alter table public.user_addresses
  add column if not exists delivery_zone_code text;

-- --------------------------------------------------------------------------
-- Order idempotency: a checkout_token prevents duplicate orders from one
-- checkout (double-click / retry). Generated server-side.
-- --------------------------------------------------------------------------
alter table public.shop_orders
  add column if not exists checkout_token text,
  add column if not exists refunded_at timestamptz,
  add column if not exists delivery_zone_code text,
  add column if not exists delivery_service_code text,
  add column if not exists delivery_eta_minutes int;

create unique index if not exists shop_orders_checkout_token_uidx
  on public.shop_orders (checkout_token)
  where checkout_token is not null;

-- --------------------------------------------------------------------------
-- Payment refund tracking.
-- --------------------------------------------------------------------------
alter table public.shop_payments
  add column if not exists refunded_at timestamptz,
  add column if not exists provider_txn_id text;

-- --------------------------------------------------------------------------
-- Delivery row enrichment (zone/service/ETA snapshot from the delivery engine).
-- --------------------------------------------------------------------------
alter table public.shop_deliveries
  add column if not exists zone_code text,
  add column if not exists zone_name text,
  add column if not exists service_code text,
  add column if not exists eta_minutes int;

-- --------------------------------------------------------------------------
-- Indexes for Phase 3 query patterns (composite where justified).
-- --------------------------------------------------------------------------
create index if not exists shop_products_trade_status_idx
  on public.shop_products (trade_key, status);
create index if not exists shop_products_source_key_idx
  on public.shop_products (source_key);

create index if not exists shop_order_items_order_idx
  on public.shop_order_items (order_id);
create index if not exists shop_order_events_order_idx
  on public.shop_order_events (order_id);

create index if not exists shop_inventory_transactions_variant_idx
  on public.shop_inventory_transactions (variant_id);
create index if not exists shop_inventory_transactions_ref_idx
  on public.shop_inventory_transactions (ref_type, ref_id);
create index if not exists shop_inventory_location_idx
  on public.shop_inventory (location_id);

create index if not exists shop_payments_user_idx
  on public.shop_payments (user_id);
create index if not exists shop_payments_status_idx
  on public.shop_payments (status);

create index if not exists shop_deliveries_status_idx
  on public.shop_deliveries (status);
create index if not exists shop_deliveries_assigned_idx
  on public.shop_deliveries (assigned_admin_id);

create index if not exists shop_search_events_created_idx
  on public.shop_search_events (created_at desc);
create index if not exists shop_search_events_user_idx
  on public.shop_search_events (user_id);

-- --------------------------------------------------------------------------
-- Atomic inventory operations (server-side, race-safe).
-- PostgREST can't run multi-statement transactions, so reserve/release/deduct
-- are Postgres functions. Service role (server) is the only caller.
-- --------------------------------------------------------------------------

-- Reserve qty against the first location with enough free stock. Returns
-- false when the variant cannot satisfy the request (never oversells).
create or replace function public.ona_shop_reserve(
  p_variant_id uuid,
  p_qty int,
  p_order_id uuid
) returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_location uuid;
begin
  if p_qty <= 0 then
    return true;
  end if;

  select id, location_id into v_id, v_location
  from public.shop_inventory
  where variant_id = p_variant_id
    and (qty_on_hand - qty_reserved) >= p_qty
  order by qty_on_hand desc
  limit 1
  for update skip locked;

  if v_id is null then
    return false;
  end if;

  update public.shop_inventory
  set qty_reserved = qty_reserved + p_qty,
      updated_at = now()
  where id = v_id;

  insert into public.shop_inventory_transactions
    (variant_id, location_id, delta, reason, ref_type, ref_id)
  values
    (p_variant_id, v_location, -p_qty, 'reserve_on_pay', 'shop_order', p_order_id);

  return true;
end;
$$;

-- Release ALL reserves held for an order (payment fail / cancel / refund).
-- Returns number of items released.
create or replace function public.ona_shop_release(p_order_id uuid)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  released int := 0;
begin
  for r in
    select it.variant_id, it.qty
    from public.shop_order_items it
    where it.order_id = p_order_id
  loop
    update public.shop_inventory inv
    set qty_reserved = greatest(0, qty_reserved - r.qty),
        updated_at = now()
    where inv.variant_id = r.variant_id;
    released := released + 1;
  end loop;
  return released;
end;
$$;

-- Deduct sold stock on delivery completion: qty_on_hand - qty, clear the
-- reserve, write a 'sale' transaction. Returns number of items processed.
create or replace function public.ona_shop_fulfill_deduct(p_order_id uuid)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_location uuid;
  done int := 0;
begin
  for r in
    select it.variant_id, it.qty
    from public.shop_order_items it
    where it.order_id = p_order_id
  loop
    select location_id into v_location
    from public.shop_inventory
    where variant_id = r.variant_id
    order by qty_on_hand desc
    limit 1;

    update public.shop_inventory inv
    set qty_on_hand = greatest(0, qty_on_hand - r.qty),
        qty_reserved = greatest(0, qty_reserved - r.qty),
        updated_at = now()
    where inv.variant_id = r.variant_id;

    insert into public.shop_inventory_transactions
      (variant_id, location_id, delta, reason, ref_type, ref_id)
    values
      (r.variant_id, v_location, -r.qty, 'sale', 'shop_order', p_order_id);
    done := done + 1;
  end loop;
  return done;
end;
$$;

grant execute on function public.ona_shop_reserve(uuid, int, uuid) to service_role;
grant execute on function public.ona_shop_release(uuid) to service_role;
grant execute on function public.ona_shop_fulfill_deduct(uuid) to service_role;
