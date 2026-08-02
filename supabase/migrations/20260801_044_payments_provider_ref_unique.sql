-- Cycle 3: prevent duplicate escrow rows for the same gateway reference.
-- Partial unique index: only enforce when provider_ref is non-null/non-empty.

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_ref_unique
  ON public.payments (provider_ref)
  WHERE provider_ref IS NOT NULL AND btrim(provider_ref) <> '';

-- Helpful lookup for history / release by party
CREATE INDEX IF NOT EXISTS payments_motorist_id_idx
  ON public.payments (motorist_id);

CREATE INDEX IF NOT EXISTS payments_repair_pro_id_idx
  ON public.payments (repair_pro_id);
