-- Persist which customer vehicle needs help on each job request
alter table if exists public.service_requests
  add column if not exists motorist_vehicle text;
