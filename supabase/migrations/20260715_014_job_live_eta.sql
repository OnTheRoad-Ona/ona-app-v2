-- Live tracking ETA fields from Google Distance Matrix
alter table public.service_requests
  add column if not exists eta_text text,
  add column if not exists distance_text text,
  add column if not exists eta_source text,
  add column if not exists pro_location_at timestamptz;

comment on column public.service_requests.eta_source is
  'google_distance_matrix | haversine_fallback';
