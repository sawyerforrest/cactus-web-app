-- =============================================================================
-- Migration v1.10.0-014: Install pg_cron + pg_net (PLD Phase 2c)
-- =============================================================================
-- Purpose: Enable scheduled invocation of the fetch-eia-diesel Edge Function
-- from inside Postgres.
--
-- pg_cron schedules the job (Mondays 11:00 UTC = 7 AM ET).
-- pg_net performs the async HTTP POST that triggers the Edge Function.
--
-- The cron job itself is created in a follow-up migration (v1.10.0-015) once
-- the Edge Function is deployed and the EIA_API_KEY secret is set.
--
-- pg_cron lives in its own `cron` schema by Supabase convention.
-- pg_net lives in `extensions` (Supabase default).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant cron schema usage to postgres (Supabase default role)
GRANT USAGE ON SCHEMA cron TO postgres;
