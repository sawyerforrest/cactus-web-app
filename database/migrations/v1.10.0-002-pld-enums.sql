-- v1.10.0-002-pld-enums.sql
-- PLD Analysis Engine v1 — create 13 new enum types

CREATE TYPE lead_company_profile_enum AS ENUM ('MERCHANT', 'THREE_PL', 'OTHER');

CREATE TYPE lead_label_software_enum AS ENUM (
  'WAREHANCE', 'SHIPSTATION', 'PACKIYO', 'EXTENSIV',
  'DEPOSCO', 'LOGIWA', 'CUSTOM', 'OTHER'
);

CREATE TYPE lead_source_type_enum AS ENUM (
  'BD_PARTNER', 'COLD_PROSPECTING', 'MARKETING', 'REFERRAL'
);

CREATE TYPE lead_stage_enum AS ENUM (
  'NEW', 'ENGAGED', 'ANALYSIS_RUN', 'QUOTED', 'WON', 'LOST', 'ARCHIVED'
);

CREATE TYPE gofo_hub_enum AS ENUM (
  'LAX', 'DFW', 'ORD', 'EWR_JFK', 'ATL', 'MIA', 'SLC'
);

CREATE TYPE analysis_rate_card_purpose_enum AS ENUM (
  'CACTUS_BASE_COST', 'LEAD_QUOTED'
);

CREATE TYPE markup_strategy_type_enum AS ENUM (
  'RATE_CARD', 'FIXED_AMOUNT', 'FIXED_PERCENTAGE', 'TIERED'
);

CREATE TYPE markup_tier_type_enum AS ENUM (
  'FIXED_AMOUNT', 'FIXED_PERCENTAGE'
);

CREATE TYPE zone_resolution_mode_enum AS ENUM (
  'ORIGIN_DEST_ZIP3', 'INJECTION_POINT_DEST_ZIP5', 'ORIGIN_COUNTRY_DEST_COUNTRY'
);

CREATE TYPE analysis_run_status_enum AS ENUM (
  'DRAFT', 'READY_TO_RATE', 'RATING', 'COMPLETE', 'FAILED', 'ARCHIVED'
);

CREATE TYPE shipment_rating_status_enum AS ENUM (
  'OK', 'UNMATCHED', 'NO_COVERAGE', 'EXCLUDED', 'NEEDS_MAPPING'
);

CREATE TYPE fuel_markup_treatment_enum AS ENUM (
  'COMPOUND', 'ADDITIVE'
);

CREATE TYPE weight_unit_enum AS ENUM (
  'OZ', 'LB', 'KG'
);
