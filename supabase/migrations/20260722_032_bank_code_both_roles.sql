-- Bank details for escrow: refunds (motorist) + payouts (pro)
-- bank_code = Flutterwave account_bank

alter table public.repair_pro_profiles
  add column if not exists bank_code text;

alter table public.motorist_profiles
  add column if not exists bank_name text,
  add column if not exists bank_account_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_code text;

comment on column public.repair_pro_profiles.bank_code is
  'Flutterwave bank code for pro payouts';
comment on column public.motorist_profiles.bank_code is
  'Flutterwave bank code for customer refunds';
