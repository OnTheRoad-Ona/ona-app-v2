-- Call-out urgency multiplier (Normal / Emergency / Remote / Night)
alter table if exists public.service_request_callouts
  add column if not exists urgency_kind text default 'normal',
  add column if not exists urgency_multiplier numeric default 1;

comment on column public.service_request_callouts.urgency_kind is
  'normal | emergency | remote | night — call-out fee only';
