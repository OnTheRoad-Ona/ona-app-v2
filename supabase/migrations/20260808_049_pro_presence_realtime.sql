-- Public pro Live presence for marketplace Realtime.
-- Customers cannot SELECT other rows on repair_pro_profiles (RLS own-row only),
-- so Live/Away never reached the customer client via Realtime on that table.
-- This slim table carries only non-sensitive presence fields and is publicly readable.

create table if not exists public.pro_presence (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  is_online boolean not null default false,
  lat double precision,
  lng double precision,
  location_updated_at timestamptz,
  primary_service text,
  updated_at timestamptz not null default now()
);

create index if not exists pro_presence_online_idx
  on public.pro_presence (is_online)
  where is_online = true;

create index if not exists pro_presence_updated_idx
  on public.pro_presence (updated_at desc);

alter table public.pro_presence enable row level security;

drop policy if exists pro_presence_select on public.pro_presence;
create policy pro_presence_select on public.pro_presence
  for select
  using (true);

drop policy if exists pro_presence_insert_own on public.pro_presence;
create policy pro_presence_insert_own on public.pro_presence
  for insert
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists pro_presence_update_own on public.pro_presence;
create policy pro_presence_update_own on public.pro_presence
  for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists pro_presence_delete_own on public.pro_presence;
create policy pro_presence_delete_own on public.pro_presence
  for delete
  using (user_id = auth.uid() or public.is_admin());

grant select on public.pro_presence to anon, authenticated;
grant insert, update, delete on public.pro_presence to authenticated;
grant all on public.pro_presence to service_role, postgres;

-- Realtime publication (idempotent)
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pro_presence'
  ) then
    alter publication supabase_realtime add table public.pro_presence;
  end if;
exception
  when others then
    raise notice 'pro_presence realtime publication: %', sqlerrm;
end $$;

-- Keep presence in sync whenever Live/GPS changes on the pro profile
create or replace function public.sync_pro_presence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pro_presence (
    user_id,
    is_online,
    lat,
    lng,
    location_updated_at,
    primary_service,
    updated_at
  )
  values (
    new.user_id,
    coalesce(new.is_online, false),
    new.lat,
    new.lng,
    new.location_updated_at,
    new.primary_service::text,
    now()
  )
  on conflict (user_id) do update set
    is_online = excluded.is_online,
    lat = excluded.lat,
    lng = excluded.lng,
    location_updated_at = excluded.location_updated_at,
    primary_service = excluded.primary_service,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sync_pro_presence on public.repair_pro_profiles;
create trigger trg_sync_pro_presence
  after insert or update of is_online, lat, lng, location_updated_at, primary_service
  on public.repair_pro_profiles
  for each row
  execute function public.sync_pro_presence();

-- Backfill current Live (and offline) rows so Realtime has a baseline
insert into public.pro_presence (
  user_id,
  is_online,
  lat,
  lng,
  location_updated_at,
  primary_service,
  updated_at
)
select
  r.user_id,
  coalesce(r.is_online, false),
  r.lat,
  r.lng,
  r.location_updated_at,
  r.primary_service::text,
  now()
from public.repair_pro_profiles r
on conflict (user_id) do update set
  is_online = excluded.is_online,
  lat = excluded.lat,
  lng = excluded.lng,
  location_updated_at = excluded.location_updated_at,
  primary_service = excluded.primary_service,
  updated_at = now();

comment on table public.pro_presence is
  'Public Live/Away presence for marketplace Realtime. No bank/ID/secrets. Customers subscribe here; full pro payload still via service-role /api/pros.';
