-- Marketplace radius hard-cap: 10 km → 5 km (slider, pairing, pro coverage).

alter table if exists public.repair_pro_profiles
  alter column service_radius_km set default 5;

alter table if exists public.service_requests
  alter column radius_km set default 5;

update public.repair_pro_profiles
set service_radius_km = 5
where service_radius_km is null or service_radius_km > 5;

update public.service_requests
set
  radius_km = least(coalesce(radius_km, 5), 5),
  pairing_radius_km = case
    when pairing_radius_km is null then pairing_radius_km
    else least(pairing_radius_km, 5)
  end
where coalesce(radius_km, 0) > 5
   or coalesce(pairing_radius_km, 0) > 5;

update public.app_settings
set value = jsonb_set(
  jsonb_set(value, '{maxRadiusKm}', '5'::jsonb, true),
  '{defaultRadiusKm}',
  '5'::jsonb,
  true
)
where key = 'matching';
