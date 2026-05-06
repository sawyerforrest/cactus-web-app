-- v1.10.0-001-extend-carrier-enum.sql
-- PLD Analysis Engine v1 — extend carrier_code_enum for lead-side current-carrier tracking
-- Adds: AMAZON, EPOST_GLOBAL, CIRRO, SPEEDX, ASENDIA
-- Non-destructive (ALTER TYPE ADD VALUE). Existing rows unaffected.

ALTER TYPE carrier_code_enum ADD VALUE IF NOT EXISTS 'AMAZON';
ALTER TYPE carrier_code_enum ADD VALUE IF NOT EXISTS 'EPOST_GLOBAL';
ALTER TYPE carrier_code_enum ADD VALUE IF NOT EXISTS 'CIRRO';
ALTER TYPE carrier_code_enum ADD VALUE IF NOT EXISTS 'SPEEDX';
ALTER TYPE carrier_code_enum ADD VALUE IF NOT EXISTS 'ASENDIA';
