-- v1.10.0-005-rate-cards.sql
-- PLD Analysis Engine v1 — analysis rate cards (lead-scoped or global)
-- SEPARATE from production public.rate_cards. PLD uses analysis_rate_cards exclusively.

CREATE TABLE analysis_rate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_code carrier_code_enum NOT NULL,
  service_level TEXT NOT NULL,
  variant TEXT,                              -- e.g. 'standard', 'remote' for GOFO Standard
  card_version TEXT NOT NULL,
  purpose analysis_rate_card_purpose_enum NOT NULL,  -- CACTUS_BASE_COST or LEAD_QUOTED
  lead_id UUID REFERENCES leads(id),         -- NULL for global / Cactus base cost cards
  parent_rate_card_id UUID REFERENCES analysis_rate_cards(id),  -- LEAD_QUOTED references its CACTUS_BASE_COST parent
  zone_resolution_mode zone_resolution_mode_enum NOT NULL,
  weight_unit weight_unit_enum NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  dim_factor INTEGER NOT NULL,
  dim_min_weight_lb NUMERIC(10, 4),
  dim_min_volume_cuin NUMERIC(12, 4),
  effective_date DATE NOT NULL,
  deprecated_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  source TEXT,
  created_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  -- Parent-child constraint: LEAD_QUOTED requires both lead_id and parent_rate_card_id
  CONSTRAINT chk_lead_quoted_has_parent_and_lead CHECK (
    (purpose = 'CACTUS_BASE_COST' AND parent_rate_card_id IS NULL AND lead_id IS NULL)
    OR
    (purpose = 'LEAD_QUOTED' AND parent_rate_card_id IS NOT NULL AND lead_id IS NOT NULL)
  )
);

CREATE INDEX idx_analysis_rate_cards_active_lookup
  ON analysis_rate_cards(carrier_code, service_level, purpose, lead_id, effective_date DESC)
  WHERE deleted_at IS NULL AND is_active = TRUE AND deprecated_date IS NULL;

CREATE INDEX idx_analysis_rate_cards_lead_id
  ON analysis_rate_cards(lead_id)
  WHERE lead_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_analysis_rate_cards_parent
  ON analysis_rate_cards(parent_rate_card_id)
  WHERE parent_rate_card_id IS NOT NULL;

COMMENT ON TABLE analysis_rate_cards IS 'PLD-side rate cards. Separate from production public.rate_cards. CACTUS_BASE_COST cards are global (lead_id NULL); LEAD_QUOTED cards reference a parent_rate_card_id and a lead_id.';

-- ----------------------------------------------------------------------------
-- analysis_rate_card_cells — rate matrix cells (zone x weight -> rate)
-- ----------------------------------------------------------------------------

CREATE TABLE analysis_rate_card_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_card_id UUID NOT NULL REFERENCES analysis_rate_cards(id) ON DELETE CASCADE,
  zone TEXT NOT NULL,
  weight_value NUMERIC(10, 4) NOT NULL,
  weight_unit weight_unit_enum NOT NULL,
  rate NUMERIC(18, 4) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (rate_card_id, zone, weight_value, weight_unit)
);

CREATE INDEX idx_analysis_rate_card_cells_lookup
  ON analysis_rate_card_cells(rate_card_id, zone, weight_unit, weight_value);

COMMENT ON TABLE analysis_rate_card_cells IS 'Rate matrix cells for analysis rate cards. Lookup keyed on (card, zone, weight_unit, weight_value).';
