-- Single source of truth for Total = Labour + Call Out Fee
-- 1) Backfill existing jobs where escrow amount exists but agreed_major is still labour-only
-- 2) Add a comment documenting the display helper getDisplayTotalMajor must be used everywhere

-- Backfill: where amount_minor != labour_agreed_kobo and agreed_major is labour-only, set agreed_major to total
-- For the specific bug job 393318d7… and any similar in_progress/completed with callout_eligible
UPDATE service_requests
SET agreed_major = ROUND(amount_minor / 100.0)
WHERE status IN ('in_progress','completed','paid_booked','en_route','arrived','released','satisfied')
  AND amount_minor IS NOT NULL
  AND amount_minor > 0
  AND agreed_major IS NOT NULL
  AND ABS(agreed_major - (amount_minor / 100.0)) > 0.01
  AND callout_eligible = true;

-- Document the helper (no hard DB constraint to allow pending callouts, app enforces via getDisplayTotalMajor)
COMMENT ON COLUMN service_requests.agreed_major IS 'Labour base (major). Display Total must use getDisplayTotalMajor() = coalesce(amount_minor/100, labour + calloutFee) — never format agreed_major alone';
COMMENT ON COLUMN service_requests.amount_minor IS 'Escrow total in minor (kobo) = labour + callout when held. getDisplayTotalMajor prefers this over computed total';
