-- Cancel all open/active solar trade jobs across database
UPDATE jobs
SET 
  status = 'cancelled',
  escrow_status = CASE WHEN escrow_status = 'held' THEN 'refunded' ELSE escrow_status END,
  cancelled_at = NOW(),
  updated_at = NOW()
WHERE 
  service_type = 'solar'
  AND status NOT IN ('released', 'refunded', 'cancelled', 'expired');
