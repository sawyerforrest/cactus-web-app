-- v1.10.0-003-leads-tables.sql
-- PLD Analysis Engine v1 — leads + lead-scoped child tables

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  company_profile lead_company_profile_enum NOT NULL,
  label_generation_software lead_label_software_enum,
  label_generation_software_other TEXT,
  website TEXT,
  lead_source_type lead_source_type_enum NOT NULL,
  lead_source_name TEXT,
  primary_contact_name TEXT NOT NULL,
  primary_contact_email TEXT NOT NULL,
  primary_contact_phone TEXT,
  monthly_label_volume INTEGER,
  estimated_monthly_margin NUMERIC(18, 4),
  estimated_monthly_margin_currency CHAR(3) NOT NULL DEFAULT 'USD',
  stage lead_stage_enum NOT NULL DEFAULT 'NEW',
  converted_to_org_id UUID REFERENCES organizations(id),
  converted_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_leads_stage ON leads(stage) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_company_name ON leads(company_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_converted_to_org_id ON leads(converted_to_org_id) WHERE converted_to_org_id IS NOT NULL;
CREATE INDEX idx_leads_created_by_user_id ON leads(created_by_user_id);

COMMENT ON TABLE leads IS 'Sales leads for the PLD Analysis Engine. Promote to organizations via converted_to_org_id on conversion. Soft-delete via deleted_at.';

-- ----------------------------------------------------------------------------
-- lead_current_carriers — many-to-many: which carriers a lead currently uses
-- ----------------------------------------------------------------------------

CREATE TABLE lead_current_carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  carrier_code carrier_code_enum NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (lead_id, carrier_code)
);

CREATE INDEX idx_lead_current_carriers_lead_id ON lead_current_carriers(lead_id);

COMMENT ON TABLE lead_current_carriers IS 'Many-to-many: which carriers a lead currently uses.';

-- ----------------------------------------------------------------------------
-- lead_warehouses — multi-warehouse support per lead
-- ----------------------------------------------------------------------------

CREATE TABLE lead_warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  state TEXT,
  zip5 TEXT,
  country CHAR(2) NOT NULL DEFAULT 'US',
  preferred_gofo_hub gofo_hub_enum,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_warehouses_lead_id ON lead_warehouses(lead_id);
CREATE INDEX idx_lead_warehouses_zip5 ON lead_warehouses(zip5);

COMMENT ON TABLE lead_warehouses IS 'Per-lead warehouses. preferred_gofo_hub auto-set at create time via gofo_hub_proximity, user-overrideable.';

-- ----------------------------------------------------------------------------
-- lead_service_level_mappings — persistent per-lead source → Cactus mappings
-- ----------------------------------------------------------------------------

CREATE TABLE lead_service_level_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  source_service_level TEXT NOT NULL,
  cactus_carrier carrier_code_enum NOT NULL,
  cactus_service_level TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (lead_id, source_service_level, cactus_carrier)
);

CREATE INDEX idx_lead_service_level_mappings_lead_id ON lead_service_level_mappings(lead_id);
CREATE INDEX idx_lead_service_level_mappings_source ON lead_service_level_mappings(lead_id, source_service_level);

COMMENT ON TABLE lead_service_level_mappings IS 'Per-lead persistent source service level → Cactus carrier+service mappings. One source service can map to multiple Cactus carriers.';
