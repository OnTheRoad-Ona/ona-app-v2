-- Hard ledger for pro payout transfers — UNIQUE transfer_ref prevents double pay
-- One successful Flutterwave transfer reference per escrow/job forever.

CREATE TABLE IF NOT EXISTS public.payout_transfer_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  request_id uuid,
  transfer_ref text NOT NULL,
  flw_transfer_id text,
  amount_minor integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'initiated',
  -- initiated | success | failed | duplicate_blocked
  account_bank text,
  account_number_last4 text,
  beneficiary_name text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Absolute guarantee: same Flutterwave reference cannot be recorded twice
CREATE UNIQUE INDEX IF NOT EXISTS payout_transfer_ledger_transfer_ref_uidx
  ON public.payout_transfer_ledger (transfer_ref);

CREATE INDEX IF NOT EXISTS payout_transfer_ledger_payment_id_idx
  ON public.payout_transfer_ledger (payment_id);

CREATE INDEX IF NOT EXISTS payout_transfer_ledger_request_id_idx
  ON public.payout_transfer_ledger (request_id);

CREATE INDEX IF NOT EXISTS payout_transfer_ledger_created_at_idx
  ON public.payout_transfer_ledger (created_at DESC);

COMMENT ON TABLE public.payout_transfer_ledger IS
  'Ona pro payout ledger. UNIQUE(transfer_ref) blocks double Flutterwave credits.';

ALTER TABLE public.payout_transfer_ledger ENABLE ROW LEVEL SECURITY;

-- Service role only (admin API uses service key)
DROP POLICY IF EXISTS payout_transfer_ledger_service_all ON public.payout_transfer_ledger;
-- No public policies — service role bypasses RLS
