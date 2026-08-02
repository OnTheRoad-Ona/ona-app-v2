-- Dual-role / Tap-to-Switch tracking on profiles
-- primary_role = original signup (motorist=Customer, repair_pro=Professional)
-- last_role_switch_at / role_switch_count = switch history for Care admin

alter table public.profiles
  add column if not exists primary_role public.user_role,
  add column if not exists last_role_switch_at timestamptz,
  add column if not exists role_switch_count integer not null default 0;

comment on column public.profiles.primary_role is
  'Original signup role. Fixed after first set. motorist=Customer Role, repair_pro=Professional Role.';
comment on column public.profiles.last_role_switch_at is
  'Timestamp of last successful Motorist ↔ Repair Pro switch.';
comment on column public.profiles.role_switch_count is
  'Count of successful role switches (Tap to Switch).';

-- Backfill primary_role from earlier side profile when dual; else current role
update public.profiles p
set primary_role = coalesce(
  (
    select case
      when m.user_id is not null and r.user_id is not null then
        case
          when coalesce(m.created_at, 'epoch'::timestamptz)
            <= coalesce(r.created_at, 'epoch'::timestamptz)
          then 'motorist'::public.user_role
          else 'repair_pro'::public.user_role
        end
      when m.user_id is not null then 'motorist'::public.user_role
      when r.user_id is not null then 'repair_pro'::public.user_role
      else p.role
    end
    from (select 1) _
    left join public.motorist_profiles m on m.user_id = p.id
    left join public.repair_pro_profiles r on r.user_id = p.id
  ),
  p.role
)
where p.primary_role is null;

-- Mark dual users who already have both sides but never switched tracked
-- (count stays 0 until a real switch; dual still visible via side tables)
