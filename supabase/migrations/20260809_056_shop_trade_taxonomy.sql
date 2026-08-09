-- ============================================================
-- ONA SHOP trade taxonomy seed (Phase 1 trade separation)
-- Generated from src/lib/shop/taxonomy.ts — do NOT hand-edit.
-- One independent category tree per trade. Vehicle fitment is
-- ONLY applicable to vehicle-based trades (enforced in schema,
-- backend and UI).
-- ============================================================

-- ------------------------------------------------------------
-- Mechanic (mechanic) vehicleBased=true
-- ------------------------------------------------------------
do $$
declare
  parent_id uuid;
  idx int := 0;
begin
  select id into parent_id from public.shop_trade_categories
    where trade_key = 'mechanic' and depth = 0 limit 1;
  if parent_id is null then
    insert into public.shop_trade_categories
      (trade_key, slug, name, description, sort_order, depth, path)
      values ('mechanic', 'mechanic', 'Mechanic', null, 1, 0, 'mechanic')
      returning id into parent_id;
  end if;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'mechanic',
      'engine',
      'Engine',
      null,
      idx,
      1,
      'mechanic/engine'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'mechanic',
      'transmission',
      'Transmission',
      null,
      idx,
      1,
      'mechanic/transmission'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'mechanic',
      'brakes',
      'Brakes',
      null,
      idx,
      1,
      'mechanic/brakes'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'mechanic',
      'suspension',
      'Suspension',
      null,
      idx,
      1,
      'mechanic/suspension'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'mechanic',
      'steering',
      'Steering',
      null,
      idx,
      1,
      'mechanic/steering'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'mechanic',
      'cooling',
      'Cooling',
      null,
      idx,
      1,
      'mechanic/cooling'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'mechanic',
      'fuel',
      'Fuel',
      null,
      idx,
      1,
      'mechanic/fuel'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'mechanic',
      'exhaust',
      'Exhaust',
      null,
      idx,
      1,
      'mechanic/exhaust'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'mechanic',
      'electrical',
      'Electrical',
      null,
      idx,
      1,
      'mechanic/electrical'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'mechanic',
      'sensors',
      'Sensors',
      null,
      idx,
      1,
      'mechanic/sensors'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'mechanic',
      'filters',
      'Filters',
      null,
      idx,
      1,
      'mechanic/filters'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'mechanic',
      'lighting',
      'Lighting',
      null,
      idx,
      1,
      'mechanic/lighting'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'mechanic',
      'maintenance',
      'Maintenance',
      null,
      idx,
      1,
      'mechanic/maintenance'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'mechanic',
      'tools',
      'Tools',
      null,
      idx,
      1,
      'mechanic/tools'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'mechanic',
      'garage-equipment',
      'Garage Equipment',
      null,
      idx,
      1,
      'mechanic/garage-equipment'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
end $$;

-- ------------------------------------------------------------
-- Vulcanizer (vulcanizer) vehicleBased=true
-- ------------------------------------------------------------
do $$
declare
  parent_id uuid;
  idx int := 0;
begin
  select id into parent_id from public.shop_trade_categories
    where trade_key = 'vulcanizer' and depth = 0 limit 1;
  if parent_id is null then
    insert into public.shop_trade_categories
      (trade_key, slug, name, description, sort_order, depth, path)
      values ('vulcanizer', 'vulcanizer', 'Vulcanizer', null, 1, 0, 'vulcanizer')
      returning id into parent_id;
  end if;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'vulcanizer',
      'tires',
      'Tires',
      null,
      idx,
      1,
      'vulcanizer/tires'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'vulcanizer',
      'tubes',
      'Tubes',
      null,
      idx,
      1,
      'vulcanizer/tubes'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'vulcanizer',
      'rims',
      'Rims',
      null,
      idx,
      1,
      'vulcanizer/rims'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'vulcanizer',
      'wheels',
      'Wheels',
      null,
      idx,
      1,
      'vulcanizer/wheels'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'vulcanizer',
      'tpms',
      'TPMS',
      null,
      idx,
      1,
      'vulcanizer/tpms'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'vulcanizer',
      'valves',
      'Valves',
      null,
      idx,
      1,
      'vulcanizer/valves'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'vulcanizer',
      'patches',
      'Patches',
      null,
      idx,
      1,
      'vulcanizer/patches'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'vulcanizer',
      'tire-repair',
      'Tire Repair',
      null,
      idx,
      1,
      'vulcanizer/tire-repair'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'vulcanizer',
      'balancing',
      'Balancing',
      null,
      idx,
      1,
      'vulcanizer/balancing'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'vulcanizer',
      'alignment',
      'Alignment',
      null,
      idx,
      1,
      'vulcanizer/alignment'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'vulcanizer',
      'tire-changers',
      'Tire Changers',
      null,
      idx,
      1,
      'vulcanizer/tire-changers'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'vulcanizer',
      'compressors',
      'Compressors',
      null,
      idx,
      1,
      'vulcanizer/compressors'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'vulcanizer',
      'vulcanizing-equipment',
      'Vulcanizing Equipment',
      null,
      idx,
      1,
      'vulcanizer/vulcanizing-equipment'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
end $$;

-- ------------------------------------------------------------
-- Tow (towing) vehicleBased=true
-- ------------------------------------------------------------
do $$
declare
  parent_id uuid;
  idx int := 0;
begin
  select id into parent_id from public.shop_trade_categories
    where trade_key = 'towing' and depth = 0 limit 1;
  if parent_id is null then
    insert into public.shop_trade_categories
      (trade_key, slug, name, description, sort_order, depth, path)
      values ('towing', 'towing', 'Tow', null, 1, 0, 'towing')
      returning id into parent_id;
  end if;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'towing',
      'tow-straps',
      'Tow Straps',
      null,
      idx,
      1,
      'towing/tow-straps'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'towing',
      'chains',
      'Chains',
      null,
      idx,
      1,
      'towing/chains'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'towing',
      'winches',
      'Winches',
      null,
      idx,
      1,
      'towing/winches'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'towing',
      'tow-bars',
      'Tow Bars',
      null,
      idx,
      1,
      'towing/tow-bars'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'towing',
      'dollies',
      'Dollies',
      null,
      idx,
      1,
      'towing/dollies'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'towing',
      'recovery-equipment',
      'Recovery Equipment',
      null,
      idx,
      1,
      'towing/recovery-equipment'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'towing',
      'warning-equipment',
      'Warning Equipment',
      null,
      idx,
      1,
      'towing/warning-equipment'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'towing',
      'trailer-equipment',
      'Trailer Equipment',
      null,
      idx,
      1,
      'towing/trailer-equipment'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'towing',
      'towing-accessories',
      'Towing Accessories',
      null,
      idx,
      1,
      'towing/towing-accessories'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
end $$;

-- ------------------------------------------------------------
-- A/C (ac) vehicleBased=true
-- ------------------------------------------------------------
do $$
declare
  parent_id uuid;
  idx int := 0;
begin
  select id into parent_id from public.shop_trade_categories
    where trade_key = 'ac' and depth = 0 limit 1;
  if parent_id is null then
    insert into public.shop_trade_categories
      (trade_key, slug, name, description, sort_order, depth, path)
      values ('ac', 'ac', 'A/C', null, 1, 0, 'ac')
      returning id into parent_id;
  end if;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'ac',
      'vehicle-ac',
      'Vehicle A/C',
      null,
      idx,
      1,
      'ac/vehicle-ac'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'ac',
      'commercial-ac',
      'Commercial A/C',
      null,
      idx,
      1,
      'ac/commercial-ac'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'ac',
      'industrial-ac',
      'Industrial A/C',
      null,
      idx,
      1,
      'ac/industrial-ac'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'ac',
      'compressors',
      'Compressors',
      null,
      idx,
      1,
      'ac/compressors'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'ac',
      'condensers',
      'Condensers',
      null,
      idx,
      1,
      'ac/condensers'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'ac',
      'evaporators',
      'Evaporators',
      null,
      idx,
      1,
      'ac/evaporators'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'ac',
      'blowers',
      'Blowers',
      null,
      idx,
      1,
      'ac/blowers'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'ac',
      'fans',
      'Fans',
      null,
      idx,
      1,
      'ac/fans'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'ac',
      'controls',
      'Controls',
      null,
      idx,
      1,
      'ac/controls'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'ac',
      'sensors',
      'Sensors',
      null,
      idx,
      1,
      'ac/sensors'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'ac',
      'refrigeration-equipment',
      'Refrigeration Equipment',
      null,
      idx,
      1,
      'ac/refrigeration-equipment'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'ac',
      'ac-tools',
      'A/C Tools',
      null,
      idx,
      1,
      'ac/ac-tools'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
end $$;

-- ------------------------------------------------------------
-- Battery (battery) vehicleBased=true
-- ------------------------------------------------------------
do $$
declare
  parent_id uuid;
  idx int := 0;
begin
  select id into parent_id from public.shop_trade_categories
    where trade_key = 'battery' and depth = 0 limit 1;
  if parent_id is null then
    insert into public.shop_trade_categories
      (trade_key, slug, name, description, sort_order, depth, path)
      values ('battery', 'battery', 'Battery', null, 1, 0, 'battery')
      returning id into parent_id;
  end if;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'battery',
      'vehicle-batteries',
      'Vehicle Batteries',
      null,
      idx,
      1,
      'battery/vehicle-batteries'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'battery',
      'battery-chargers',
      'Battery Chargers',
      null,
      idx,
      1,
      'battery/battery-chargers'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'battery',
      'battery-testers',
      'Battery Testers',
      null,
      idx,
      1,
      'battery/battery-testers'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'battery',
      'jump-starters',
      'Jump Starters',
      null,
      idx,
      1,
      'battery/jump-starters'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'battery',
      'terminals',
      'Terminals',
      null,
      idx,
      1,
      'battery/terminals'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'battery',
      'cables',
      'Cables',
      null,
      idx,
      1,
      'battery/cables'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'battery',
      'battery-boxes',
      'Battery Boxes',
      null,
      idx,
      1,
      'battery/battery-boxes'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'battery',
      'battery-accessories',
      'Battery Accessories',
      null,
      idx,
      1,
      'battery/battery-accessories'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'battery',
      'diagnostic-equipment',
      'Diagnostic Equipment',
      null,
      idx,
      1,
      'battery/diagnostic-equipment'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
end $$;

-- ------------------------------------------------------------
-- Body (body) vehicleBased=true
-- ------------------------------------------------------------
do $$
declare
  parent_id uuid;
  idx int := 0;
begin
  select id into parent_id from public.shop_trade_categories
    where trade_key = 'body' and depth = 0 limit 1;
  if parent_id is null then
    insert into public.shop_trade_categories
      (trade_key, slug, name, description, sort_order, depth, path)
      values ('body', 'body', 'Body', null, 1, 0, 'body')
      returning id into parent_id;
  end if;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'body',
      'doors',
      'Doors',
      null,
      idx,
      1,
      'body/doors'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'body',
      'bonnets',
      'Bonnets',
      null,
      idx,
      1,
      'body/bonnets'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'body',
      'trunks',
      'Trunks',
      null,
      idx,
      1,
      'body/trunks'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'body',
      'fenders',
      'Fenders',
      null,
      idx,
      1,
      'body/fenders'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'body',
      'bumpers',
      'Bumpers',
      null,
      idx,
      1,
      'body/bumpers'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'body',
      'grilles',
      'Grilles',
      null,
      idx,
      1,
      'body/grilles'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'body',
      'mirrors',
      'Mirrors',
      null,
      idx,
      1,
      'body/mirrors'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'body',
      'panels',
      'Panels',
      null,
      idx,
      1,
      'body/panels'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'body',
      'headlights',
      'Headlights',
      null,
      idx,
      1,
      'body/headlights'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'body',
      'tail-lights',
      'Tail Lights',
      null,
      idx,
      1,
      'body/tail-lights'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'body',
      'glass',
      'Glass',
      null,
      idx,
      1,
      'body/glass'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'body',
      'body-hardware',
      'Body Hardware',
      null,
      idx,
      1,
      'body/body-hardware'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'body',
      'paint',
      'Paint',
      null,
      idx,
      1,
      'body/paint'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'body',
      'body-repair',
      'Body Repair',
      null,
      idx,
      1,
      'body/body-repair'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'body',
      'body-tools',
      'Body Tools',
      null,
      idx,
      1,
      'body/body-tools'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
end $$;

-- ------------------------------------------------------------
-- Electric (electrical) vehicleBased=true
-- ------------------------------------------------------------
do $$
declare
  parent_id uuid;
  idx int := 0;
begin
  select id into parent_id from public.shop_trade_categories
    where trade_key = 'electrical' and depth = 0 limit 1;
  if parent_id is null then
    insert into public.shop_trade_categories
      (trade_key, slug, name, description, sort_order, depth, path)
      values ('electrical', 'electrical', 'Electric', null, 1, 0, 'electrical')
      returning id into parent_id;
  end if;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'electrical',
      'cables',
      'Cables',
      null,
      idx,
      1,
      'electrical/cables'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'electrical',
      'wires',
      'Wires',
      null,
      idx,
      1,
      'electrical/wires'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'electrical',
      'switches',
      'Switches',
      null,
      idx,
      1,
      'electrical/switches'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'electrical',
      'sockets',
      'Sockets',
      null,
      idx,
      1,
      'electrical/sockets'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'electrical',
      'breakers',
      'Breakers',
      null,
      idx,
      1,
      'electrical/breakers'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'electrical',
      'contactors',
      'Contactors',
      null,
      idx,
      1,
      'electrical/contactors'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'electrical',
      'relays',
      'Relays',
      null,
      idx,
      1,
      'electrical/relays'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'electrical',
      'transformers',
      'Transformers',
      null,
      idx,
      1,
      'electrical/transformers'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'electrical',
      'motors',
      'Motors',
      null,
      idx,
      1,
      'electrical/motors'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'electrical',
      'panels',
      'Panels',
      null,
      idx,
      1,
      'electrical/panels'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'electrical',
      'distribution',
      'Distribution',
      null,
      idx,
      1,
      'electrical/distribution'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'electrical',
      'lighting',
      'Lighting',
      null,
      idx,
      1,
      'electrical/lighting'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'electrical',
      'testing-equipment',
      'Testing Equipment',
      null,
      idx,
      1,
      'electrical/testing-equipment'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'electrical',
      'industrial-electrical',
      'Industrial Electrical',
      null,
      idx,
      1,
      'electrical/industrial-electrical'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'electrical',
      'automotive-electrical',
      'Automotive Electrical',
      null,
      idx,
      1,
      'electrical/automotive-electrical'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
end $$;

-- ------------------------------------------------------------
-- Scan (diagnostics) vehicleBased=true
-- ------------------------------------------------------------
do $$
declare
  parent_id uuid;
  idx int := 0;
begin
  select id into parent_id from public.shop_trade_categories
    where trade_key = 'diagnostics' and depth = 0 limit 1;
  if parent_id is null then
    insert into public.shop_trade_categories
      (trade_key, slug, name, description, sort_order, depth, path)
      values ('diagnostics', 'diagnostics', 'Scan', null, 1, 0, 'diagnostics')
      returning id into parent_id;
  end if;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'diagnostics',
      'obd-scanners',
      'OBD Scanners',
      null,
      idx,
      1,
      'diagnostics/obd-scanners'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'diagnostics',
      'diagnostic-scanners',
      'Diagnostic Scanners',
      null,
      idx,
      1,
      'diagnostics/diagnostic-scanners'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'diagnostics',
      'code-readers',
      'Code Readers',
      null,
      idx,
      1,
      'diagnostics/code-readers'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'diagnostics',
      'diagnostic-cables',
      'Diagnostic Cables',
      null,
      idx,
      1,
      'diagnostics/diagnostic-cables'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'diagnostics',
      'adapters',
      'Adapters',
      null,
      idx,
      1,
      'diagnostics/adapters'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'diagnostics',
      'oscilloscopes',
      'Oscilloscopes',
      null,
      idx,
      1,
      'diagnostics/oscilloscopes'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'diagnostics',
      'battery-testers',
      'Battery Testers',
      null,
      idx,
      1,
      'diagnostics/battery-testers'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'diagnostics',
      'tpms-tools',
      'TPMS Tools',
      null,
      idx,
      1,
      'diagnostics/tpms-tools'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'diagnostics',
      'ecu-tools',
      'ECU Tools',
      null,
      idx,
      1,
      'diagnostics/ecu-tools'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'diagnostics',
      'diagnostic-accessories',
      'Diagnostic Accessories',
      null,
      idx,
      1,
      'diagnostics/diagnostic-accessories'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'diagnostics',
      'vehicle-coverage',
      'Vehicle Coverage',
      null,
      idx,
      1,
      'diagnostics/vehicle-coverage'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
end $$;

-- ------------------------------------------------------------
-- Wash (wash) vehicleBased=false
-- ------------------------------------------------------------
do $$
declare
  parent_id uuid;
  idx int := 0;
begin
  select id into parent_id from public.shop_trade_categories
    where trade_key = 'wash' and depth = 0 limit 1;
  if parent_id is null then
    insert into public.shop_trade_categories
      (trade_key, slug, name, description, sort_order, depth, path)
      values ('wash', 'wash', 'Wash', null, 1, 0, 'wash')
      returning id into parent_id;
  end if;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'wash',
      'pressure-washers',
      'Pressure Washers',
      null,
      idx,
      1,
      'wash/pressure-washers'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'wash',
      'vacuum',
      'Vacuum',
      null,
      idx,
      1,
      'wash/vacuum'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'wash',
      'foam-cannons',
      'Foam Cannons',
      null,
      idx,
      1,
      'wash/foam-cannons'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'wash',
      'hoses',
      'Hoses',
      null,
      idx,
      1,
      'wash/hoses'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'wash',
      'nozzles',
      'Nozzles',
      null,
      idx,
      1,
      'wash/nozzles'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'wash',
      'brushes',
      'Brushes',
      null,
      idx,
      1,
      'wash/brushes'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'wash',
      'vehicle-wash',
      'Vehicle Wash',
      null,
      idx,
      1,
      'wash/vehicle-wash'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'wash',
      'detailing',
      'Detailing',
      null,
      idx,
      1,
      'wash/detailing'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'wash',
      'interior-cleaning',
      'Interior Cleaning',
      null,
      idx,
      1,
      'wash/interior-cleaning'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'wash',
      'exterior-cleaning',
      'Exterior Cleaning',
      null,
      idx,
      1,
      'wash/exterior-cleaning'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'wash',
      'commercial-cleaning',
      'Commercial Cleaning',
      null,
      idx,
      1,
      'wash/commercial-cleaning'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'wash',
      'cleaning-equipment',
      'Cleaning Equipment',
      null,
      idx,
      1,
      'wash/cleaning-equipment'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
end $$;

-- ------------------------------------------------------------
-- Plumber (plumber) vehicleBased=false
-- ------------------------------------------------------------
do $$
declare
  parent_id uuid;
  idx int := 0;
begin
  select id into parent_id from public.shop_trade_categories
    where trade_key = 'plumber' and depth = 0 limit 1;
  if parent_id is null then
    insert into public.shop_trade_categories
      (trade_key, slug, name, description, sort_order, depth, path)
      values ('plumber', 'plumber', 'Plumber', null, 1, 0, 'plumber')
      returning id into parent_id;
  end if;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'plumber',
      'pipes',
      'Pipes',
      null,
      idx,
      1,
      'plumber/pipes'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'plumber',
      'fittings',
      'Fittings',
      null,
      idx,
      1,
      'plumber/fittings'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'plumber',
      'valves',
      'Valves',
      null,
      idx,
      1,
      'plumber/valves'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'plumber',
      'pumps',
      'Pumps',
      null,
      idx,
      1,
      'plumber/pumps'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'plumber',
      'taps',
      'Taps',
      null,
      idx,
      1,
      'plumber/taps'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'plumber',
      'toilets',
      'Toilets',
      null,
      idx,
      1,
      'plumber/toilets'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'plumber',
      'sinks',
      'Sinks',
      null,
      idx,
      1,
      'plumber/sinks'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'plumber',
      'water-heaters',
      'Water Heaters',
      null,
      idx,
      1,
      'plumber/water-heaters'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'plumber',
      'connectors',
      'Connectors',
      null,
      idx,
      1,
      'plumber/connectors'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'plumber',
      'seals',
      'Seals',
      null,
      idx,
      1,
      'plumber/seals'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'plumber',
      'adhesives',
      'Adhesives',
      null,
      idx,
      1,
      'plumber/adhesives'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'plumber',
      'drainage',
      'Drainage',
      null,
      idx,
      1,
      'plumber/drainage'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'plumber',
      'water-storage',
      'Water Storage',
      null,
      idx,
      1,
      'plumber/water-storage'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'plumber',
      'pressure-equipment',
      'Pressure Equipment',
      null,
      idx,
      1,
      'plumber/pressure-equipment'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'plumber',
      'plumbing-tools',
      'Plumbing Tools',
      null,
      idx,
      1,
      'plumber/plumbing-tools'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
end $$;

-- ------------------------------------------------------------
-- Carpenter (carpenter) vehicleBased=false
-- ------------------------------------------------------------
do $$
declare
  parent_id uuid;
  idx int := 0;
begin
  select id into parent_id from public.shop_trade_categories
    where trade_key = 'carpenter' and depth = 0 limit 1;
  if parent_id is null then
    insert into public.shop_trade_categories
      (trade_key, slug, name, description, sort_order, depth, path)
      values ('carpenter', 'carpenter', 'Carpenter', null, 1, 0, 'carpenter')
      returning id into parent_id;
  end if;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'carpenter',
      'timber',
      'Timber',
      null,
      idx,
      1,
      'carpenter/timber'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'carpenter',
      'boards',
      'Boards',
      null,
      idx,
      1,
      'carpenter/boards'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'carpenter',
      'plywood',
      'Plywood',
      null,
      idx,
      1,
      'carpenter/plywood'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'carpenter',
      'mdf',
      'MDF',
      null,
      idx,
      1,
      'carpenter/mdf'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'carpenter',
      'fasteners',
      'Fasteners',
      null,
      idx,
      1,
      'carpenter/fasteners'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'carpenter',
      'nails',
      'Nails',
      null,
      idx,
      1,
      'carpenter/nails'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'carpenter',
      'screws',
      'Screws',
      null,
      idx,
      1,
      'carpenter/screws'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'carpenter',
      'hinges',
      'Hinges',
      null,
      idx,
      1,
      'carpenter/hinges'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'carpenter',
      'handles',
      'Handles',
      null,
      idx,
      1,
      'carpenter/handles'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'carpenter',
      'saws',
      'Saws',
      null,
      idx,
      1,
      'carpenter/saws'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'carpenter',
      'drills',
      'Drills',
      null,
      idx,
      1,
      'carpenter/drills'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'carpenter',
      'planers',
      'Planers',
      null,
      idx,
      1,
      'carpenter/planers'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'carpenter',
      'sanders',
      'Sanders',
      null,
      idx,
      1,
      'carpenter/sanders'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'carpenter',
      'routers',
      'Routers',
      null,
      idx,
      1,
      'carpenter/routers'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'carpenter',
      'measuring-tools',
      'Measuring Tools',
      null,
      idx,
      1,
      'carpenter/measuring-tools'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'carpenter',
      'adhesives',
      'Adhesives',
      null,
      idx,
      1,
      'carpenter/adhesives'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'carpenter',
      'workshop-equipment',
      'Workshop Equipment',
      null,
      idx,
      1,
      'carpenter/workshop-equipment'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
end $$;

-- ------------------------------------------------------------
-- Painter (painter) vehicleBased=false
-- ------------------------------------------------------------
do $$
declare
  parent_id uuid;
  idx int := 0;
begin
  select id into parent_id from public.shop_trade_categories
    where trade_key = 'painter' and depth = 0 limit 1;
  if parent_id is null then
    insert into public.shop_trade_categories
      (trade_key, slug, name, description, sort_order, depth, path)
      values ('painter', 'painter', 'Painter', null, 1, 0, 'painter')
      returning id into parent_id;
  end if;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'painter',
      'interior-paint',
      'Interior Paint',
      null,
      idx,
      1,
      'painter/interior-paint'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'painter',
      'exterior-paint',
      'Exterior Paint',
      null,
      idx,
      1,
      'painter/exterior-paint'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'painter',
      'industrial-coatings',
      'Industrial Coatings',
      null,
      idx,
      1,
      'painter/industrial-coatings'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'painter',
      'automotive-paint',
      'Automotive Paint',
      null,
      idx,
      1,
      'painter/automotive-paint'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'painter',
      'primer',
      'Primer',
      null,
      idx,
      1,
      'painter/primer'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'painter',
      'thinner',
      'Thinner',
      null,
      idx,
      1,
      'painter/thinner'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'painter',
      'brushes',
      'Brushes',
      null,
      idx,
      1,
      'painter/brushes'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'painter',
      'rollers',
      'Rollers',
      null,
      idx,
      1,
      'painter/rollers'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'painter',
      'spray-guns',
      'Spray Guns',
      null,
      idx,
      1,
      'painter/spray-guns'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'painter',
      'sandpaper',
      'Sandpaper',
      null,
      idx,
      1,
      'painter/sandpaper'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'painter',
      'masking',
      'Masking',
      null,
      idx,
      1,
      'painter/masking'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'painter',
      'protective-equipment',
      'Protective Equipment',
      null,
      idx,
      1,
      'painter/protective-equipment'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'painter',
      'painting-equipment',
      'Painting Equipment',
      null,
      idx,
      1,
      'painter/painting-equipment'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
end $$;

-- ------------------------------------------------------------
-- Solar (solar) vehicleBased=false
-- ------------------------------------------------------------
do $$
declare
  parent_id uuid;
  idx int := 0;
begin
  select id into parent_id from public.shop_trade_categories
    where trade_key = 'solar' and depth = 0 limit 1;
  if parent_id is null then
    insert into public.shop_trade_categories
      (trade_key, slug, name, description, sort_order, depth, path)
      values ('solar', 'solar', 'Solar', null, 1, 0, 'solar')
      returning id into parent_id;
  end if;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'solar',
      'solar-panels',
      'Solar Panels',
      null,
      idx,
      1,
      'solar/solar-panels'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'solar',
      'inverters',
      'Inverters',
      null,
      idx,
      1,
      'solar/inverters'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'solar',
      'batteries',
      'Batteries',
      null,
      idx,
      1,
      'solar/batteries'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'solar',
      'charge-controllers',
      'Charge Controllers',
      null,
      idx,
      1,
      'solar/charge-controllers'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'solar',
      'mppt',
      'MPPT',
      null,
      idx,
      1,
      'solar/mppt'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'solar',
      'mounting',
      'Mounting',
      null,
      idx,
      1,
      'solar/mounting'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'solar',
      'solar-cables',
      'Solar Cables',
      null,
      idx,
      1,
      'solar/solar-cables'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'solar',
      'mc4',
      'MC4',
      null,
      idx,
      1,
      'solar/mc4'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'solar',
      'combiner-boxes',
      'Combiner Boxes',
      null,
      idx,
      1,
      'solar/combiner-boxes'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'solar',
      'dc-protection',
      'DC Protection',
      null,
      idx,
      1,
      'solar/dc-protection'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'solar',
      'ac-protection',
      'AC Protection',
      null,
      idx,
      1,
      'solar/ac-protection'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'solar',
      'monitoring',
      'Monitoring',
      null,
      idx,
      1,
      'solar/monitoring'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'solar',
      'solar-pumps',
      'Solar Pumps',
      null,
      idx,
      1,
      'solar/solar-pumps'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'solar',
      'solar-lighting',
      'Solar Lighting',
      null,
      idx,
      1,
      'solar/solar-lighting'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'solar',
      'installation-tools',
      'Installation Tools',
      null,
      idx,
      1,
      'solar/installation-tools'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'solar',
      'accessories',
      'Accessories',
      null,
      idx,
      1,
      'solar/accessories'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
end $$;

-- ------------------------------------------------------------
-- Generator (generator) vehicleBased=false
-- ------------------------------------------------------------
do $$
declare
  parent_id uuid;
  idx int := 0;
begin
  select id into parent_id from public.shop_trade_categories
    where trade_key = 'generator' and depth = 0 limit 1;
  if parent_id is null then
    insert into public.shop_trade_categories
      (trade_key, slug, name, description, sort_order, depth, path)
      values ('generator', 'generator', 'Generator', null, 1, 0, 'generator')
      returning id into parent_id;
  end if;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'generator',
      'portable-generators',
      'Portable Generators',
      null,
      idx,
      1,
      'generator/portable-generators'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'generator',
      'standby-generators',
      'Standby Generators',
      null,
      idx,
      1,
      'generator/standby-generators'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'generator',
      'industrial-generators',
      'Industrial Generators',
      null,
      idx,
      1,
      'generator/industrial-generators'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'generator',
      'diesel',
      'Diesel',
      null,
      idx,
      1,
      'generator/diesel'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'generator',
      'petrol',
      'Petrol',
      null,
      idx,
      1,
      'generator/petrol'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'generator',
      'engines',
      'Engines',
      null,
      idx,
      1,
      'generator/engines'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'generator',
      'alternators',
      'Alternators',
      null,
      idx,
      1,
      'generator/alternators'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'generator',
      'avr',
      'AVR',
      null,
      idx,
      1,
      'generator/avr'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'generator',
      'control-panels',
      'Control Panels',
      null,
      idx,
      1,
      'generator/control-panels'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'generator',
      'starters',
      'Starters',
      null,
      idx,
      1,
      'generator/starters'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'generator',
      'fuel-systems',
      'Fuel Systems',
      null,
      idx,
      1,
      'generator/fuel-systems'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'generator',
      'cooling',
      'Cooling',
      null,
      idx,
      1,
      'generator/cooling'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'generator',
      'exhaust',
      'Exhaust',
      null,
      idx,
      1,
      'generator/exhaust'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'generator',
      'filters',
      'Filters',
      null,
      idx,
      1,
      'generator/filters'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'generator',
      'batteries',
      'Batteries',
      null,
      idx,
      1,
      'generator/batteries'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'generator',
      'sensors',
      'Sensors',
      null,
      idx,
      1,
      'generator/sensors'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'generator',
      'transfer-switches',
      'Transfer Switches',
      null,
      idx,
      1,
      'generator/transfer-switches'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'generator',
      'generator-tools',
      'Generator Tools',
      null,
      idx,
      1,
      'generator/generator-tools'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (
      parent_id,
      'generator',
      'maintenance-parts',
      'Maintenance Parts',
      null,
      idx,
      1,
      'generator/maintenance-parts'
    )
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
end $$;

-- ------------------------------------------------------------
-- Remove any depth-1 category not in the taxonomy allowlist
-- (e.g. legacy sample: mechanic/brake-system, mechanic/engine-oil,
-- plumber/pipes-fittings, generator/portable) when unreferenced.
-- ------------------------------------------------------------
do $$
declare
  allowed text[] := array[
    'mechanic/engine','mechanic/transmission','mechanic/brakes','mechanic/suspension','mechanic/steering','mechanic/cooling',
    'mechanic/fuel','mechanic/exhaust','mechanic/electrical','mechanic/sensors','mechanic/filters','mechanic/lighting',
    'mechanic/maintenance','mechanic/tools','mechanic/garage-equipment','vulcanizer/tires','vulcanizer/tubes','vulcanizer/rims',
    'vulcanizer/wheels','vulcanizer/tpms','vulcanizer/valves','vulcanizer/patches','vulcanizer/tire-repair','vulcanizer/balancing',
    'vulcanizer/alignment','vulcanizer/tire-changers','vulcanizer/compressors','vulcanizer/vulcanizing-equipment','towing/tow-straps','towing/chains',
    'towing/winches','towing/tow-bars','towing/dollies','towing/recovery-equipment','towing/warning-equipment','towing/trailer-equipment',
    'towing/towing-accessories','ac/vehicle-ac','ac/commercial-ac','ac/industrial-ac','ac/compressors','ac/condensers',
    'ac/evaporators','ac/blowers','ac/fans','ac/controls','ac/sensors','ac/refrigeration-equipment',
    'ac/ac-tools','battery/vehicle-batteries','battery/battery-chargers','battery/battery-testers','battery/jump-starters','battery/terminals',
    'battery/cables','battery/battery-boxes','battery/battery-accessories','battery/diagnostic-equipment','body/doors','body/bonnets',
    'body/trunks','body/fenders','body/bumpers','body/grilles','body/mirrors','body/panels',
    'body/headlights','body/tail-lights','body/glass','body/body-hardware','body/paint','body/body-repair',
    'body/body-tools','electrical/cables','electrical/wires','electrical/switches','electrical/sockets','electrical/breakers',
    'electrical/contactors','electrical/relays','electrical/transformers','electrical/motors','electrical/panels','electrical/distribution',
    'electrical/lighting','electrical/testing-equipment','electrical/industrial-electrical','electrical/automotive-electrical','diagnostics/obd-scanners','diagnostics/diagnostic-scanners',
    'diagnostics/code-readers','diagnostics/diagnostic-cables','diagnostics/adapters','diagnostics/oscilloscopes','diagnostics/battery-testers','diagnostics/tpms-tools',
    'diagnostics/ecu-tools','diagnostics/diagnostic-accessories','diagnostics/vehicle-coverage','wash/pressure-washers','wash/vacuum','wash/foam-cannons',
    'wash/hoses','wash/nozzles','wash/brushes','wash/vehicle-wash','wash/detailing','wash/interior-cleaning',
    'wash/exterior-cleaning','wash/commercial-cleaning','wash/cleaning-equipment','plumber/pipes','plumber/fittings','plumber/valves',
    'plumber/pumps','plumber/taps','plumber/toilets','plumber/sinks','plumber/water-heaters','plumber/connectors',
    'plumber/seals','plumber/adhesives','plumber/drainage','plumber/water-storage','plumber/pressure-equipment','plumber/plumbing-tools',
    'carpenter/timber','carpenter/boards','carpenter/plywood','carpenter/mdf','carpenter/fasteners','carpenter/nails',
    'carpenter/screws','carpenter/hinges','carpenter/handles','carpenter/saws','carpenter/drills','carpenter/planers',
    'carpenter/sanders','carpenter/routers','carpenter/measuring-tools','carpenter/adhesives','carpenter/workshop-equipment','painter/interior-paint',
    'painter/exterior-paint','painter/industrial-coatings','painter/automotive-paint','painter/primer','painter/thinner','painter/brushes',
    'painter/rollers','painter/spray-guns','painter/sandpaper','painter/masking','painter/protective-equipment','painter/painting-equipment',
    'solar/solar-panels','solar/inverters','solar/batteries','solar/charge-controllers','solar/mppt','solar/mounting',
    'solar/solar-cables','solar/mc4','solar/combiner-boxes','solar/dc-protection','solar/ac-protection','solar/monitoring',
    'solar/solar-pumps','solar/solar-lighting','solar/installation-tools','solar/accessories','generator/portable-generators','generator/standby-generators',
    'generator/industrial-generators','generator/diesel','generator/petrol','generator/engines','generator/alternators','generator/avr',
    'generator/control-panels','generator/starters','generator/fuel-systems','generator/cooling','generator/exhaust','generator/filters',
    'generator/batteries','generator/sensors','generator/transfer-switches','generator/generator-tools','generator/maintenance-parts'
  ]::text[];
  r record;
begin
  for r in
    select c.id
    from public.shop_trade_categories c
    where c.depth = 1
      and not (array_position(allowed, c.trade_key || '/' || c.slug) is not null)
      and not exists (
        select 1 from public.shop_products p
        where p.category_id = c.id
      )
  loop
    delete from public.shop_trade_categories where id = r.id;
  end loop;
end $$;
