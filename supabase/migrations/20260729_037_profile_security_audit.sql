-- 1. Profile audit log — every sensitive/critical action leaves a trail
CREATE TABLE IF NOT EXISTS public.profile_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- change_phone, change_email, change_password, change_bank, request_name_change, approve_name_change, reject_name_change
  risk_tier TEXT NOT NULL CHECK (risk_tier IN ('sensitive','critical')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed','reversed')),
  old_value TEXT,
  new_value TEXT,
  masked_old_value TEXT,   -- e.g. +234***1234 for logs
  masked_new_value TEXT,
  verification_method TEXT, -- otp_phone, otp_email, password, admin_review
  ip_address TEXT,
  user_agent TEXT,
  session_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_audit_user ON public.profile_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_audit_action ON public.profile_audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_profile_audit_status ON public.profile_audit_log(status);

-- 2. Name change requests — requires identity verification + admin review
CREATE TABLE IF NOT EXISTS public.name_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_name TEXT NOT NULL,
  requested_name TEXT NOT NULL,
  reason TEXT,
  identity_document_url TEXT,
  identity_document_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','under_review','approved','rejected')),
  admin_id UUID REFERENCES public.profiles(id),
  admin_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_name_change_user ON public.name_change_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_name_change_status ON public.name_change_requests(status);

-- 3. Add name_locked column if not present (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'name_locked'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN name_locked BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- 4. Repair pro guarantors (compulsory, free-text or reference to another user)
CREATE TABLE IF NOT EXISTS public.repair_pro_guarantors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT,
  occupation TEXT,
  relationship TEXT NOT NULL,
  linked_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_repair_pro_guarantors_user ON public.repair_pro_guarantors(user_id);

ALTER TABLE public.repair_pro_guarantors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own guarantor"
  ON public.repair_pro_guarantors FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users manage own guarantor"
  ON public.repair_pro_guarantors FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own guarantor"
  ON public.repair_pro_guarantors FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manage guarantors"
  ON public.repair_pro_guarantors FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS: profile_audit_log — users see own rows, admins see all
ALTER TABLE public.profile_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own audit logs"
  ON public.profile_audit_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all audit logs"
  ON public.profile_audit_log FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Service role insert audit logs"
  ON public.profile_audit_log FOR INSERT
  WITH CHECK (true);

-- RLS: name_change_requests
ALTER TABLE public.name_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own requests"
  ON public.name_change_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users create own requests"
  ON public.name_change_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage all requests"
  ON public.name_change_requests FOR ALL
  USING (public.is_admin());
