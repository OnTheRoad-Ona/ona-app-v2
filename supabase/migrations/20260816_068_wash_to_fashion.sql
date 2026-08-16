-- ============================================================
-- Rename trade "wash" → "fashion" (fashion designers)
--
-- 1) Rename the pro_service enum value (no DB rows currently use
--    'wash' for user profiles / service_requests — verified).
-- 2) Replace the shop category tree: delete the wash cleaning
--    equipment tree and insert the fashion designer tree.
-- 3) Remove wash demo products (cleaning gear) and staging rows;
--    the fashion shop is re-seeded by shop-demo-sync with
--    fashion-appropriate products.
-- 4) Rename the demo brand so future syncs match.
-- ============================================================

-- 1) Enum: wash → fashion
alter type public.pro_service rename value 'wash' to 'fashion';

-- 2) Products first (category_id has on delete restrict via
--    shop_products.category_id → shop_trade_categories).
delete from public.shop_products where trade_key = 'wash';

-- Staging / transient rows tied to the old trade.
delete from public.shop_staging_records where trade_key = 'wash';

-- 3) Delete old wash category tree (children cascade from root).
delete from public.shop_trade_categories where trade_key = 'wash';

-- 4) Insert the fashion category tree.
do $$
declare
  parent_id uuid;
  idx int := 0;
begin
  insert into public.shop_trade_categories
    (trade_key, slug, name, description, sort_order, depth, path)
    values ('fashion', 'fashion', 'Fashion', null, 1, 0, 'fashion')
    returning id into parent_id;

  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (parent_id, 'fashion', 'fabrics-textiles', 'Fabrics & Textiles', null, idx, 1, 'fashion/fabrics-textiles')
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;

  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (parent_id, 'fashion', 'sewing-machines', 'Sewing Machines', null, idx, 1, 'fashion/sewing-machines')
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;

  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (parent_id, 'fashion', 'sewing-tools-accessories', 'Sewing Tools & Accessories', null, idx, 1, 'fashion/sewing-tools-accessories')
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;

  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (parent_id, 'fashion', 'threads', 'Threads', null, idx, 1, 'fashion/threads')
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;

  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (parent_id, 'fashion', 'buttons-fasteners', 'Buttons & Fasteners', null, idx, 1, 'fashion/buttons-fasteners')
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;

  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (parent_id, 'fashion', 'zippers', 'Zippers', null, idx, 1, 'fashion/zippers')
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;

  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (parent_id, 'fashion', 'patterns', 'Patterns', null, idx, 1, 'fashion/patterns')
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;

  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (parent_id, 'fashion', 'trims-laces', 'Trims & Laces', null, idx, 1, 'fashion/trims-laces')
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;

  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (parent_id, 'fashion', 'embroidery-supplies', 'Embroidery Supplies', null, idx, 1, 'fashion/embroidery-supplies')
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;

  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (parent_id, 'fashion', 'mannequins-display', 'Mannequins & Display', null, idx, 1, 'fashion/mannequins-display')
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;

  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (parent_id, 'fashion', 'tailoring-equipment', 'Tailoring Equipment', null, idx, 1, 'fashion/tailoring-equipment')
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;

  idx := idx + 1;
  insert into public.shop_trade_categories
    (parent_id, trade_key, slug, name, description, sort_order, depth, path)
    values (parent_id, 'fashion', 'garments-uniforms', 'Garments & Uniforms', null, idx, 1, 'fashion/garments-uniforms')
    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;
end $$;

-- 5) Demo brand: ona-demo-wash → ona-demo-fashion
update public.shop_brands
  set slug = 'ona-demo-fashion', name = 'Ona Fashion Demo'
  where slug = 'ona-demo-wash';