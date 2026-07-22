-- Gender + date of birth on profiles (required at signup going forward)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS date_of_birth date;

COMMENT ON COLUMN public.profiles.gender IS 'male | female | prefer_not_to_say';
COMMENT ON COLUMN public.profiles.date_of_birth IS 'User date of birth (YYYY-MM-DD)';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_gender_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_gender_check
      CHECK (
        gender IS NULL
        OR gender IN ('male', 'female', 'prefer_not_to_say')
      );
  END IF;
END $$;
