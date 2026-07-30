-- Pro reviews: aggregate rating + review from customers to repair pros.

create table if not exists public.pro_reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.service_requests(id) on delete cascade,
  motorist_id uuid not null references public.profiles(id) on delete cascade,
  repair_pro_id uuid not null references public.repair_pro_profiles(user_id) on delete cascade,
  rating smallint not null check (rating >= 1 and rating <= 5),
  comment text,
  photos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One review per job per motorist
  unique(job_id, motorist_id)
);

-- Indexes for fast pro aggregation
create index if not exists idx_pro_reviews_pro_id on public.pro_reviews(repair_pro_id);
create index if not exists idx_pro_reviews_created_at on public.pro_reviews(created_at desc);

-- Row-level security
alter table public.pro_reviews enable row level security;

-- Anyone can read reviews for a pro
create policy "Anyone can read pro reviews"
  on public.pro_reviews for select
  using (true);

-- Only the motorist who completed the job can insert
-- (server-side also enforces job completion check)
create policy "Motorist can insert own review"
  on public.pro_reviews for insert
  with check (auth.uid() = motorist_id);

-- Reviews cannot be updated or deleted by users (admin only via DB)
create policy "No public update"
  on public.pro_reviews for update
  using (false);

create policy "No public delete"
  on public.pro_reviews for delete
  using (false);
