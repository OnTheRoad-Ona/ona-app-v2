-- Permanent protection: Care-approved T2 cannot be demoted by client re-submit
-- or bulk data transfer, unless Care explicitly rejects or opens needs_resubmit.
-- Note: status/docs columns may be enums — always compare via ::text.

-- ── Pro: repair_pro_profiles ───────────────────────────────────────────────
create or replace function public.ona_protect_pro_verification()
returns trigger
language plpgsql
as $$
declare
  care_resubmit boolean;
  old_gov text;
  new_gov text;
  old_status text;
  new_status text;
  old_docs text;
  new_docs text;
  old_pipe text;
  new_pipe text;
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  old_gov := lower(coalesce(old.gov_id_review_status::text, ''));
  new_gov := lower(coalesce(new.gov_id_review_status::text, ''));
  old_status := lower(coalesce(old.status::text, ''));
  new_status := lower(coalesce(new.status::text, ''));
  old_docs := lower(coalesce(old.docs_status::text, ''));
  new_docs := lower(coalesce(new.docs_status::text, ''));
  old_pipe := lower(coalesce(old.pipeline_status::text, ''));
  new_pipe := lower(coalesce(new.pipeline_status::text, ''));

  care_resubmit :=
    new_pipe = 'needs_resubmit'
    or coalesce(new.rejection_reason, '') ~* 're-?\s*submit'
    or coalesce(new.pipeline_notes, '') ~* 're-?\s*submit';

  -- T2 review status: approved is sticky
  if old_gov = 'approved' then
    if new_gov = 'rejected' then
      null;
    elsif care_resubmit and new_gov in ('none', 'submitted') then
      null;
    elsif new_gov is distinct from 'approved' then
      new.gov_id_review_status := old.gov_id_review_status;
      new.gov_id_reviewed_at := coalesce(new.gov_id_reviewed_at, old.gov_id_reviewed_at);
      new.verified := true;
      if old.nin_verified is true then new.nin_verified := true; end if;
      if old.bvn_verified is true then new.bvn_verified := true; end if;
      if old.tier2_approved_at is not null then
        new.tier2_approved_at := coalesce(new.tier2_approved_at, old.tier2_approved_at);
      end if;
      if old.approved_at is not null then
        new.approved_at := coalesce(new.approved_at, old.approved_at);
      end if;
    end if;

    if not care_resubmit and (new_gov = 'approved' or new_gov = '') then
      if old.verified is true and new.verified is distinct from true then
        new.verified := true;
      end if;
      if old.nin_verified is true and new.nin_verified is distinct from true then
        new.nin_verified := true;
      end if;
      if old.bvn_verified is true and new.bvn_verified is distinct from true then
        new.bvn_verified := true;
      end if;
      if old.tier2_approved_at is not null and new.tier2_approved_at is null then
        new.tier2_approved_at := old.tier2_approved_at;
      end if;
      if new_gov = '' then
        new.gov_id_review_status := old.gov_id_review_status;
      end if;
    end if;
  end if;

  -- Account status approved sticky
  if old_status = 'approved' then
    if new_status in ('suspended', 'rejected', 'blocked', 'archived') then
      null;
    elsif care_resubmit and new_status = 'pending' then
      null;
    elsif new_status is distinct from 'approved' then
      new.status := old.status;
      if old.approved_at is not null then
        new.approved_at := coalesce(new.approved_at, old.approved_at);
      end if;
    end if;
  end if;

  -- docs_status approved sticky unless care reject/resubmit
  if old_docs = 'approved' then
    if new_docs = 'rejected' then
      null;
    elsif care_resubmit then
      null;
    elsif new_docs is distinct from 'approved' and new_docs <> '' then
      new.docs_status := old.docs_status;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ona_protect_pro_verification on public.repair_pro_profiles;
create trigger trg_ona_protect_pro_verification
  before update on public.repair_pro_profiles
  for each row
  execute function public.ona_protect_pro_verification();

-- ── Customer: motorist_profiles ────────────────────────────────────────────
create or replace function public.ona_protect_motorist_verification()
returns trigger
language plpgsql
as $$
declare
  care_resubmit boolean;
  old_rev text;
  new_rev text;
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  old_rev := lower(coalesce(old.identity_review_status::text, ''));
  new_rev := lower(coalesce(new.identity_review_status::text, ''));

  care_resubmit :=
    coalesce(new.identity_rejection_reason, '') ~* 're-?\s*submit'
    or coalesce(old.identity_rejection_reason, '') ~* 're-?\s*submit';

  if old_rev = 'approved' then
    if new_rev = 'rejected' then
      null;
    elsif care_resubmit and new_rev in ('none', 'submitted') then
      null;
    elsif new_rev is distinct from 'approved' then
      new.identity_review_status := old.identity_review_status;
      new.identity_verified_at := coalesce(new.identity_verified_at, old.identity_verified_at, now());
      new.identity_reviewed_at := coalesce(new.identity_reviewed_at, old.identity_reviewed_at);
      new.nin_verified := true;
      if old.bvn_verified is true then new.bvn_verified := true; end if;
    end if;

    if not care_resubmit and (new_rev = 'approved' or new_rev = '') then
      if old.nin_verified is true and new.nin_verified is distinct from true then
        new.nin_verified := true;
      end if;
      if old.bvn_verified is true and new.bvn_verified is distinct from true then
        new.bvn_verified := true;
      end if;
      if old.identity_verified_at is not null and new.identity_verified_at is null then
        new.identity_verified_at := old.identity_verified_at;
      end if;
      if new_rev = '' then
        new.identity_review_status := old.identity_review_status;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ona_protect_motorist_verification on public.motorist_profiles;
create trigger trg_ona_protect_motorist_verification
  before update on public.motorist_profiles
  for each row
  execute function public.ona_protect_motorist_verification();

comment on function public.ona_protect_pro_verification() is
  'Sticky Care T2/account approval: blocks client re-submit and transfer wipes; allows reject and needs_resubmit.';
comment on function public.ona_protect_motorist_verification() is
  'Sticky customer T2 approval: blocks client re-submit and transfer wipes; allows Care reject/resubmit.';
