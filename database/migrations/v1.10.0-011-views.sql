-- v1.10.0-011-views.sql
-- PLD Analysis Engine v1 — soft-delete filter views
-- Application code reads from active_* views; admin/audit code may read base tables.
-- security_invoker=true makes the view enforce the querying user's RLS policies
-- on the underlying tables (Postgres 15+ feature). Without this, a view defaults
-- to the view-creator's privileges, which would silently bypass RLS.

CREATE VIEW active_leads
  WITH (security_invoker = true)
  AS
  SELECT * FROM leads WHERE deleted_at IS NULL;

COMMENT ON VIEW active_leads IS 'Soft-delete filtered view over leads. Use from application code.';

CREATE VIEW active_pld_analysis_runs
  WITH (security_invoker = true)
  AS
  SELECT * FROM pld_analysis_runs WHERE deleted_at IS NULL;

COMMENT ON VIEW active_pld_analysis_runs IS 'Soft-delete filtered view over pld_analysis_runs.';

CREATE VIEW active_analysis_rate_cards
  WITH (security_invoker = true)
  AS
  SELECT * FROM analysis_rate_cards WHERE deleted_at IS NULL;

COMMENT ON VIEW active_analysis_rate_cards IS 'Soft-delete filtered view over analysis_rate_cards.';

CREATE VIEW active_markup_strategies
  WITH (security_invoker = true)
  AS
  SELECT * FROM markup_strategies WHERE deleted_at IS NULL;

COMMENT ON VIEW active_markup_strategies IS 'Soft-delete filtered view over markup_strategies.';
