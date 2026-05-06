-- v1.10.0-008-pld-shipments.sql
-- PLD Analysis Engine v1 — per-shipment rating rows + per-carrier rate detail
-- Includes immutability trigger that prevents UPDATE/DELETE on shipments
-- whose parent run.status = 'COMPLETE'. Honors Rule 6 (immutable records).

CREATE TABLE pld_analysis_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES pld_analysis_runs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,

  -- Source columns (verbatim from CSV, after normalization)
  source_tracking_number TEXT NOT NULL,
  source_order_number TEXT,
  source_ship_date DATE NOT NULL,
  source_carrier carrier_code_enum,
  source_service_level TEXT,
  source_origin_zip TEXT,
  source_dest_zip TEXT,
  source_dest_country CHAR(2),
  source_weight_value NUMERIC(10, 4),
  source_weight_unit weight_unit_enum,
  source_length NUMERIC(10, 4),
  source_width NUMERIC(10, 4),
  source_height NUMERIC(10, 4),
  source_dim_unit TEXT,                       -- 'IN' or 'CM'
  source_residential_flag BOOLEAN,
  source_zone TEXT,
  source_current_carrier_charge NUMERIC(18, 4),

  -- Derived per-shipment values (winning result)
  resolved_warehouse_id UUID REFERENCES lead_warehouses(id),
  resolved_zone TEXT,
  zone_mismatch BOOLEAN NOT NULL DEFAULT FALSE,
  computed_dim_weight NUMERIC(10, 4),
  billable_weight_value NUMERIC(10, 4),
  billable_weight_unit weight_unit_enum,
  is_dim_billed BOOLEAN NOT NULL DEFAULT FALSE,
  weight_break_used TEXT,
  winning_carrier carrier_code_enum,
  winning_service_level TEXT,
  winning_quoted_rate NUMERIC(18, 4),
  winning_base_cost NUMERIC(18, 4),
  winning_fuel_amount NUMERIC(18, 4),
  winning_markup_amount NUMERIC(18, 4),
  winning_margin NUMERIC(18, 4),
  winning_savings NUMERIC(18, 4),
  rating_status shipment_rating_status_enum NOT NULL DEFAULT 'OK',
  status_message TEXT,
  gofo_hub_used gofo_hub_enum,
  is_tied_at_rate BOOLEAN NOT NULL DEFAULT FALSE,
  winner_overridden_by_user_id UUID REFERENCES auth.users(id),
  winner_overridden_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  UNIQUE (run_id, row_number)
);

CREATE INDEX idx_pld_shipments_run_id ON pld_analysis_shipments(run_id);
CREATE INDEX idx_pld_shipments_run_status ON pld_analysis_shipments(run_id, rating_status);
CREATE INDEX idx_pld_shipments_winning_carrier ON pld_analysis_shipments(run_id, winning_carrier);
CREATE INDEX idx_pld_shipments_dest_zip3 ON pld_analysis_shipments(run_id, (substring(source_dest_zip, 1, 3)));
CREATE INDEX idx_pld_shipments_origin_zip3 ON pld_analysis_shipments(run_id, (substring(source_origin_zip, 1, 3)));

COMMENT ON TABLE pld_analysis_shipments IS 'One row per source shipment per run. Immutable once parent run.status = COMPLETE (enforced via trigger). Re-rate creates a new run.';

-- ----------------------------------------------------------------------------
-- pld_analysis_shipment_rates — per-shipment per-carrier rate detail
-- ----------------------------------------------------------------------------

CREATE TABLE pld_analysis_shipment_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES pld_analysis_shipments(id) ON DELETE CASCADE,
  carrier_code carrier_code_enum NOT NULL,
  service_level TEXT,
  resolved_zone TEXT,
  base_cost NUMERIC(18, 4),
  fuel_amount NUMERIC(18, 4),
  markup_applied_amount NUMERIC(18, 4),
  markup_tier_id UUID REFERENCES markup_strategy_tiers(id),
  quoted_rate NUMERIC(18, 4),
  margin NUMERIC(18, 4),
  margin_pct NUMERIC(10, 4),
  savings NUMERIC(18, 4),
  savings_pct NUMERIC(10, 4),
  rating_status shipment_rating_status_enum NOT NULL DEFAULT 'OK',
  status_message TEXT,
  is_winner BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (shipment_id, carrier_code)
);

CREATE INDEX idx_pld_shipment_rates_shipment ON pld_analysis_shipment_rates(shipment_id);
CREATE INDEX idx_pld_shipment_rates_carrier ON pld_analysis_shipment_rates(shipment_id, carrier_code);

COMMENT ON TABLE pld_analysis_shipment_rates IS 'Per-shipment per-carrier rate detail. Multiple rows per shipment when multi-carrier orchestrator rates against several carriers.';

-- ----------------------------------------------------------------------------
-- Immutability trigger — prevents UPDATE/DELETE of shipments whose parent
-- run.status = 'COMPLETE'. The "winner override" path is explicitly allowed
-- via the same UPDATE; if/when that's needed at scale, it will go through a
-- service-role privileged path that disables the trigger transiently.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_completed_run_shipment_mutation()
RETURNS TRIGGER AS $$
DECLARE
  parent_status analysis_run_status_enum;
BEGIN
  SELECT status INTO parent_status FROM pld_analysis_runs WHERE id = OLD.run_id;
  IF parent_status = 'COMPLETE' THEN
    RAISE EXCEPTION 'Cannot mutate shipments of a COMPLETE run. Re-rate via new run instead.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pld_analysis_shipments_immutable_when_complete
  BEFORE UPDATE OR DELETE ON pld_analysis_shipments
  FOR EACH ROW EXECUTE FUNCTION prevent_completed_run_shipment_mutation();

COMMENT ON FUNCTION prevent_completed_run_shipment_mutation IS 'Enforces master briefing Rule 6: pld_analysis_shipments rows are immutable once parent run.status = COMPLETE.';
