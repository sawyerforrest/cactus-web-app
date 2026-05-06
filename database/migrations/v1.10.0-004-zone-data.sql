-- v1.10.0-004-zone-data.sql
-- PLD Analysis Engine v1 — zone resolution reference tables
-- Tables: carrier_zone_matrices, carrier_country_zone_matrices,
--         gofo_regional_zone_matrix, gofo_hubs, zip3_centroids,
--         gofo_hub_proximity, service_coverage_zips, gofo_remote_zip3s
-- Includes seed for gofo_hubs (7 rows). Other reference data loaded later.

-- ----------------------------------------------------------------------------
-- gofo_hubs — GOFO injection point reference (lat/long for proximity calc)
-- ----------------------------------------------------------------------------

CREATE TABLE gofo_hubs (
  hub_code gofo_hub_enum PRIMARY KEY,
  hub_name TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  primary_zip5 TEXT NOT NULL,
  latitude NUMERIC(10, 6) NOT NULL,
  longitude NUMERIC(10, 6) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE gofo_hubs IS 'GOFO Regional injection point hubs. Lat/long used to compute hub proximity per ZIP3.';

INSERT INTO gofo_hubs (hub_code, hub_name, city, state, primary_zip5, latitude, longitude) VALUES
  ('LAX',     'Los Angeles',          'Los Angeles',     'CA', '90045', 33.9416, -118.4085),
  ('DFW',     'Dallas/Fort Worth',    'Dallas',          'TX', '75261', 32.8998,  -97.0403),
  ('ORD',     'Chicago O''Hare',      'Chicago',         'IL', '60666', 41.9742,  -87.9073),
  ('EWR_JFK', 'New York/New Jersey',  'Newark',          'NJ', '07114', 40.6895,  -74.1745),
  ('ATL',     'Atlanta',              'Atlanta',         'GA', '30320', 33.6407,  -84.4277),
  ('MIA',     'Miami',                'Miami',           'FL', '33126', 25.7959,  -80.2870),
  ('SLC',     'Salt Lake City',       'Salt Lake City',  'UT', '84122', 40.7899, -111.9791);

-- ----------------------------------------------------------------------------
-- zip3_centroids — US Census ZCTA-derived ZIP3 centroid lookup
-- ----------------------------------------------------------------------------

CREATE TABLE zip3_centroids (
  zip3 CHAR(3) PRIMARY KEY,
  latitude NUMERIC(10, 6) NOT NULL,
  longitude NUMERIC(10, 6) NOT NULL,
  state TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'US_CENSUS_ZCTA',
  loaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_zip3_centroids_state ON zip3_centroids(state);

COMMENT ON TABLE zip3_centroids IS 'US Census ZCTA-derived ZIP3 centroid lat/long table. ~920 rows loaded via Phase 2 migration.';

-- ----------------------------------------------------------------------------
-- gofo_hub_proximity — Precomputed Haversine ZIP3 -> hub ranking
-- ----------------------------------------------------------------------------

CREATE TABLE gofo_hub_proximity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zip3 CHAR(3) NOT NULL REFERENCES zip3_centroids(zip3) ON DELETE CASCADE,
  hub_code gofo_hub_enum NOT NULL REFERENCES gofo_hubs(hub_code) ON DELETE CASCADE,
  distance_miles NUMERIC(10, 4) NOT NULL,
  rank INTEGER NOT NULL,
  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (zip3, hub_code)
);

CREATE INDEX idx_gofo_hub_proximity_zip3_rank ON gofo_hub_proximity(zip3, rank);
CREATE INDEX idx_gofo_hub_proximity_hub ON gofo_hub_proximity(hub_code);

COMMENT ON TABLE gofo_hub_proximity IS 'Precomputed Haversine ZIP3 to GOFO hub distance + rank. ~6,440 rows when fully loaded (920 ZIP3s x 7 hubs).';

-- ----------------------------------------------------------------------------
-- gofo_remote_zip3s — ZIP3 prefixes triggering GOFO Standard remote variant
-- ----------------------------------------------------------------------------

CREATE TABLE gofo_remote_zip3s (
  zip3 CHAR(3) PRIMARY KEY,
  region TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE gofo_remote_zip3s IS 'ZIP3 prefixes that trigger the GOFO Standard remote rate card variant (Hawaii, Alaska, PR, VI, Guam, Military APO/FPO).';

-- ----------------------------------------------------------------------------
-- carrier_zone_matrices — ZIP3-based zone resolution (DHL eCom domestic, GOFO Std, future USPS)
-- ----------------------------------------------------------------------------

CREATE TABLE carrier_zone_matrices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_code carrier_code_enum NOT NULL,
  service_level TEXT NOT NULL,
  matrix_version TEXT NOT NULL,
  origin_zip3 CHAR(3) NOT NULL,
  dest_zip3 CHAR(3) NOT NULL,
  zone TEXT NOT NULL,
  effective_date DATE NOT NULL,
  deprecated_date DATE,
  source TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (carrier_code, service_level, matrix_version, origin_zip3, dest_zip3)
);

CREATE INDEX idx_carrier_zone_matrices_lookup
  ON carrier_zone_matrices(carrier_code, service_level, origin_zip3, dest_zip3)
  WHERE deprecated_date IS NULL;

CREATE INDEX idx_carrier_zone_matrices_version
  ON carrier_zone_matrices(carrier_code, service_level, matrix_version);

COMMENT ON TABLE carrier_zone_matrices IS 'ZIP3-based zone matrix per carrier+service (DHL eCom domestic, GOFO Standard, future USPS). Versioned via matrix_version + effective_date / deprecated_date.';

-- ----------------------------------------------------------------------------
-- carrier_country_zone_matrices — Country-based zone resolution (DHL eCom intl)
-- ----------------------------------------------------------------------------

CREATE TABLE carrier_country_zone_matrices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_code carrier_code_enum NOT NULL,
  service_level TEXT NOT NULL,
  matrix_version TEXT NOT NULL,
  origin_country CHAR(2) NOT NULL DEFAULT 'US',
  dest_country CHAR(2) NOT NULL,
  zone TEXT NOT NULL,
  effective_date DATE NOT NULL,
  deprecated_date DATE,
  source TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (carrier_code, service_level, matrix_version, origin_country, dest_country)
);

CREATE INDEX idx_carrier_country_zone_matrices_lookup
  ON carrier_country_zone_matrices(carrier_code, service_level, origin_country, dest_country)
  WHERE deprecated_date IS NULL;

COMMENT ON TABLE carrier_country_zone_matrices IS 'Country-based zone matrix per carrier+service (DHL eCom international).';

-- ----------------------------------------------------------------------------
-- gofo_regional_zone_matrix — GOFO Regional injection-point + dest ZIP5 zones
-- ----------------------------------------------------------------------------

CREATE TABLE gofo_regional_zone_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_version TEXT NOT NULL,
  injection_point gofo_hub_enum NOT NULL,
  dest_zip5 TEXT NOT NULL,
  zone TEXT NOT NULL,
  effective_date DATE NOT NULL,
  deprecated_date DATE,
  source TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (matrix_version, injection_point, dest_zip5)
);

CREATE INDEX idx_gofo_regional_zone_lookup
  ON gofo_regional_zone_matrix(injection_point, dest_zip5)
  WHERE deprecated_date IS NULL;

COMMENT ON TABLE gofo_regional_zone_matrix IS 'GOFO Regional zone matrix keyed on (injection_point hub, destination ZIP5). ~8,361 ZIPs x 7 hubs when fully loaded.';

-- ----------------------------------------------------------------------------
-- service_coverage_zips — Admin-editable ZIP coverage for restricted services
-- ----------------------------------------------------------------------------

CREATE TABLE service_coverage_zips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_code carrier_code_enum NOT NULL,
  service_level TEXT NOT NULL,
  zip5 TEXT NOT NULL,
  is_serviceable BOOLEAN NOT NULL DEFAULT TRUE,
  effective_date DATE NOT NULL,
  deprecated_date DATE,
  source TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (carrier_code, service_level, zip5, effective_date)
);

CREATE INDEX idx_service_coverage_zips_lookup
  ON service_coverage_zips(carrier_code, service_level, zip5)
  WHERE deprecated_date IS NULL;

COMMENT ON TABLE service_coverage_zips IS 'Admin-editable ZIP-level service coverage for restricted-footprint services (e.g., GOFO Regional). Negative entries (is_serviceable=FALSE) supported for explicit exclusions.';
