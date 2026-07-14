-- OgaMecho: full schema (safe to re-run) + seed Super Admin profile
-- Run in Supabase SQL Editor on project akasyjovvyhtmzpkliay
-- Then reply "tables ready"

create extension if not exists "pgcrypto";

do $$ begin
  create type public.user_role as enum ('admin', 'motorist', 'repair_pro');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.pro_service as enum (
    'mechanic', 'vulcanizer', 'towing', 'battery', 'ac',
    'body', 'electrical', 'diagnostics', 'wash'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.pro_status as enum ('pending', 'approved', 'suspended', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.job_status as enum (
    'draft', 'requested', 'matched', 'accepted',
    'en_route', 'in_progress', 'completed', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'motorist',
  full_name text not null default '',
  phone text,
  email text,
  avatar_url text,
  city text,
  area text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- unique constraints if missing
do $$ begin
  alter table public.profiles add constraint profiles_phone_unique unique (phone);
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table public.profiles add constraint profiles_email_unique unique (email);
exception when duplicate_object then null;
end $$;

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_is_active_idx on public.profiles (is_active);

create table if not exists public.motorist_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  default_lat double precision,
  default_lng double precision,
  address_text text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year text,
  plate_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.repair_pro_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  business_name text,
  primary_service public.pro_service not null default 'mechanic',
  services public.pro_service[] not null default '{}',
  status public.pro_status not null default 'pending',
  is_online boolean not null default false,
  rating_avg numeric(3, 2) not null default 0,
  rating_count integer not null default 0,
  lat double precision,
  lng double precision,
  service_radius_km integer not null default 10,
  years_experience text,
  bio text,
  verified boolean not null default false,
  nin_last4 text,
  bvn_last4 text,
  nin_verified boolean not null default false,
  bvn_verified boolean not null default false,
  skills jsonb not null default '[]'::jsonb,
  vehicle_focus jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists repair_pro_status_idx on public.repair_pro_profiles (status);
create index if not exists repair_pro_online_idx on public.repair_pro_profiles (is_online);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  motorist_id uuid not null references public.profiles (id) on delete restrict,
  repair_pro_id uuid references public.profiles (id) on delete set null,
  service_type public.pro_service not null default 'mechanic',
  status public.job_status not null default 'requested',
  description text not null default '',
  pickup_lat double precision,
  pickup_lng double precision,
  pickup_address text,
  radius_km integer not null default 10,
  scheduled_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_requests_status_idx on public.service_requests (status);
create index if not exists service_requests_motorist_idx on public.service_requests (motorist_id);
create index if not exists service_requests_pro_idx on public.service_requests (repair_pro_id);

create table if not exists public.job_status_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  status public.job_status not null,
  note text,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.service_requests (id) on delete cascade,
  motorist_id uuid not null references public.profiles (id) on delete restrict,
  repair_pro_id uuid not null references public.profiles (id) on delete restrict,
  starts_at timestamptz,
  ends_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  motorist_id uuid not null references public.profiles (id) on delete restrict,
  repair_pro_id uuid references public.profiles (id) on delete set null,
  amount_kobo bigint not null default 0,
  currency text not null default 'NGN',
  status public.payment_status not null default 'pending',
  provider text not null default 'manual',
  provider_ref text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_status_idx on public.payments (status);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.service_requests (id) on delete set null,
  motorist_id uuid not null references public.profiles (id) on delete cascade,
  repair_pro_id uuid not null references public.profiles (id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.service_requests (id) on delete cascade,
  motorist_id uuid not null references public.profiles (id) on delete restrict,
  repair_pro_id uuid not null references public.profiles (id) on delete restrict,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles (id) on delete restrict,
  action text not null,
  target_user_id uuid references public.profiles (id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_actions_created_idx on public.admin_actions (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists motorist_profiles_updated_at on public.motorist_profiles;
create trigger motorist_profiles_updated_at
  before update on public.motorist_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists repair_pro_profiles_updated_at on public.repair_pro_profiles;
create trigger repair_pro_profiles_updated_at
  before update on public.repair_pro_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists service_requests_updated_at on public.service_requests;
create trigger service_requests_updated_at
  before update on public.service_requests
  for each row execute function public.set_updated_at();

drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_role public.user_role;
begin
  chosen_role := coalesce(
    (new.raw_user_meta_data ->> 'role')::public.user_role,
    'motorist'::public.user_role
  );
  if chosen_role = 'admin' then
    chosen_role := 'motorist';
  end if;

  insert into public.profiles (id, role, full_name, phone, email)
  values (
    new.id,
    chosen_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone',
    new.email
  )
  on conflict (id) do nothing;

  if chosen_role = 'motorist' then
    insert into public.motorist_profiles (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  elsif chosen_role = 'repair_pro' then
    insert into public.repair_pro_profiles (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active = true
  );
$$;

alter table public.profiles enable row level security;
alter table public.motorist_profiles enable row level security;
alter table public.repair_pro_profiles enable row level security;
alter table public.service_requests enable row level security;
alter table public.job_status_events enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_actions enable row level security;

-- Drop/recreate policies (idempotent)
do $$ 
declare r record;
begin
  for r in (
    select policyname, tablename from pg_policies where schemaname = 'public'
  ) loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy profiles_select_own_or_admin on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid() or public.is_admin());
create policy profiles_admin_insert on public.profiles
  for insert with check (public.is_admin() or id = auth.uid());

create policy motorist_select on public.motorist_profiles
  for select using (user_id = auth.uid() or public.is_admin());
create policy motorist_upsert on public.motorist_profiles
  for all using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy pro_select on public.repair_pro_profiles
  for select using (
    status = 'approved' or user_id = auth.uid() or public.is_admin()
  );
create policy pro_upsert on public.repair_pro_profiles
  for all using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy requests_select on public.service_requests
  for select using (
    motorist_id = auth.uid()
    or repair_pro_id = auth.uid()
    or public.is_admin()
    or (
      public.current_user_role() = 'repair_pro'
      and status in ('requested', 'matched')
    )
  );
create policy requests_insert_motorist on public.service_requests
  for insert with check (motorist_id = auth.uid() or public.is_admin());
create policy requests_update_parties on public.service_requests
  for update using (
    motorist_id = auth.uid() or repair_pro_id = auth.uid() or public.is_admin()
  );

create policy job_events_select on public.job_status_events
  for select using (
    exists (
      select 1 from public.service_requests r
      where r.id = request_id
        and (r.motorist_id = auth.uid() or r.repair_pro_id = auth.uid() or public.is_admin())
    )
  );
create policy job_events_insert on public.job_status_events
  for insert with check (actor_id = auth.uid() or public.is_admin());

create policy bookings_select on public.bookings
  for select using (
    motorist_id = auth.uid() or repair_pro_id = auth.uid() or public.is_admin()
  );
create policy bookings_write on public.bookings
  for all using (public.is_admin() or motorist_id = auth.uid() or repair_pro_id = auth.uid())
  with check (public.is_admin() or motorist_id = auth.uid() or repair_pro_id = auth.uid());

create policy payments_select on public.payments
  for select using (
    motorist_id = auth.uid() or repair_pro_id = auth.uid() or public.is_admin()
  );
create policy payments_admin_write on public.payments
  for all using (public.is_admin())
  with check (public.is_admin());

create policy conversations_select on public.conversations
  for select using (
    motorist_id = auth.uid() or repair_pro_id = auth.uid() or public.is_admin()
  );
create policy conversations_write on public.conversations
  for all using (
    motorist_id = auth.uid() or repair_pro_id = auth.uid() or public.is_admin()
  )
  with check (
    motorist_id = auth.uid() or repair_pro_id = auth.uid() or public.is_admin()
  );

create policy messages_select on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.motorist_id = auth.uid() or c.repair_pro_id = auth.uid() or public.is_admin())
    )
  );
create policy messages_insert on public.messages
  for insert with check (sender_id = auth.uid() or public.is_admin());

create policy reviews_select on public.reviews for select using (true);
create policy reviews_insert_motorist on public.reviews
  for insert with check (motorist_id = auth.uid() or public.is_admin());

create policy notifications_own on public.notifications
  for all using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy admin_actions_admin on public.admin_actions
  for all using (public.is_admin())
  with check (public.is_admin());

-- API grants (required for PostgREST / service role)
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
grant all on all routines in schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;

-- Seed Super Admin profile for existing auth user
insert into public.profiles (id, role, full_name, email, is_active)
values (
  'd2e5f02b-2d60-4c6c-944d-ea3898336660',
  'admin',
  'Oluwatosin Abdullah',
  'oluwatosinabdullahime@gmail.com',
  true
)
on conflict (id) do update set
  role = 'admin',
  full_name = excluded.full_name,
  email = excluded.email,
  is_active = true,
  updated_at = now();

delete from public.motorist_profiles where user_id = 'd2e5f02b-2d60-4c6c-944d-ea3898336660';
delete from public.repair_pro_profiles where user_id = 'd2e5f02b-2d60-4c6c-944d-ea3898336660';

-- Verify
select id, role, email, is_active, full_name from public.profiles
where email = 'oluwatosinabdullahime@gmail.com';
