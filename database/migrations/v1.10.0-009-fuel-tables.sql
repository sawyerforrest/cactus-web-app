-- v1.10.0-009-fuel-tables.sql
-- PLD Analysis Engine v1 — DHL eCom fuel surcharge tiers + weekly diesel price index
-- Reference data seeded in migration 012.

CREATE TABLE dhl_ecom_fuel_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_date DATE NOT NULL,
  deprecated_date DATE,
  diesel_price_min NUMERIC(10, 4) NOT NULL,
  diesel_price_max NUMERIC(10, 4) NOT NULL,    -- exclusive upper bound; the next tier's _min equals this _max
  fuel_per_lb NUMERIC(10, 6) NOT NULL,
  source TEXT NOT NULL DEFAULT 'DHL_PUBLISHED',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CHECK (diesel_price_min < diesel_price_max),
  UNIQUE (effective_date, diesel_price_min, diesel_price_max)
);

CREATE INDEX idx_dhl_fuel_tiers_lookup
  ON dhl_ecom_fuel_tiers(effective_date DESC, diesel_price_min, diesel_price_max)
  WHERE deprecated_date IS NULL;

COMMENT ON TABLE dhl_ecom_fuel_tiers IS 'DHL eCommerce per-pound fuel surcharge tiers indexed to diesel price. Effective_date enables tier schedule changes over time. Loaded from DHL published PDFs.';

-- ----------------------------------------------------------------------------
-- diesel_price_history — weekly EIA national diesel price (auto + manual entry)
-- ----------------------------------------------------------------------------

CREATE TABLE diesel_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_week_start DATE NOT NULL,
  effective_week_end DATE NOT NULL,
  national_avg_price NUMERIC(10, 4) NOT NULL,
  source TEXT NOT NULL DEFAULT 'EIA',
  source_url TEXT,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  CHECK (effective_week_start <= effective_week_end),
  UNIQUE (effective_week_start)
);

CREATE INDEX idx_diesel_price_lookup
  ON diesel_price_history(effective_week_start, effective_week_end);

COMMENT ON TABLE diesel_price_history IS 'Weekly US national average on-highway diesel price. Source: EIA (Mondays, 7 AM ET via Edge Function). Manual entry also supported.';
