-- Expand pro_service enum for new artisan trades
-- (plumber, carpenter, painter, solar, generator)

DO $$ BEGIN
  ALTER TYPE public.pro_service ADD VALUE 'plumber';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.pro_service ADD VALUE 'carpenter';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.pro_service ADD VALUE 'painter';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.pro_service ADD VALUE 'solar';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.pro_service ADD VALUE 'generator';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
