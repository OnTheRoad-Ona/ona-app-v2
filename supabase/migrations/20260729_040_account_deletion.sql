-- Account deletion flow: soft-delete → 30-day grace → hard-delete

-- 1. Add deletion_status column (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'deletion_status'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN deletion_status text NOT NULL DEFAULT 'active'
      CHECK (deletion_status IN ('active', 'pending_deletion', 'restored'));
  END IF;
END $$;

-- 2. Add self_reactivated_at so we know when a user restored themselves
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'self_reactivated_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN self_reactivated_at timestamptz;
  END IF;
END $$;

-- 3. Index for pending deletions
CREATE INDEX IF NOT EXISTS idx_profiles_deletion_status
  ON public.profiles (deletion_status)
  WHERE deletion_status != 'active';

-- 4. Helper RPC: purge expired pending deletions (called by cron)
-- Returns count of purged users
CREATE OR REPLACE FUNCTION public.purge_expired_deletions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  purged_count integer;
BEGIN
  WITH expired AS (
    SELECT id FROM public.profiles
    WHERE deletion_status = 'pending_deletion'
      AND deletion_scheduled_at IS NOT NULL
      AND deletion_scheduled_at < now()
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM auth.users a
  USING expired e
  WHERE a.id = e.id;

  GET DIAGNOSTICS purged_count = ROW_COUNT;
  RETURN purged_count;
END;
$$;

-- 5. RLS: users can only update their own deletion_status to restore
DROP POLICY IF EXISTS "Users restore own account" ON public.profiles;
CREATE POLICY "Users restore own account"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (
      -- Only allow setting deletion_status back to 'restored' or 'active'
      (OLD.deletion_status = 'pending_deletion' AND NEW.deletion_status IN ('restored', 'active'))
      OR OLD.deletion_status = NEW.deletion_status
    )
  );

-- 6. RLS: service role can manage all deletion fields
DROP POLICY IF EXISTS "Service role manage deletion" ON public.profiles;
CREATE POLICY "Service role manage deletion"
  ON public.profiles FOR ALL
  USING (true)
  WITH CHECK (true);
