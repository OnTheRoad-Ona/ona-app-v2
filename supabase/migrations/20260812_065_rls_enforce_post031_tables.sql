-- =============================================================================
-- RLS ENFORCEMENT — tables created after the 20260722 security hardening (031)
-- -----------------------------------------------------------------------------
-- WHY
--   Migration 031 (20260722_031_security_hardening_rls.sql) revoked anon and
--   changed default privileges, but it only hardened tables that existed at
--   that time. Every table created later (036 onward: shop_*, credit/cashout,
--   referral, pairing queue, vehicles, system_settings, idempotency, …) was
--   auto-granted ALL to the `authenticated` role (031's ALTER DEFAULT
--   PRIVILEGES) and never had row-level security enabled. Any logged-in user
--   could therefore read/write every shop order, credit wallet, cashout,
--   referral code and customer vehicle through PostgREST using the published
--   anon key + their own session.
--
-- FIX (behavior-preserving)
--   Current app access to these tables is EXCLUSIVELY via server API routes
--   and cron sweeps, all of which run as `service_role` / `postgres` (they
--   bypass RLS). No browser component, store, or app-api helper queries them
--   directly, so enabling RLS with no anon/authenticated policies cannot break
--   any existing flow.
--   1) ENABLE ROW LEVEL SECURITY (+ FORCE) on every post-031 table.
--   2) REVOKE anon + authenticated at the grant layer (defense in depth).
--   3) Keep full access for service_role / postgres.
--   Any future feature needing client-facing access to these tables must add
--   an explicit policy AND grant in its own migration — never rely on defaults.
-- =============================================================================

do $$
declare
  t text;
  protect text[] := array[
    -- credit / wallet / cashout
    'cashout_requests',
    'credit_transactions',
    'credit_wallets',
    'fraud_flags',
    'service_credit_payments',
    -- identity / security change requests
    'contact_change_requests',
    'referral_codes',
    'referral_events',
    -- pairing / dispatch internals
    'request_pairing_queue',
    'request_reservations',
    -- server-only operational tables
    'idempotent_ops',
    'merit_scores',
    'system_settings',
    -- vehicle catalog + user vehicles
    'user_vehicles',
    'vehicle_generations',
    'vehicle_makes',
    'vehicle_models',
    'vehicle_types',
    'vehicle_variants',
    -- shop catalog (taxonomy / reference data)
    'shop_attributes',
    'shop_brands',
    'shop_data_sources',
    'shop_delivery_services',
    'shop_delivery_zones',
    'shop_equipment_models',
    'shop_external_category_map',
    'shop_manufacturers',
    'shop_prices',
    'shop_product_attributes',
    'shop_product_compatibility',
    'shop_product_families',
    'shop_product_fitments',
    'shop_product_trades',
    'shop_products',
    'shop_source_change_log',
    'shop_source_connectors',
    'shop_trade_categories',
    -- shop commerce / transactions
    'shop_cart_items',
    'shop_carts',
    'shop_deliveries',
    'shop_inventory',
    'shop_inventory_locations',
    'shop_inventory_transactions',
    'shop_order_events',
    'shop_order_items',
    'shop_orders',
    'shop_payments',
    'shop_product_images',
    'shop_product_requests',
    'shop_product_variants',
    'shop_recently_viewed',
    'shop_saved_products',
    'shop_seller_listings',
    'shop_sellers',
    -- shop data-import / QA internals
    'shop_audit_logs',
    'shop_catalog_import_errors',
    'shop_catalog_import_jobs',
    'shop_catalog_sources',
    'shop_dedup_results',
    'shop_import_batches',
    'shop_import_jobs',
    'shop_search_events',
    'shop_staging_records',
    'shop_validation_results'
  ];
begin
  foreach t in array protect loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('alter table public.%I enable row level security', t);
      execute format('alter table public.%I force row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
      execute format('grant all on table public.%I to service_role, postgres', t);
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Stop future tables silently re-opening the same hole.
-- 031's "grant ALL to authenticated by default" applied RLS verification only
-- to tables that existed in 20260722; brand-new tables have RLS OFF by default,
-- so that default grant would immediately expose them again. From now on:
--   - anon / authenticated get NOTHING from defaults;
--   - service_role keeps full default access;
--   - features that need client access add explicit grants + policies.
-- -----------------------------------------------------------------------------
alter default privileges in schema public
  revoke all on tables from authenticated;

alter default privileges in schema public
  grant all on tables to service_role;

-- Done
notify pgrst, 'reload schema';