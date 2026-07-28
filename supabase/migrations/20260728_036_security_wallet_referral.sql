-- 036: Security, Profile, Referral, and Credit Control System
-- Phone/email change requests, referral codes, credit wallets, cashouts, fraud flags, audit logs

-- Add columns to existing profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_profile_locked BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_phone_verified BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{}';

-- 1. User sessions tracking
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_id TEXT,
  device_name TEXT,
  os TEXT,
  browser TEXT,
  ip_address TEXT,
  location TEXT,
  session_status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);

-- 2. Contact change requests
CREATE TABLE IF NOT EXISTS public.contact_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('phone','email','both')),
  old_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  old_verified BOOLEAN DEFAULT false,
  new_verified BOOLEAN DEFAULT false,
  password_confirmed BOOLEAN DEFAULT false,
  old_code TEXT,
  new_code TEXT,
  code_attempts INTEGER DEFAULT 0,
  risk_score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','awaiting_old_verification','awaiting_new_verification','under_review','approved','rejected','reversed')),
  admin_id UUID REFERENCES public.profiles(id),
  reason TEXT,
  device_info JSONB,
  session_info JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_contact_change_user_id ON public.contact_change_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_change_status ON public.contact_change_requests(status);

-- 3. Referral codes
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referral_code TEXT UNIQUE NOT NULL,
  referral_link TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id ON public.referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON public.referral_codes(referral_code);

-- 4. Referral events
CREATE TABLE IF NOT EXISTS public.referral_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referral_code_used TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','reversed')),
  reward_amount NUMERIC(12,2) DEFAULT 0,
  reward_type TEXT DEFAULT 'credit',
  eligibility_status TEXT,
  admin_id UUID REFERENCES public.profiles(id),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_referral_events_referrer ON public.referral_events(referrer_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_events_unique ON public.referral_events(referrer_user_id, referred_user_id);

-- 5. Credit wallets
CREATE TABLE IF NOT EXISTS public.credit_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  total_earned NUMERIC(12,2) DEFAULT 0,
  pending_credits NUMERIC(12,2) DEFAULT 0,
  available_credits NUMERIC(12,2) DEFAULT 0,
  redeemed_credits NUMERIC(12,2) DEFAULT 0,
  cashable_credits NUMERIC(12,2) DEFAULT 0,
  service_spend_credits NUMERIC(12,2) DEFAULT 0,
  reversed_credits NUMERIC(12,2) DEFAULT 0,
  blocked_credits NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_wallets_user_id ON public.credit_wallets(user_id);

-- 6. Credit transactions
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES public.credit_wallets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('earn','redeem','cashout','reverse','block','adjust','service_spend')),
  amount NUMERIC(12,2) NOT NULL,
  balance_before NUMERIC(12,2) DEFAULT 0,
  balance_after NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','completed','failed','reversed','blocked')),
  reference_type TEXT,
  reference_id TEXT,
  admin_id UUID REFERENCES public.profiles(id),
  reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_tx_wallet ON public.credit_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_credit_tx_type ON public.credit_transactions(transaction_type);

-- 7. Cashout requests
CREATE TABLE IF NOT EXISTS public.cashout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES public.credit_wallets(id) ON DELETE CASCADE,
  requested_amount NUMERIC(12,2) NOT NULL,
  fee_amount NUMERIC(12,2) DEFAULT 0,
  net_amount NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','processing','paid','failed','reversed')),
  payout_method TEXT DEFAULT 'bank_transfer',
  destination_account TEXT,
  admin_id UUID REFERENCES public.profiles(id),
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cashout_user ON public.cashout_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_cashout_status ON public.cashout_requests(status);

-- 8. Service credit payments
CREATE TABLE IF NOT EXISTS public.service_credit_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES public.credit_wallets(id) ON DELETE CASCADE,
  amount_used NUMERIC(12,2) NOT NULL,
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending','completed','failed','reversed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scp_service_request ON public.service_credit_payments(service_request_id);
CREATE INDEX IF NOT EXISTS idx_scp_user ON public.service_credit_payments(user_id);

-- 9. Fraud flags
CREATE TABLE IF NOT EXISTS public.fraud_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL CHECK (flag_type IN ('contact_change','referral_abuse','credit_abuse','cashout_risk','device_risk','profile_abuse')),
  risk_level TEXT DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high','critical')),
  description TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','blocked')),
  admin_id UUID REFERENCES public.profiles(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fraud_flags_user ON public.fraud_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_status ON public.fraud_flags(status);

-- 10. Admin actions (audit trail)
CREATE TABLE IF NOT EXISTS public.admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_name TEXT,
  target_type TEXT NOT NULL,
  target_id TEXT,
  action_type TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  result TEXT,
  status TEXT DEFAULT 'completed',
  error_message TEXT,
  ip_address TEXT,
  device_info TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON public.admin_actions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target ON public.admin_actions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON public.admin_actions(created_at DESC);

-- 11. System settings
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id)
);

-- Default settings
INSERT INTO public.system_settings (key, value) VALUES
  ('referral_reward_amount', '"500"'),
  ('credit_cashout_minimum', '"2000"'),
  ('credit_cashout_fee_percent', '"5"'),
  ('contact_change_hold_minutes', '"0"'),
  ('high_risk_review_enabled', '"true"'),
  ('admin_approval_required_for_cashout', '"true"'),
  ('suspicious_activity_threshold', '"3"'),
  ('default_contact_change_code', '"336699"')
ON CONFLICT (key) DO NOTHING;
