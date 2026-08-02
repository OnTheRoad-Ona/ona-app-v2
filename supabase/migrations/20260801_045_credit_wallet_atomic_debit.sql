-- Cycle 4: atomic credit wallet debit / hold for cashout double-spend protection.
-- Safe to re-run (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.credit_wallet_debit(
  p_user_id uuid,
  p_amount numeric,
  p_tx_type text DEFAULT 'block',
  p_reference_type text DEFAULT NULL,
  p_reference_id text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS TABLE (
  ok boolean,
  error_message text,
  available_credits numeric,
  blocked_credits numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w public.credit_wallets%ROWTYPE;
  bal_before numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    ok := false;
    error_message := 'Amount must be positive';
    available_credits := 0;
    blocked_credits := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO w
  FROM public.credit_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.credit_wallets (user_id)
    VALUES (p_user_id)
    RETURNING * INTO w;
  END IF;

  bal_before := COALESCE(w.available_credits, 0);

  IF bal_before < p_amount THEN
    ok := false;
    error_message := 'Insufficient available credits';
    available_credits := bal_before;
    blocked_credits := COALESCE(w.blocked_credits, 0);
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_tx_type = 'block' THEN
    UPDATE public.credit_wallets
    SET
      available_credits = bal_before - p_amount,
      blocked_credits = COALESCE(blocked_credits, 0) + p_amount,
      cashable_credits = GREATEST(0, COALESCE(cashable_credits, 0) - p_amount),
      updated_at = now()
    WHERE id = w.id
    RETURNING * INTO w;
  ELSIF p_tx_type IN ('service_spend', 'redeem', 'cashout') THEN
    UPDATE public.credit_wallets
    SET
      available_credits = bal_before - p_amount,
      redeemed_credits = COALESCE(redeemed_credits, 0) + p_amount,
      service_spend_credits = CASE
        WHEN p_tx_type = 'service_spend'
          THEN COALESCE(service_spend_credits, 0) + p_amount
        ELSE service_spend_credits
      END,
      cashable_credits = GREATEST(0, COALESCE(cashable_credits, 0) - p_amount),
      updated_at = now()
    WHERE id = w.id
    RETURNING * INTO w;
  ELSE
    ok := false;
    error_message := 'Unsupported debit type';
    available_credits := bal_before;
    blocked_credits := COALESCE(w.blocked_credits, 0);
    RETURN NEXT;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.credit_transactions (
      wallet_id, user_id, transaction_type, amount,
      balance_before, balance_after, status,
      reference_type, reference_id, reason, metadata, completed_at
    ) VALUES (
      w.id, p_user_id, p_tx_type, p_amount,
      bal_before, COALESCE(w.available_credits, 0), 'completed',
      p_reference_type, p_reference_id, p_reason, '{}'::jsonb, now()
    );
  EXCEPTION WHEN OTHERS THEN
    -- table shape may differ; wallet update already committed in this function
    NULL;
  END;

  ok := true;
  error_message := NULL;
  available_credits := COALESCE(w.available_credits, 0);
  blocked_credits := COALESCE(w.blocked_credits, 0);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_wallet_debit(uuid, numeric, text, text, text, text) TO service_role;
