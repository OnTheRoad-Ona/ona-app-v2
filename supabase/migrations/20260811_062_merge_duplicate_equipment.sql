-- ============================================================
-- Merge duplicate demo tools/equipment products (shop data cleanup)
-- 7 duplicate groups, 2 products each. Keep one canonical product per
-- group and hard-delete the duplicate (variants/prices/inventory/
-- fitments/seller-listings cascade with it).
--
-- Canonical kept per group (trade kept in brackets):
--   Compact Sensors              -> ac         (206f96c1…)
--   Pro Cables                   -> electrical (10a51d89…)
--   Pro Battery Testers          -> battery    (5e2e13e3…)
--   Pro Brushes                  -> painter    (cb335f9c…)
--   Ultra Battery Testers        -> battery    (71b5875e…)
--   Heavy-Duty Creepers          -> mechanic   (59ada023…)
--   Heavy-Duty Engine Oil Filters-> mechanic   (3cd38b06…)
-- ============================================================

-- 1) Hard-delete the 7 duplicate products.
delete from public.shop_products
where id in (
  'afe9cfbd-f1f2-4ca1-b190-2f228235bb08', -- Compact Sensors (generator) duplicate
  '7c7cb7f6-dadb-40d2-ac2a-2377c262edc9', -- Pro Cables (battery) duplicate
  '82f42f7a-8da6-416b-87da-7872a6fc09b1', -- Pro Battery Testers (diagnostics) duplicate
  '1e2ef697-b4db-4f75-8da9-35bcddd79295', -- Pro Brushes (wash) duplicate
  '73bf61b5-1a7c-45a1-b037-1adb08c0ec41', -- Ultra Battery Testers (diagnostics) duplicate
  'db3be064-53a6-41ec-bfff-55c532943f9d', -- Heavy-Duty Creepers (vulcanizer) duplicate
  'c34ea4da-2205-43de-9097-ca87a4d17b67'  -- Heavy-Duty Engine Oil & Filters (mechanic) duplicate
);

-- 2) Vehicle sync: the retained equipment sits in vehicle-based trades
--    (ac, electrical, battery, mechanic). Give each retained variant an
--    explicit make-level fitment for every vehicle make so it ranks for
--    each brand/model/vehicle of its trade (a make-level row covers all
--    models + vehicles under that make). Painter equipment (Pro Brushes)
--    is a non-vehicle trade and is intentionally skipped.
--
--    Clear any pre-existing make-level rows first so re-runs are idempotent.
delete from public.shop_product_fitments
where variant_id in (
  select v.id
  from public.shop_product_variants v
  join public.shop_products p on p.id = v.product_id
  where p.id in (
    '206f96c1-12dc-4607-9313-79b8c3edda65', -- Compact Sensors (ac)
    '10a51d89-daa4-4b27-ba44-e1d9c79ddb28', -- Pro Cables (electrical)
    '5e2e13e3-c5a9-4498-8c4b-c5b855004a9e', -- Pro Battery Testers (battery)
    '71b5875e-388a-46d8-8194-852eba8fdf7b', -- Ultra Battery Testers (battery)
    '59ada023-fddf-4968-bb10-9c5028ff59ff', -- Heavy-Duty Creepers (mechanic)
    '3cd38b06-8e3b-4515-9fe7-ffa54ed6a771'  -- Heavy-Duty Engine Oil Filters (mechanic)
  )
)
and make_id is not null
and model_id is null
and generation_id is null;

insert into public.shop_product_fitments (
  variant_id, make_id, model_id, generation_id, year_start, year_end,
  fitment_status, notes
)
select v.id, m.id, null, null, null, null, 'compatible',
       'Universal workshop equipment — matches every model of this make'
from public.shop_product_variants v
cross join public.vehicle_makes m
where v.product_id in (
  '206f96c1-12dc-4607-9313-79b8c3edda65', -- Compact Sensors (ac)
  '10a51d89-daa4-4b27-ba44-e1d9c79ddb28', -- Pro Cables (electrical)
  '5e2e13e3-c5a9-4498-8c4b-c5b855004a9e', -- Pro Battery Testers (battery)
  '71b5875e-388a-46d8-8194-852eba8fdf7b', -- Ultra Battery Testers (battery)
  '59ada023-fddf-4968-bb10-9c5028ff59ff', -- Heavy-Duty Creepers (mechanic)
  '3cd38b06-8e3b-4515-9fe7-ffa54ed6a771'  -- Heavy-Duty Engine Oil Filters (mechanic)
)
and v.status = 'active';

-- 3) Availability guard: retained equipment must remain available by
--    default (active + active price + stock). Raises if any is not.
do $$
declare
  missing int;
begin
  select count(*) into missing
  from public.shop_products p
  where p.id in (
    '206f96c1-12dc-4607-9313-79b8c3edda65',
    '10a51d89-daa4-4b27-ba44-e1d9c79ddb28',
    '5e2e13e3-c5a9-4498-8c4b-c5b855004a9e',
    'cb335f9c-8448-4abb-aa67-602ae7ffa475',
    '71b5875e-388a-46d8-8194-852eba8fdf7b',
    '59ada023-fddf-4968-bb10-9c5028ff59ff',
    '3cd38b06-8e3b-4515-9fe7-ffa54ed6a771'
  )
    and not exists (
      select 1 from public.shop_availability_view a
      where a.product_id = p.id and a.available
    );

  if missing > 0 then
    raise exception 'Retained equipment must remain available by default; % not available.', missing;
  end if;
end $$;
