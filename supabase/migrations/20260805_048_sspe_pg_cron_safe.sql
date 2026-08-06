-- SSPE: retire the legacy pg_cron SQL pairing sweep.
--
-- The Node engine (pairing-engine.ts) owns the timeout transition: it
-- re-checks the freshest pairing_deadline (so a pro who just opened is never
-- clobbered), only releases reservations whose window actually lapsed, respects
-- the 5-round cap, and advances sequential_pairing rows. The SQL version set
-- pairing_deadline = NULL on sequential_pairing, which the Node sweep skips
-- (it only selects rows with a deadline) — stranding requests in "searching"
-- forever, and it had no expires_at guard on reservations.
--
-- The schedule/function are created only when pg_cron is enabled, so guard
-- both drops. Safe to run on projects where the 047 migration already ran.

do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'ona-pairing-sweep') then
      perform cron.unschedule('ona-pairing-sweep');
    end if;
  end if;
end $do$;

drop function if exists public.pairing_sweep();
