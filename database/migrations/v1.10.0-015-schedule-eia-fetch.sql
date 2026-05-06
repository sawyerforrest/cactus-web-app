-- =============================================================================
-- Migration v1.10.0-015: Schedule fetch-eia-diesel weekly (PLD Phase 2c)
-- =============================================================================
-- Purpose: Run the fetch-eia-diesel Edge Function every Monday at 11:00 UTC
-- (= 7:00 AM ET in standard time, 7:00 AM EDT in daylight time). EIA publishes
-- weekly diesel price observations on Mondays, so the Monday schedule pulls
-- the freshest data each week.
--
-- The cron job uses pg_net to make an async HTTP POST to the Edge Function
-- URL. The function's verify_jwt is true, so we pass the project's anon JWT
-- in the Authorization header.
--
-- Anon JWT is intentionally embedded inline. It is the same key that ships
-- in the Cactus Portal frontend bundle and is meant to be public-readable;
-- it grants only RLS-bound access. The function itself uses the
-- SUPABASE_SERVICE_ROLE_KEY internally to perform the upsert.
--
-- Schedule: '0 11 * * 1'  → minute=0 hour=11 dom=* mon=* dow=1 (Monday).
--
-- Idempotency: the cron job re-pulls the last 60 days of EIA observations
-- on every run; existing rows are no-ops via UNIQUE(effective_week_start)
-- with ignoreDuplicates=true. Safe to run extra times.
--
-- DO NOT APPLY THIS MIGRATION UNTIL:
--   1. EIA_API_KEY is set as a Supabase secret on project wfzscshukatnxlnebstj
--   2. Manual invocation of fetch-eia-diesel returns 200 with at least one
--      week of data successfully upserted into diesel_price_history.
-- =============================================================================

SELECT cron.schedule(
  'pld-fetch-eia-diesel-weekly',
  '0 11 * * 1',
  $cron$
  SELECT net.http_post(
    url := 'https://wfzscshukatnxlnebstj.supabase.co/functions/v1/fetch-eia-diesel',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmenNjc2h1a2F0bnhsbmVic3RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNjQwMzYsImV4cCI6MjA4OTc0MDAzNn0.Ve6ElJWUSV4pNYoXsIKgk7qbnYqQp1tY1lJuSb96T9A'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);

-- Verification (run after applying):
--   SELECT jobid, schedule, jobname, active FROM cron.job WHERE jobname = 'pld-fetch-eia-diesel-weekly';
--   SELECT * FROM cron.job_run_details WHERE jobname = 'pld-fetch-eia-diesel-weekly' ORDER BY start_time DESC LIMIT 5;
