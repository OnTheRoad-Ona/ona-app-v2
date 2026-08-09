-- Shop product gallery + storage + catalog permission seed

create table if not exists public.shop_product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.shop_products (id) on delete cascade,
  url text not null,
  storage_path text,
  sort_order int not null default 0,
  alt_text text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists shop_product_images_product_idx
  on public.shop_product_images (product_id, sort_order);

-- Public product media bucket (service role writes via admin API)
insert into storage.buckets (id, name, public)
values ('shop-media', 'shop-media', true)
on conflict (id) do nothing;

drop policy if exists "Public read shop media" on storage.objects;
create policy "Public read shop media"
  on storage.objects for select
  to public
  using (bucket_id = 'shop-media');

drop policy if exists "Service role manage shop media" on storage.objects;
create policy "Service role manage shop media"
  on storage.objects for all
  to service_role
  using (bucket_id = 'shop-media')
  with check (bucket_id = 'shop-media');

-- rbac_permissions uses id (not key) as the permission primary key
insert into public.rbac_permissions (id, module, description)
select 'shop.catalog', 'shop', 'Manage ONA Shop catalog, prices, inventory, media'
where exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'rbac_permissions'
)
and not exists (
  select 1 from public.rbac_permissions where id = 'shop.catalog'
);

comment on table public.shop_product_images is
  'Gallery images for shop products; primary also mirrored on shop_products.primary_image_url';
