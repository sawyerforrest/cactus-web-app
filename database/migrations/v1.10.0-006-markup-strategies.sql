-- v1.10.0-006-markup-strategies.sql
-- PLD Analysis Engine v1 — markup strategies + tier rules

CREATE TABLE markup_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  strategy_type markup_strategy_type_enum NOT NULL,
  lead_id UUID REFERENCES leads(id),       -- NULL = reusable / global, populated = lead-specific
  carrier_code carrier_code_enum,           -- NULL allows multi-carrier strategies; otherwise locked to one
  -- RATE_CARD strategy fields
  rate_card_id UUID REFERENCES analysis_rate_cards(id),
  -- FIXED_AMOUNT strategy fields
  fixed_amount NUMERIC(18, 4),
  -- FIXED_PERCENTAGE strategy fields
  fixed_percentage NUMERIC(10, 6),         -- e.g. 12.0000 for 12%
  fuel_markup_treatment fuel_markup_treatment_enum DEFAULT 'COMPOUND',
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  deprecated_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  -- Strategy-type field constraint: only the relevant column populated per strategy type
  CONSTRAINT chk_markup_strategy_type_fields CHECK (
    (strategy_type = 'RATE_CARD'        AND rate_card_id IS NOT NULL  AND fixed_amount IS NULL AND fixed_percentage IS NULL)
    OR
    (strategy_type = 'FIXED_AMOUNT'     AND rate_card_id IS NULL      AND fixed_amount IS NOT NULL AND fixed_percentage IS NULL)
    OR
    (strategy_type = 'FIXED_PERCENTAGE' AND rate_card_id IS NULL      AND fixed_amount IS NULL     AND fixed_percentage IS NOT NULL)
    OR
    (strategy_type = 'TIERED'           AND rate_card_id IS NULL      AND fixed_amount IS NULL     AND fixed_percentage IS NULL)
  )
);

CREATE INDEX idx_markup_strategies_lead_id
  ON markup_strategies(lead_id)
  WHERE lead_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_markup_strategies_global_active
  ON markup_strategies(carrier_code, strategy_type, effective_date DESC)
  WHERE lead_id IS NULL AND deleted_at IS NULL AND is_active = TRUE;

COMMENT ON TABLE markup_strategies IS 'PLD markup strategies. Four types: RATE_CARD, FIXED_AMOUNT, FIXED_PERCENTAGE, TIERED. Strategies are reusable (lead_id NULL) or lead-specific (lead_id populated).';

-- ----------------------------------------------------------------------------
-- markup_strategy_tiers — per-tier rules for TIERED markup strategies
-- ----------------------------------------------------------------------------

CREATE TABLE markup_strategy_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES markup_strategies(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL,                -- evaluated ASC; first match wins
  weight_min NUMERIC(10, 4),
  weight_max NUMERIC(10, 4),
  weight_unit weight_unit_enum,
  zone TEXT,
  carrier_code carrier_code_enum,
  service_level TEXT,
  tier_type markup_tier_type_enum NOT NULL,
  tier_amount NUMERIC(18, 6) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (strategy_id, priority)
);

CREATE INDEX idx_markup_strategy_tiers_strategy ON markup_strategy_tiers(strategy_id, priority);

COMMENT ON TABLE markup_strategy_tiers IS 'Per-tier rules for TIERED markup strategies. Each tier independently FIXED_AMOUNT or FIXED_PERCENTAGE. Tiers ordered by priority ASC; first match wins.';
