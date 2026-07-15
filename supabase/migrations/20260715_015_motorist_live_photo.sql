-- Motorist live tracking + avatar on jobs
alter table public.service_requests
  add column if not exists motorist_photo text,
  add column if not exists motorist_location_at timestamptz;

comment on column public.service_requests.motorist_photo is
  'Motorist profile avatar URL for pro-facing trip UI';
comment on column public.service_requests.motorist_location_at is
  'Last live GPS ping from motorist during active trip';
