-- Wallet cashout engine: auto Flutterwave transfers for credit cashouts.
-- Additive only: new columns, new RPC, new settings seeds. Nothing removed.

-- ── cashout_requests: transfer + retry metadata ────────────────────────────
alter table public.cashout_requests
  add column if not exists transfer_ref text;
alter table public.cashout_requests
  add column if not exists transfer_status text;
alter table public.cashout_requests
  add column if not exists flw_transfer_id text;
alter table public.cashout_requests
  add column if not exists retry_count integer not null default 0;
alter table public.cashout_requests
  add column if not exists next_retry_at timestamptz;
alter table public.cashout_requests
  add column if not exists last_error text;
alter table public.cashout_requests
  add column if not exists idempotency_key text;
alter table public.cashout_requests
  add column if not exists bank_code text;
alter table public.cashout_requests
  add column if not exists bank_name text;
alter table public.cashout_requests
  add column if not exists account_number text;
alter table public.cashout_requests
  add column if not exists account_name text;

create unique index if not exists cashout_requests_transfer_ref_key
  on public.cashout_requests (transfer_ref) where transfer_ref is not null;
create unique index if not exists cashout_requests_idempotency_key_key
  on public.cashout_requests (idempotency_key) where idempotency_key is not null;
create index if not exists cashout_requests_retry_due_idx
  on public.cashout_requests (next_retry_at)
  where status = 'processing';

-- ── payout_transfer_ledger: link cashouts to the hard ledger ───────────────
alter table public.payout_transfer_ledger
  add column if not exists cashout_request_id uuid;

-- ── RPC: settle or reverse a cashout hold atomically ───────────────────────
-- mode 'settle':  blocked -= amount, redeemed += amount (money leaves wallet)
-- mode 'reverse': blocked -= amount, available += amount, cashable += amount
create or replace function public.credit_wallet_release(
  p_user_id uuid,
  p_amount numeric,
  p_mode text,            -- 'settle' | 'reverse'
  p_reference_id text default null,
  p_reason text default null
)
returns table (
  ok boolean,
  error_message text,
  blocked_credits numeric,
  available_credits numeric,
  redeemed_credits numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.credit_wallets;
  v_balance_before numeric;
begin
  select * into v_wallet
    from public.credit_wallets
    where user_id = p_user_id
    for update;

  if not found then
    return query select false, 'wallet_not_found', 0::numeric, 0::numeric, 0::numeric;
    return;
  end if;

  if v_wallet.blocked_credits < p_amount then
    return query select false, 'insufficient_blocked',
      v_wallet.blocked_credits, v_wallet.available_credits, v_wallet.redeemed_credits;
    return;
  end if;

  v_balance_before := v_wallet.available_credits;

  update public.credit_wallets set
    blocked_credits = blocked_credits - p_amount,
    available_credits = case
      when p_mode = 'reverse' then available_credits + p_amount
      else available_credits
    end,
    cashable_credits = case
      when p_mode = 'reverse' then greatest(0, cashable_credits + p_amount)
      else cashable_credits
    end,
    redeemed_credits = case
      when p_mode = 'settle' then redeemed_credits + p_amount
      else redeemed_credits
    end,
    updated_at = now()
  where id = v_wallet.id
  returning * into v_wallet;

  -- Ledger row: never swallow failures here (audit must match balances)
  insert into public.credit_transactions (
    wallet_id, user_id, transaction_type, amount,
    balance_before, balance_after, status,
    reference_type, reference_id, reason, metadata, completed_at
  ) values (
    v_wallet.id, p_user_id,
    case when p_mode = 'settle' then 'cashout' else 'reverse' end,
    p_amount, v_balance_before, v_wallet.available_credits, 'completed',
    'cashout_' || p_mode, p_reference_id,
    coalesce(p_reason, 'Cashout ' || p_mode),
    jsonb_build_object('mode', p_mode), now()
  );

  return query select true, null::text,
    v_wallet.blocked_credits, v_wallet.available_credits, v_wallet.redeemed_credits;
end;
$$;

grant execute on function public.credit_wallet_release(uuid, numeric, text, text, text)
  to service_role;

-- ── Settings seeds (admin-tunable, no code needed to change) ───────────────
insert into public.system_settings (key, value, updated_at)
values
  ('credit_cashout_daily_limit', '50000', now()),
  ('credit_cashout_monthly_limit', '200000', now()),
  ('credit_cashout_max_per_day', '2', now()),
  ('credit_cashout_auto_approve_under', '0', now()),
  ('credit_cashout_min_account_age_days', '0', now())
on conflict (key) do nothing;
