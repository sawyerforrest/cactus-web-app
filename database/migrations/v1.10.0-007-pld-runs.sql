-- v1.10.0-007-pld-runs.sql
-- PLD Analysis Engine v1 — pld_analysis_runs + run-scoped snapshots
-- Tables: pld_analysis_runs, pld_analysis_run_strategies,
--         pld_analysis_run_service_mappings, global_service_level_mapping_defaults

CREATE TABLE pld_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id),
  run_name TEXT NOT NULL,
  run_version INTEGER NOT NULL DEFAULT 1,
  parent_run_id UUID REFERENCES pld_analysis_runs(id),
  source_file_name TEXT,
  source_file_path TEXT,
  source_row_count INTEGER,
  status analysis_run_status_enum NOT NULL DEFAULT 'DRAFT',
  progress_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  period_start_date DATE,
  period_end_date DATE,
  selected_carriers carrier_code_enum[] NOT NULL,
  fuel_treatment_mode TEXT NOT NULL DEFAULT 'full' CHECK (fuel_treatment_mode IN ('full', 'base_only')),
  aggregations_internal JSONB,
  aggregations_client JSONB,
  methodology_footnote_text TEXT,
  has_coverage_gaps BOOLEAN NOT NULL DEFAULT FALSE,
  has_tied_shipments BOOLEAN NOT NULL DEFAULT FALSE,
  has_stale_data BOOLEAN NOT NULL DEFAULT FALSE,
  has_peak_season BOOLEAN NOT NULL DEFAULT FALSE,
  annualization_factor NUMERIC(8, 4),
  annualization_period TEXT,
  failure_reason TEXT,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  rated_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_pld_analysis_runs_lead_id
  ON pld_analysis_runs(lead_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_pld_analysis_runs_status
  ON pld_analysis_runs(status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_pld_analysis_runs_parent
  ON pld_analysis_runs(parent_run_id)
  WHERE parent_run_id IS NOT NULL;

CREATE INDEX idx_pld_analysis_runs_created_by
  ON pld_analysis_runs(created_by_user_id);

COMMENT ON TABLE pld_analysis_runs IS 'PLD analysis run header. Versioned via parent_run_id (re-rates create new run). Soft-delete via deleted_at.';

-- ----------------------------------------------------------------------------
-- pld_analysis_run_strategies — snapshot of which markup strategy was used per
-- carrier on a given run. Captured at run-start so post-edit strategy changes
-- don't mutate historical runs.
-- ----------------------------------------------------------------------------

CREATE TABLE pld_analysis_run_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES pld_analysis_runs(id) ON DELETE CASCADE,
  carrier_code carrier_code_enum NOT NULL,
  markup_strategy_id UUID NOT NULL REFERENCES markup_strategies(id),
  -- Snapshot of strategy contents at run-start (immutable)
  snapshot_strategy_type markup_strategy_type_enum NOT NULL,
  snapshot_rate_card_id UUID REFERENCES analysis_rate_cards(id),
  snapshot_fixed_amount NUMERIC(18, 4),
  snapshot_fixed_percentage NUMERIC(10, 6),
  snapshot_fuel_markup_treatment fuel_markup_treatment_enum,
  snapshot_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (run_id, carrier_code)
);

CREATE INDEX idx_pld_run_strategies_run_id ON pld_analysis_run_strategies(run_id);

COMMENT ON TABLE pld_analysis_run_strategies IS 'Snapshot of markup strategies attached to a run, captured at run-start. Decouples completed runs from later strategy edits.';

-- ----------------------------------------------------------------------------
-- pld_analysis_run_service_mappings — per-run snapshot of service mappings
-- ----------------------------------------------------------------------------

CREATE TABLE pld_analysis_run_service_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES pld_analysis_runs(id) ON DELETE CASCADE,
  source_service_level TEXT NOT NULL,
  cactus_carrier carrier_code_enum NOT NULL,
  cactus_service_level TEXT NOT NULL,
  is_no_equivalent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (run_id, source_service_level, cactus_carrier)
);

CREATE INDEX idx_pld_run_service_mappings_run ON pld_analysis_run_service_mappings(run_id);

COMMENT ON TABLE pld_analysis_run_service_mappings IS 'Per-run snapshot of source service level to Cactus carrier+service mappings used during rating.';

-- ----------------------------------------------------------------------------
-- global_service_level_mapping_defaults — seed dictionary of common synonyms
-- ----------------------------------------------------------------------------

CREATE TABLE global_service_level_mapping_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_service_level TEXT NOT NULL,
  cactus_carrier carrier_code_enum NOT NULL,
  cactus_service_level TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (source_service_level, cactus_carrier)
);

CREATE INDEX idx_global_service_mapping_lookup
  ON global_service_level_mapping_defaults(source_service_level, cactus_carrier);

COMMENT ON TABLE global_service_level_mapping_defaults IS 'Seed dictionary of common source service level synonyms. Used to pre-fill the per-lead mapping UI. Extend over time as new synonyms are observed.';
