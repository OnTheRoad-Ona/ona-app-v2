-- Geospatial indexes for radius-based pro discovery.
-- These improve performance of 0-10 km proximity queries that currently
-- rely on in-memory Haversine calculation over all active pros.
-- Requires PostGIS extension (CREATE EXTENSION IF NOT EXISTS postgis).

-- Enable PostGIS extension (idempotent)
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- Add geography column to repair_pro_profiles for native PostGIS distance queries
ALTER TABLE public.repair_pro_profiles
  ADD COLUMN IF NOT EXISTS location_geo geography(Point, 4326);

-- Populate geography column from existing lat/lng columns
UPDATE public.repair_pro_profiles
  SET location_geo = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    AND location_geo IS NULL;

-- Auto-update geography column when lat/lng changes
CREATE OR REPLACE FUNCTION public.update_repair_pro_location_geo()
RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location_geo = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  ELSE
    NEW.location_geo = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_repair_pro_profiles_location_geo
  ON public.repair_pro_profiles;

CREATE TRIGGER trg_repair_pro_profiles_location_geo
  BEFORE INSERT OR UPDATE OF latitude, longitude
  ON public.repair_pro_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_repair_pro_location_geo();

-- GIST index for fast radius queries: ST_DWithin(location_geo, $point, $radius_meters)
CREATE INDEX IF NOT EXISTS repair_pro_profiles_location_geo_gist
  ON public.repair_pro_profiles
  USING GIST (location_geo);

-- Add geography column to jobs for motorist / pro location queries
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS motorist_location_geo geography(Point, 4326);

UPDATE public.jobs
  SET motorist_location_geo = ST_SetSRID(ST_MakePoint(motorist_lng, motorist_lat), 4326)::geography
  WHERE motorist_lat IS NOT NULL AND motorist_lng IS NOT NULL
    AND motorist_location_geo IS NULL;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS pro_location_geo geography(Point, 4326);

UPDATE public.jobs
  SET pro_location_geo = ST_SetSRID(ST_MakePoint(pro_lng, pro_lat), 4326)::geography
  WHERE pro_lat IS NOT NULL AND pro_lng IS NOT NULL
    AND pro_location_geo IS NULL;

CREATE INDEX IF NOT EXISTS jobs_motorist_location_geo_gist
  ON public.jobs
  USING GIST (motorist_location_geo);

CREATE INDEX IF NOT EXISTS jobs_pro_location_geo_gist
  ON public.jobs
  USING GIST (pro_location_geo);

COMMENT ON COLUMN public.repair_pro_profiles.location_geo IS
  'PostGIS geography for radius queries. Auto-populated from latitude/longitude via trigger.';
COMMENT ON COLUMN public.jobs.motorist_location_geo IS
  'PostGIS geography of motorist location for distance queries.';
COMMENT ON COLUMN public.jobs.pro_location_geo IS
  'PostGIS geography of pro location for ETA and radius queries.';
