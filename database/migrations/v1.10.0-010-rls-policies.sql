-- v1.10.0-010-rls-policies.sql
-- PLD Analysis Engine v1 — RLS enable + permissive policies for all 24 new tables
-- v1: single-user, all-access for authenticated users.
-- v1.5: tighten to per-org / per-creator policies.

-- Enable RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_current_carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_service_level_mappings ENABLE ROW LEVEL SECURITY;

ALTER TABLE gofo_hubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE zip3_centroids ENABLE ROW LEVEL SECURITY;
ALTER TABLE gofo_hub_proximity ENABLE ROW LEVEL SECURITY;
ALTER TABLE gofo_remote_zip3s ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_zone_matrices ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_country_zone_matrices ENABLE ROW LEVEL SECURITY;
ALTER TABLE gofo_regional_zone_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_coverage_zips ENABLE ROW LEVEL SECURITY;

ALTER TABLE analysis_rate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_rate_card_cells ENABLE ROW LEVEL SECURITY;

ALTER TABLE markup_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE markup_strategy_tiers ENABLE ROW LEVEL SECURITY;

ALTER TABLE pld_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pld_analysis_run_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE pld_analysis_run_service_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_service_level_mapping_defaults ENABLE ROW LEVEL SECURITY;

ALTER TABLE pld_analysis_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pld_analysis_shipment_rates ENABLE ROW LEVEL SECURITY;

ALTER TABLE dhl_ecom_fuel_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE diesel_price_history ENABLE ROW LEVEL SECURITY;

-- v1 permissive policies: authenticated users have full access
CREATE POLICY pld_v1_authenticated_all ON leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pld_v1_authenticated_all ON lead_current_carriers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pld_v1_authenticated_all ON lead_warehouses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pld_v1_authenticated_all ON lead_service_level_mappings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY pld_v1_authenticated_all ON gofo_hubs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pld_v1_authenticated_all ON zip3_centroids FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pld_v1_authenticated_all ON gofo_hub_proximity FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pld_v1_authenticated_all ON gofo_remote_zip3s FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pld_v1_authenticated_all ON carrier_zone_matrices FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pld_v1_authenticated_all ON carrier_country_zone_matrices FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pld_v1_authenticated_all ON gofo_regional_zone_matrix FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pld_v1_authenticated_all ON service_coverage_zips FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY pld_v1_authenticated_all ON analysis_rate_cards FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pld_v1_authenticated_all ON analysis_rate_card_cells FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY pld_v1_authenticated_all ON markup_strategies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pld_v1_authenticated_all ON markup_strategy_tiers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY pld_v1_authenticated_all ON pld_analysis_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pld_v1_authenticated_all ON pld_analysis_run_strategies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pld_v1_authenticated_all ON pld_analysis_run_service_mappings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pld_v1_authenticated_all ON global_service_level_mapping_defaults FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY pld_v1_authenticated_all ON pld_analysis_shipments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pld_v1_authenticated_all ON pld_analysis_shipment_rates FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY pld_v1_authenticated_all ON dhl_ecom_fuel_tiers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pld_v1_authenticated_all ON diesel_price_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- service_role has bypass-RLS by default in Supabase, so admin client reads/writes
-- continue to work without explicit grants. Consistent with the rest of the schema.
GRANT ALL ON
  leads, lead_current_carriers, lead_warehouses, lead_service_level_mappings,
  gofo_hubs, zip3_centroids, gofo_hub_proximity, gofo_remote_zip3s,
  carrier_zone_matrices, carrier_country_zone_matrices, gofo_regional_zone_matrix,
  service_coverage_zips,
  analysis_rate_cards, analysis_rate_card_cells,
  markup_strategies, markup_strategy_tiers,
  pld_analysis_runs, pld_analysis_run_strategies, pld_analysis_run_service_mappings,
  global_service_level_mapping_defaults,
  pld_analysis_shipments, pld_analysis_shipment_rates,
  dhl_ecom_fuel_tiers, diesel_price_history
TO service_role;
