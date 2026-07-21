-- Reset all Customer + Repair Pro approval state to neutral so care starts over.
-- Keeps account identity (name/email/phone) and uploaded media/numbers for re-review.
-- Clears all approved / verified / visibility outcomes.

-- ═══════════════════════════════════════════════════════════════════════════
-- CUSTOMERS (motorist_profiles)
-- ═══════════════════════════════════════════════════════════════════════════
update public.motorist_profiles
set
  nin_verified = false,
  bvn_verified = false,
  identity_verified_at = null,
  identity_reviewed_at = null,
  identity_reviewed_by = null,
  identity_rejection_reason = null,
  phone_verified = false,
  phone_verified_at = null,
  review_checklist = '{}'::jsonb,
  -- If they already uploaded ID bits → back in queue as submitted; else none
  identity_review_status = case
    when (
      (nin_last4 is not null and length(trim(nin_last4)) > 0)
      or (bvn_last4 is not null and length(trim(bvn_last4)) > 0)
      or (gov_id_front_url is not null and length(trim(gov_id_front_url)) > 0)
      or (gov_id_number is not null and length(trim(gov_id_number)) > 0)
      or (nin_encrypted is not null and length(trim(nin_encrypted)) > 0)
    ) then 'submitted'
    else 'none'
  end,
  identity_submitted_at = case
    when (
      (nin_last4 is not null and length(trim(nin_last4)) > 0)
      or (gov_id_front_url is not null and length(trim(gov_id_front_url)) > 0)
      or (gov_id_number is not null and length(trim(gov_id_number)) > 0)
      or (nin_encrypted is not null and length(trim(nin_encrypted)) > 0)
    ) then coalesce(identity_submitted_at, now())
    else null
  end,
  updated_at = now();

-- ═══════════════════════════════════════════════════════════════════════════
-- REPAIR PROS (repair_pro_profiles)
-- ═══════════════════════════════════════════════════════════════════════════
update public.repair_pro_profiles
set
  status = 'pending',
  verified = false,
  nin_verified = false,
  bvn_verified = false,
  is_online = false,
  visibility_tier = 1,
  is_new_artisan = true,
  pipeline_status = case
    when (
      (nin_last4 is not null and length(trim(nin_last4)) > 0)
      or (gov_id_front_url is not null and length(coalesce(gov_id_front_url, '')) > 0)
      or (gov_id_number is not null and length(trim(gov_id_number)) > 0)
      or (certification_file_url is not null and length(coalesce(certification_file_url, '')) > 0)
      or docs_status in ('under_review', 'approved', 'rejected')
    ) then 'pending_verification'
    else 'submitted'
  end,
  pipeline_notes = null,
  submitted_at = coalesce(submitted_at, now()),
  approved_at = null,
  rejected_at = null,
  rejection_reason = null,
  gov_id_review_status = case
    when (
      (nin_last4 is not null and length(trim(nin_last4)) > 0)
      or (gov_id_front_url is not null and length(coalesce(gov_id_front_url, '')) > 0)
      or (gov_id_number is not null and length(trim(gov_id_number)) > 0)
    ) then 'submitted'
    else 'none'
  end,
  gov_id_submitted_at = case
    when (
      (nin_last4 is not null and length(trim(nin_last4)) > 0)
      or (gov_id_front_url is not null and length(coalesce(gov_id_front_url, '')) > 0)
      or (gov_id_number is not null and length(trim(gov_id_number)) > 0)
    ) then coalesce(gov_id_submitted_at, now())
    else null
  end,
  gov_id_reviewed_at = null,
  face_liveness_verified = false,
  face_liveness_at = null,
  liveness_passed_at = null,
  docs_status = case
    when certification_file_url is not null and length(coalesce(certification_file_url, '')) > 0
      then 'under_review'
    when docs_status in ('approved', 'rejected', 'under_review')
      then 'under_review'
    else 'none'
  end,
  docs_submitted_at = case
    when certification_file_url is not null or docs_status in ('approved', 'rejected', 'under_review')
      then coalesce(docs_submitted_at, now())
    else null
  end,
  docs_reviewed_at = null,
  docs_reviewed_by = null,
  docs_rating_boost_applied = false,
  tier2_approved_at = null,
  tier3_approved_at = null,
  tier4_approved_at = null,
  tier4_one_star_seeded = false,
  go_live_window_ends_at = null,
  in_person_verified = false,
  in_person_verified_at = null,
  phone_verified = false,
  phone_verified_at = null,
  review_checklist = '{}'::jsonb,
  updated_at = now();

-- Note: leave gov_id numbers/photos, certification files, names, phones intact
-- so care can re-approve without re-upload unless desired.
