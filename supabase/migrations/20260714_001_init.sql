-- Ona backend schema
-- Roles: admin | motorist | repair_pro (one role per user)

create extension if not exists "pgcrypto";

create type public.user_role as enum ('admin', 'motorist', 'repair_pro');
create type public.pro_service as enum (
  'mechanic', 'vulcanizer', 'towing', 'battery', 'ac',
  'body', 'electrical', 'diagnostics', 'wash'
);
create type public.pro_status as enum ('pending', 'approved', 'suspended', 'rejected');
create type public.job_status as enum (
  'draft', 'requested', 'matched', 'accepted',
  'en_route', 'in_progress', 'completed', 'cancelled'
);
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');

-- ── Profiles (1:1 with auth.users, single role) ──────────────────────────────
create table public.profiles (
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
  updated_at timestamptz not null default now(),
  constraint profiles_phone_unique unique (phone),
  constraint profiles_email_unique unique (email)
);

create index profiles_role_idx on public.profiles (role);
create index profiles_is_active_idx on public.profiles (is_active);

-- ── Motorist ─────────────────────────────────────────────────────────────────
create table public.motorist_profiles (
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

-- ── Repair Pro ───────────────────────────────────────────────────────────────
create table public.repair_pro_profiles (
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

create index repair_pro_status_idx on public.repair_pro_profiles (status);
create index repair_pro_online_idx on public.repair_pro_profiles (is_online);

-- ── Service requests / jobs ──────────────────────────────────────────────────
create table public.service_requests (
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

create index service_requests_status_idx on public.service_requests (status);
create index service_requests_motorist_idx on public.service_requests (motorist_id);
create index service_requests_pro_idx on public.service_requests (repair_pro_id);

create table public.job_status_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  status public.job_status not null,
  note text,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ── Bookings ─────────────────────────────────────────────────────────────────
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.service_requests (id) on delete cascade,
  motorist_id uuid not null references public.profiles (id) on delete restrict,
  repair_pro_id uuid not null references public.profiles (id) on delete restrict,
  starts_at timestamptz,
  ends_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

-- ── Payments ─────────────────────────────────────────────────────────────────
create table public.payments (
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

create index payments_status_idx on public.payments (status);

-- ── Messaging ────────────────────────────────────────────────────────────────
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.service_requests (id) on delete set null,
  motorist_id uuid not null references public.profiles (id) on delete cascade,
  repair_pro_id uuid not null references public.profiles (id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- ── Reviews ──────────────────────────────────────────────────────────────────
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.service_requests (id) on delete cascade,
  motorist_id uuid not null references public.profiles (id) on delete restrict,
  repair_pro_id uuid not null references public.profiles (id) on delete restrict,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz not null default now()
);

-- ── Notifications ────────────────────────────────────────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── Admin audit ──────────────────────────────────────────────────────────────
create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles (id) on delete restrict,
  action text not null,
  target_user_id uuid references public.profiles (id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_actions_created_idx on public.admin_actions (created_at desc);

-- ── updated_at helper ────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger motorist_profiles_updated_at
  before update on public.motorist_profiles
  for each row execute function public.set_updated_at();

create trigger repair_pro_profiles_updated_at
  before update on public.repair_pro_profiles
  for each row execute function public.set_updated_at();

create trigger service_requests_updated_at
  before update on public.service_requests
  for each row execute function public.set_updated_at();

create trigger payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ── Auto-create profile on signup ────────────────────────────────────────────
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
  -- Never allow self-signup as admin via metadata
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Role helpers ─────────────────────────────────────────────────────────────
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

-- ── RLS ──────────────────────────────────────────────────────────────────────
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

-- Profiles
create policy profiles_select_own_or_admin on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy profiles_update_own on public.profiles
  for update using (id = auth.uid() or public.is_admin());

create policy profiles_admin_insert on public.profiles
  for insert with check (public.is_admin() or id = auth.uid());

-- Motorist profiles
create policy motorist_select on public.motorist_profiles
  for select using (user_id = auth.uid() or public.is_admin());
create policy motorist_upsert on public.motorist_profiles
  for all using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- Repair pro: public can read approved pros; owner/admin full
create policy pro_select on public.repair_pro_profiles
  for select using (
    status = 'approved'
    or user_id = auth.uid()
    or public.is_admin()
  );
create policy pro_upsert on public.repair_pro_profiles
  for all using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- Service requests
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
    motorist_id = auth.uid()
    or repair_pro_id = auth.uid()
    or public.is_admin()
  );

-- Job events
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

-- Bookings
create policy bookings_select on public.bookings
  for select using (
    motorist_id = auth.uid() or repair_pro_id = auth.uid() or public.is_admin()
  );
create policy bookings_write on public.bookings
  for all using (public.is_admin() or motorist_id = auth.uid() or repair_pro_id = auth.uid())
  with check (public.is_admin() or motorist_id = auth.uid() or repair_pro_id = auth.uid());

-- Payments
create policy payments_select on public.payments
  for select using (
    motorist_id = auth.uid() or repair_pro_id = auth.uid() or public.is_admin()
  );
create policy payments_admin_write on public.payments
  for all using (public.is_admin())
  with check (public.is_admin());

-- Conversations / messages
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

-- Reviews
create policy reviews_select on public.reviews
  for select using (true);
create policy reviews_insert_motorist on public.reviews
  for insert with check (motorist_id = auth.uid() or public.is_admin());

-- Notifications
create policy notifications_own on public.notifications
  for all using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- Admin actions: admin only
create policy admin_actions_admin on public.admin_actions
  for all using (public.is_admin())
  with check (public.is_admin());
