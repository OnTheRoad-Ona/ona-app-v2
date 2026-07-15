-- Allow anyone (including anonymous visitors) to read basic profile fields
-- for approved, active Repair Pros so the marketplace can show names/photos.
-- Without this, repair_pro_profiles is visible but profiles join returns empty
-- and the public app only shows generic "Repair Pro" / "RP".

create policy profiles_select_approved_pros on public.profiles
  for select
  using (
    role = 'repair_pro'
    and is_active = true
    and exists (
      select 1
      from public.repair_pro_profiles r
      where r.user_id = profiles.id
        and r.status = 'approved'
    )
  );
