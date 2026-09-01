-- Honest Total = Labour + Call-Out everywhere
-- Fixes regression where price-agreed hero and strategic zones showed labour-only.
-- This migration is DISPLAY-ONLY: it does NOT overwrite agreed_major (labour stays labour).
-- Server hydration (src/lib/server/jobs/job-store.ts:hydrateJobCallout) now estimates
-- call-out even while PENDING, so first paint already shows Total = labour + call-out.
-- Client must use getDisplayTotalMajor()/jobChargeParts(), never formatMoney(agreed_major) alone.

-- Keep agreed_major as labour (do NOT backfill to amount_minor/100).
-- The previous 021 backfill for in_progress/completed has been superseded:
-- we only keep comments that document the helper contract.

COMMENT ON COLUMN service_requests.agreed_major IS 'Labour base in major units (₦). Display Total MUST use getDisplayTotalMajor() = labour + callout (via resolveJobCalloutQuote/estimate) or coalesce(amount_minor/100) when escrow held — never format agreed_major alone. See src/lib/callout/payable.ts:jobChargeParts';
COMMENT ON COLUMN service_requests.amount_minor IS 'Escrow total in minor (kobo) = labour + callout when held (startJobEscrowPayment). Before payment it may be labour-only; UI must derive Total from labour+callout, not from amount_minor alone until held.';

-- Ensure call-out rows for agreed jobs that are still PENDING get an estimated CALCULATED fee
-- (server does this lazily via estimateCalloutQuote, but backfill helps old rows).
-- Only for jobs where agreed_major exists and callout_eligible = true and fee is null.
UPDATE public.service_request_callouts c
SET
  callout_status = 'CALCULATED',
  callout_fee = COALESCE(c.callout_fee, t.base_fee + 0.5 * 350),
  trade_base_fee = COALESCE(c.trade_base_fee, t.base_fee),
  distance_rate = COALESCE(c.distance_rate, 350),
  billable_distance_km = COALESCE(c.billable_distance_km, 0.5),
  distance_charge = COALESCE(c.distance_charge, 0.5 * 350),
  calculated_at = COALESCE(c.calculated_at, now()::text),
  updated_at = now()::text
FROM (
  SELECT
    sr.id,
    COALESCE(t.base_fee, 3000) AS base_fee
  FROM public.service_requests sr
  LEFT JOIN public.trade_call_out_pricing t ON t.trade_id = sr.service_type
  WHERE sr.agreed_major IS NOT NULL
    AND sr.status IN ('requested','accepted')
    AND sr.flow_status = 'agreed'
) t
WHERE c.request_id = t.id
  AND c.callout_eligible = true
  AND c.callout_status = 'PENDING'
  AND c.callout_fee IS NULL;

-- Document helper contract for future devs
COMMENT ON TABLE public.service_request_callouts IS 'Per-request call-out quote. UI Total = service_requests.agreed_major + callout_fee (via getDisplayTotalMajor). Server estimate fills PENDING rows so Total never flashes labour-only.';
