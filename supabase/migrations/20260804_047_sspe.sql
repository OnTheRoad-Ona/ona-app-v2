-- SSPE: Smart Sequential Pairing Engine + Merit Ranking (Phase 1 schema)
-- Implements plan docs/SSPE_REFACTOR_PLAN.md §4.
-- status / flow_status dual model retained; pairing columns are additive.

-- 4.1 service_requests — dispatch columns --------------------------------
alter table public.service_requests
  add column if not exists chosen_pro_id uuid references public.profiles(id) on delete set null,
  add column if not exists pairing_stage text,
  add column if not exists pairing_deadline timestamptz,
  add column if not exists queue_position integer,
  add column if not exists remaining_candidates integer,
  add column if not exists reservation_status text,
  add column if not exists assignment_status text,
  add column if not exists idempotency_key text,
  add column if not exists pairing_radius_km integer not null default 15;

create index if not exists service_requests_pairing_idx
  on public.service_requests (pairing_stage, pairing_deadline)
  where pairing_deadline is not null;

comment on column public.service_requests.pairing_stage is
  'SSPE dispatch sub-stage: waiting_for_selected | selected_review | sequential_pairing | waiting_for_pro | reserved | negotiating | null';
comment on column public.service_requests.pairing_deadline is
  'Server-owned deadline for the current pairing step (source of truth; 66s). Null when not actively pairing.';
comment on column public.service_requests.pairing_radius_km is
  'Current SSPE search radius; expands 15→20→30→50 km before expiry.';

-- 4.2 request_reservations ------------------------------------------------
create table if not exists public.request_reservations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  pro_id uuid not null references public.profiles(id) on delete cascade,
  stage text not null,
  status text not null default 'active' check (status in ('active','confirmed','released','expired','cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  confirmed_at timestamptz,
  released_by text
);

create index if not exists request_reservations_req_idx
  on public.request_reservations (request_id, status);
create unique index if not exists request_reservations_active_uniq
  on public.request_reservations (request_id) where status = 'active';

-- 4.3 request_pairing_queue ------------------------------------------------
create table if not exists public.request_pairing_queue (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  pro_id uuid not null references public.profiles(id) on delete cascade,
  position integer not null,
  source text not null,
  status text not null default 'pending' check (status in ('pending','offered','opened','accepted','declined','timed_out','deferred','skipped')),
  offered_at timestamptz,
  responded_at timestamptz,
  result_note text,
  created_at timestamptz not null default now()
);

create index if not exists request_pairing_queue_req_idx
  on public.request_pairing_queue (request_id, position);
create unique index if not exists request_pairing_queue_pro_req_uniq
  on public.request_pairing_queue (request_id, pro_id);

-- 4.4 merit_scores ----------------------------------------------------------
create table if not exists public.merit_scores (
  pro_id uuid primary key references public.repair_pro_profiles(user_id) on delete cascade,
  score numeric(6,3) not null,
  verified_bonus numeric(6,3) not null default 0,
  rating_score numeric(6,3) not null default 0,
  jobs_completed_score numeric(6,3) not null default 0,
  review_quality_score numeric(6,3) not null default 0,
  completion_rate_score numeric(6,3) not null default 0,
  dispute_rate_score numeric(6,3) not null default 0,
  response_speed_score numeric(6,3) not null default 0,
  reliability_score numeric(6,3) not null default 0,
  availability_score numeric(6,3) not null default 0,
  profile_completeness_score numeric(6,3) not null default 0,
  recent_activity_score numeric(6,3) not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists merit_scores_score_idx on public.merit_scores (score desc);

-- 4.5 Merit inputs & dispute metrics ---------------------------------------
alter table public.repair_pro_profiles
  add column if not exists disputes_count integer not null default 0,
  add column if not exists disputes_won integer not null default 0,
  add column if not exists cancellations_count integer not null default 0;

-- 4.6 Realtime ---------------------------------------------------------------
-- service_requests is already in the supabase_realtime publication (20260714_004).
-- request_reservations / request_pairing_queue / merit_scores are internal
-- service-role tables; clients read pairing state via /api/jobs payloads only.
-- Nothing to add here.

-- 4.7 pg_cron wrapper (optional; Next route /api/jobs/pairing-sweep is primary) --
-- The SQL sweep performs the timeout transition only (release reservation, mark
-- queue row timed_out, move request to sequential_pairing). Advancing to the next
-- candidate is done by the Node sweep route so the two paths never double-pop.
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    create or replace function public.pairing_sweep() returns void
    language plpgsql security definer set search_path = public as $$
    declare
      r record;
    begin
      for r in
        select id
        from public.service_requests
        where pairing_stage in ('waiting_for_selected','selected_review','waiting_for_pro','reserved')
          and coalesce(reservation_status, '') <> 'confirmed'
          and pairing_deadline is not null
          and pairing_deadline <= now()
        order by pairing_deadline
        limit 50
      loop
        if pg_try_advisory_xact_lock(hashtext('pairing:' || r.id::text)) then
          update public.service_requests s
            set pairing_stage = 'sequential_pairing',
                pairing_deadline = null,
                queue_position = coalesce(queue_position, 0) + 1,
                reservation_status = case when s.reservation_status = 'active' then 'expired' else s.reservation_status end,
                updated_at = now(),
                status_history = coalesce(s.status_history, '[]'::jsonb) ||
                  jsonb_build_object('status','sequential_pairing','at', now(),'by','sweep:timeout')
          where s.id = r.id and s.pairing_stage in
            ('waiting_for_selected','selected_review','waiting_for_pro','reserved');

          update public.request_reservations
            set status = 'expired', released_at = now(), released_by = 'sweep'
            where request_id = r.id and status = 'active';

          update public.request_pairing_queue
            set status = 'timed_out', responded_at = now(), result_note = 'pairing deadline exceeded'
            where request_id = r.id and status in ('pending','offered','opened');
        end if;
      end loop;
    end;
    $$;

    perform cron.schedule('ona-pairing-sweep', '* * * * *', 'select public.pairing_sweep()');
  end if;
end $do$;
