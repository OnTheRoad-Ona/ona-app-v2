-- ------------------------------------------------------------
-- Vehicle types: so My Vehicles is not auto-only.
-- A make can span multiple types (Mercedes → car/truck/bus);
-- type_slugs on vehicle_makes + choice on user_vehicles.
-- ------------------------------------------------------------

create table if not exists public.vehicle_types (
  slug text primary key,
  name text not null,
  sort_order int not null default 99
);

insert into public.vehicle_types (slug, name, sort_order) values
  ('automobile', 'Automobile', 1),
  ('motorcycle', 'Motorcycle', 2),
  ('truck', 'Truck', 3),
  ('van', 'Van', 4),
  ('bus', 'Bus', 5),
  ('trailer', 'Trailer', 6),
  ('motorhome', 'Motorhome / RV', 7),
  ('atv_utv', 'ATV / UTV', 8),
  ('construction_ag', 'Construction & Ag', 9),
  ('other', 'Other', 10)
on conflict (slug) do nothing;

-- A make can belong to multiple vehicle types
alter table public.vehicle_makes
  add column if not exists type_slugs text[] not null default '{}';

create index if not exists vehicle_makes_types_idx
  on public.vehicle_makes using gin (type_slugs);

-- The type chosen by the user when saving a garage vehicle
alter table public.user_vehicles
  add column if not exists vehicle_type_slug text
    references public.vehicle_types (slug);

comment on column public.vehicle_makes.type_slugs is
  'Vehicle types this make belongs to (automobile, truck, motorcycle, trailer, …).';
comment on column public.user_vehicles.vehicle_type_slug is
  'Vehicle type chosen when saving (Automobile, Trailer, Truck, …).';