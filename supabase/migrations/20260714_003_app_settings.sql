-- App-wide settings controlled by Super Admin (drives frontend behaviour)

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create index if not exists app_settings_updated_idx on public.app_settings (updated_at desc);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_admin_all on public.app_settings;
create policy app_settings_admin_all on public.app_settings
  for all using (public.is_admin())
  with check (public.is_admin());

-- Public read of non-secret keys is via service-role API route, not direct client.

grant all on table public.app_settings to postgres, anon, authenticated, service_role;

-- Seed defaults (idempotent)
insert into public.app_settings (key, value) values
(
  'app',
  '{
    "name": "Ona",
    "tagline": "Roadside help when you need it",
    "supportEmail": "support@ona.com",
    "supportPhone": "",
    "maintenanceMode": false,
    "maintenanceMessage": "We are upgrading Ona. Please try again shortly.",
    "defaultTheme": "light",
    "forceTheme": null
  }'::jsonb
),
(
  'features',
  '{
    "signupMotorist": true,
    "signupPro": true,
    "mapsLive": true,
    "paymentsEnabled": true,
    "chatEnabled": true,
    "reviewsEnabled": true,
    "bookingsEnabled": true,
    "proOnlineToggle": true,
    "identityVerifyEnabled": true
  }'::jsonb
),
(
  'matching',
  '{
    "maxRadiusKm": 10,
    "defaultRadiusKm": 5,
    "maxTechnicians": 50,
    "minRatingFilter": 0
  }'::jsonb
),
(
  'verification',
  '{
    "warnFrom": 2,
    "blockAt": 5,
    "requireNin": true,
    "requireBvn": true
  }'::jsonb
),
(
  'content',
  '{
    "homeSearchPlaceholder": "Search problem, technician, service...",
    "requestProblems": [
      "Flat tire / puncture",
      "Engine issue",
      "Battery dead",
      "Brakes problem",
      "Car stuck / towing",
      "Other roadside help"
    ],
    "homeBanner": "",
    "loginSubtitle": "Motorist & Repair Pro"
  }'::jsonb
),
(
  'services',
  '{
    "enabled": ["mechanic","vulcanizer","towing","battery","ac","body","electrical","diagnostics","wash"],
    "labels": {}
  }'::jsonb
)
on conflict (key) do nothing;
