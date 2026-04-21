-- ==========================================================================
-- SEED v1.6.1 — Pineridge Direct (flat-markup test organization)
-- Date: 2026-04-20
-- Session: B (pipeline restructure, CSV generator)
--
-- Purpose: Give the 85-column client CSV generator a flat-markup
--          dataset to exercise. Cactus 3PL HQ (the original test
--          invoice) uses percentage markup; Pineridge uses flat
--          $1.50 per shipment so CSV column rules can be
--          verified against both modes.
--
-- Safety: Uses obvious fake UUID patterns and 1ZPINERIDGE*
--          tracking numbers so these rows are never confused
--          with production data.
--          Safe to re-run via `ON CONFLICT DO NOTHING` — see
--          each INSERT. Idempotent.
--
-- Scope:  Seeds only what the CSV generator needs to load:
--          - organizations (1 row)
--          - locations (1 row)
--          - org_carrier_accounts (1 row, flat $1.50)
--          - carrier_invoices (1 row, status COMPLETE)
--          - invoice_line_items (15 rows, AUTO_MATCHED + APPROVED,
--            pre-computed final_billed_rate using the flat rule:
--            carrier_charge + 1.50 per shipment)
--          - cactus_invoices (1 row)
--          - cactus_invoice_line_items (15 junction rows)
--
-- DOES NOT seed shipment_ledger or shipment_events — these lines
--          simulate a dark-matched invoice whose ledger rows
--          would be created by the real match.ts code path.
--          Seeded directly to APPROVED because the CSV generator
--          reads from invoice_line_items regardless of which
--          pipeline stage produced the APPROVED state.
-- ==========================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Organization
-- --------------------------------------------------------------------------
INSERT INTO organizations
  (id, name, org_type, terms_days, tracking_alert_threshold_days)
VALUES
  ('11111111-0000-0000-0000-000000000001'::uuid,
   'Pineridge Direct',
   '3PL',
   10,
   3)
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------------------------
-- 2. Location (shipping origin + billing address)
-- --------------------------------------------------------------------------
INSERT INTO locations
  (id, org_id, name, location_type,
   address_line1, city, state, postal_code, country,
   normalized_address, is_billing_address, is_active)
VALUES
  ('11111111-1000-0000-0000-000000000001'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid,
   'Pineridge Main WH',
   'SHIP_FROM',
   '8750 E PINE RIDGE DR',
   'BOISE',
   'ID',
   '83716',
   'US',
   '8750 E PINE RIDGE DR, BOISE, ID, 83716, US',
   TRUE,
   TRUE)
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------------------------
-- 3. Carrier account — UPS, lassoed, flat $1.50 markup
--
-- NOTE: markup_percentage = 0, markup_flat_fee = 1.5000. The
--       deriveMarkupContext() helper in markup-context.ts
--       resolves this to markup_type_applied = 'flat' because
--       markup_flat_fee > 0.
-- --------------------------------------------------------------------------
INSERT INTO org_carrier_accounts
  (id, org_id, carrier_code, account_number, account_nickname,
   carrier_account_mode, is_cactus_account, use_rate_card,
   markup_percentage, markup_flat_fee, dispute_threshold,
   is_active)
VALUES
  ('11111111-2000-0000-0000-000000000001'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid,
   'UPS',
   'PINERIDGE-UPS-TEST',
   'Pineridge UPS',
   'lassoed_carrier_account',
   TRUE,
   FALSE,
   0.0000,
   1.5000,
   2.0000,
   TRUE)
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------------------------
-- 4. Carrier invoice (synthetic — no real file uploaded)
-- --------------------------------------------------------------------------
INSERT INTO carrier_invoices
  (id, org_id, carrier_code, org_carrier_account_id,
   invoice_file_name, invoice_format,
   invoice_period_start, invoice_period_end,
   status, total_carrier_amount, total_line_items,
   matched_line_items, flagged_line_items, has_unmapped_charges,
   processed_at)
VALUES
  ('11111111-3000-0000-0000-000000000001'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid,
   'UPS',
   '11111111-2000-0000-0000-000000000001'::uuid,
   'pineridge-ups-test-invoice.csv',
   'DETAIL',
   DATE '2026-04-11',
   DATE '2026-04-17',
   'COMPLETE',
   333.27,
   15,
   15,
   0,
   FALSE,
   now())
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------------------------
-- 5. Cactus (client-facing) invoice
--
-- billing_period_* covers the same week as the carrier invoice.
-- total_amount equals the sum of line final_billed_rate below.
-- --------------------------------------------------------------------------
INSERT INTO cactus_invoices
  (id, org_id, billing_period_start, billing_period_end,
   total_amount, due_date, status)
VALUES
  ('11111111-4000-0000-0000-000000000001'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid,
   DATE '2026-04-11',
   DATE '2026-04-17',
   354.27,  -- DN-2 2026-04-20: was 355.77; row 14 dropped $1.50
   DATE '2026-04-27',  -- Net-10 per org.terms_days
   'UNPAID')
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------------------------
-- 6. Invoice line items (15 rows) + cactus_invoice_line_items junction
--
-- Pattern for final_billed_rate under flat markup:
--   final_billed_rate = carrier_charge + 1.50
-- Single-Ceiling does not change anything because flat fees
-- don't introduce fractional cents.
--
-- DN-2 EXCEPTION (resolved 2026-04-20): row 14 (is_adjustment_only = TRUE).
-- Flat fee is NOT applied to adjustment-only lines because there is no
-- base charge to attach the fee to. Row 14's final_billed_rate equals
-- carrier_charge ($3.50) — flat fee is suppressed even though
-- markup_value_applied = 1.5000 documents what was configured.
-- --------------------------------------------------------------------------

INSERT INTO invoice_line_items
  (id, carrier_invoice_id, org_id, org_carrier_account_id,
   tracking_number, account_number_carrier,
   service_level, zone,
   weight_billed, weight_unit_billed,
   length_carrier, width_carrier, height_carrier,
   date_shipped, date_delivered, date_invoiced,
   address_sender_line1, address_sender_city, address_sender_state,
   address_sender_zip, address_sender_country, address_sender_normalized,
   address_receiver_line1, address_receiver_city, address_receiver_state,
   address_receiver_zip, address_receiver_country,
   base_charge, fuel_surcharge, residential_surcharge,
   delivery_area_surcharge, additional_handling, other_surcharges,
   apv_adjustment,
   carrier_charge,
   match_method, match_status, match_location_id,
   markup_type_applied, markup_value_applied, markup_source,
   is_adjustment_only,
   pre_ceiling_amount, final_billed_rate,
   billing_status, dispute_flag,
   cactus_invoice_id)
VALUES
  -- Row 1: Ground Commercial, zone 5, 2 lb
  ('11111111-5000-0000-0000-000000000001'::uuid,
   '11111111-3000-0000-0000-000000000001'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid,
   '11111111-2000-0000-0000-000000000001'::uuid,
   '1ZPINERIDGE000001', 'PINERIDGE-UPS-TEST',
   'Ground Commercial', '005',
   2.00, 'LB', 8.00, 6.00, 4.00,
   DATE '2026-04-13', DATE '2026-04-15', DATE '2026-04-17',
   '8750 E PINE RIDGE DR', 'BOISE', 'ID', '83716', 'US',
   '8750 E PINE RIDGE DR, BOISE, ID, 83716, US',
   '123 MAIN ST', 'DENVER', 'CO', '80202', 'US',
   12.50, 1.25, 0.00, 0.00, 0.00, 0.00, 0.00,
   13.75,
   'SHIP_FROM_ADDRESS', 'AUTO_MATCHED',
   '11111111-1000-0000-0000-000000000001'::uuid,
   'flat', 1.500000, 'carrier_account', FALSE,
   15.25, 15.25, 'APPROVED', FALSE,
   '11111111-4000-0000-0000-000000000001'::uuid),

  -- Row 2: Ground Residential, zone 7, 5 lb
  ('11111111-5000-0000-0000-000000000002'::uuid,
   '11111111-3000-0000-0000-000000000001'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid,
   '11111111-2000-0000-0000-000000000001'::uuid,
   '1ZPINERIDGE000002', 'PINERIDGE-UPS-TEST',
   'Ground Residential', '007',
   5.00, 'LB', 12.00, 10.00, 6.00,
   DATE '2026-04-13', DATE '2026-04-16', DATE '2026-04-17',
   '8750 E PINE RIDGE DR', 'BOISE', 'ID', '83716', 'US',
   '8750 E PINE RIDGE DR, BOISE, ID, 83716, US',
   '456 OAK AVE', 'AUSTIN', 'TX', '78701', 'US',
   15.80, 1.58, 4.95, 0.00, 0.00, 0.00, 0.00,
   22.33,
   'SHIP_FROM_ADDRESS', 'AUTO_MATCHED',
   '11111111-1000-0000-0000-000000000001'::uuid,
   'flat', 1.500000, 'carrier_account', FALSE,
   23.83, 23.83, 'APPROVED', FALSE,
   '11111111-4000-0000-0000-000000000001'::uuid),

  -- Row 3: 2nd Day Air, zone 4, 3 lb
  ('11111111-5000-0000-0000-000000000003'::uuid,
   '11111111-3000-0000-0000-000000000001'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid,
   '11111111-2000-0000-0000-000000000001'::uuid,
   '1ZPINERIDGE000003', 'PINERIDGE-UPS-TEST',
   '2nd Day Air', '004',
   3.00, 'LB', 10.00, 8.00, 5.00,
   DATE '2026-04-14', DATE '2026-04-15', DATE '2026-04-17',
   '8750 E PINE RIDGE DR', 'BOISE', 'ID', '83716', 'US',
   '8750 E PINE RIDGE DR, BOISE, ID, 83716, US',
   '789 BIRCH LN', 'SEATTLE', 'WA', '98101', 'US',
   22.40, 2.24, 0.00, 0.00, 0.00, 0.00, 0.00,
   24.64,
   'SHIP_FROM_ADDRESS', 'AUTO_MATCHED',
   '11111111-1000-0000-0000-000000000001'::uuid,
   'flat', 1.500000, 'carrier_account', FALSE,
   26.14, 26.14, 'APPROVED', FALSE,
   '11111111-4000-0000-0000-000000000001'::uuid),

  -- Row 4: Ground Commercial, zone 3, 1 lb
  ('11111111-5000-0000-0000-000000000004'::uuid,
   '11111111-3000-0000-0000-000000000001'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid,
   '11111111-2000-0000-0000-000000000001'::uuid,
   '1ZPINERIDGE000004', 'PINERIDGE-UPS-TEST',
   'Ground Commercial', '003',
   1.00, 'LB', 6.00, 4.00, 3.00,
   DATE '2026-04-14', DATE '2026-04-16', DATE '2026-04-17',
   '8750 E PINE RIDGE DR', 'BOISE', 'ID', '83716', 'US',
   '8750 E PINE RIDGE DR, BOISE, ID, 83716, US',
   '321 ELM ST', 'SALT LAKE CITY', 'UT', '84101', 'US',
   9.20, 0.92, 0.00, 0.00, 0.00, 0.00, 0.00,
   10.12,
   'SHIP_FROM_ADDRESS', 'AUTO_MATCHED',
   '11111111-1000-0000-0000-000000000001'::uuid,
   'flat', 1.500000, 'carrier_account', FALSE,
   11.62, 11.62, 'APPROVED', FALSE,
   '11111111-4000-0000-0000-000000000001'::uuid),

  -- Row 5: Ground Residential, zone 5, 10 lb (resi + delivery_area)
  ('11111111-5000-0000-0000-000000000005'::uuid,
   '11111111-3000-0000-0000-000000000001'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid,
   '11111111-2000-0000-0000-000000000001'::uuid,
   '1ZPINERIDGE000005', 'PINERIDGE-UPS-TEST',
   'Ground Residential', '005',
   10.00, 'LB', 14.00, 12.00, 10.00,
   DATE '2026-04-14', DATE '2026-04-17', DATE '2026-04-17',
   '8750 E PINE RIDGE DR', 'BOISE', 'ID', '83716', 'US',
   '8750 E PINE RIDGE DR, BOISE, ID, 83716, US',
   '901 CEDAR CT', 'BILLINGS', 'MT', '59101', 'US',
   18.50, 1.85, 4.95, 3.50, 0.00, 0.00, 0.00,
   28.80,
   'SHIP_FROM_ADDRESS', 'AUTO_MATCHED',
   '11111111-1000-0000-0000-000000000001'::uuid,
   'flat', 1.500000, 'carrier_account', FALSE,
   30.30, 30.30, 'APPROVED', FALSE,
   '11111111-4000-0000-0000-000000000001'::uuid),

  -- Row 6: Ground Commercial, zone 6, 8 lb
  ('11111111-5000-0000-0000-000000000006'::uuid,
   '11111111-3000-0000-0000-000000000001'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid,
   '11111111-2000-0000-0000-000000000001'::uuid,
   '1ZPINERIDGE000006', 'PINERIDGE-UPS-TEST',
   'Ground Commercial', '006',
   8.00, 'LB', 14.00, 10.00, 6.00,
   DATE '2026-04-15', DATE '2026-04-17', DATE '2026-04-17',
   '8750 E PINE RIDGE DR', 'BOISE', 'ID', '83716', 'US',
   '8750 E PINE RIDGE DR, BOISE, ID, 83716, US',
   '12 CORPORATE WAY', 'PHOENIX', 'AZ', '85001', 'US',
   16.40, 1.64, 0.00, 0.00, 0.00, 0.00, 0.00,
   18.04,
   'SHIP_FROM_ADDRESS', 'AUTO_MATCHED',
   '11111111-1000-0000-0000-000000000001'::uuid,
   'flat', 1.500000, 'carrier_account', FALSE,
   19.54, 19.54, 'APPROVED', FALSE,
   '11111111-4000-0000-0000-000000000001'::uuid),

  -- Row 7: 2nd Day Air Residential, zone 7, 2 lb
  ('11111111-5000-0000-0000-000000000007'::uuid,
   '11111111-3000-0000-0000-000000000001'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid,
   '11111111-2000-0000-0000-000000000001'::uuid,
   '1ZPINERIDGE000007', 'PINERIDGE-UPS-TEST',
   '2nd Day Air Residential', '007',
   2.00, 'LB', 9.00, 7.00, 5.00,
   DATE '2026-04-15', DATE '2026-04-16', DATE '2026-04-17',
   '8750 E PINE RIDGE DR', 'BOISE', 'ID', '83716', 'US',
   '8750 E PINE RIDGE DR, BOISE, ID, 83716, US',
   '55 LAKESIDE DR', 'CHARLOTTE', 'NC', '28201', 'US',
   28.70, 2.87, 4.95, 0.00, 0.00, 0.00, 0.00,
   36.52,
   'SHIP_FROM_ADDRESS', 'AUTO_MATCHED',
   '11111111-1000-0000-0000-000000000001'::uuid,
   'flat', 1.500000, 'carrier_account', FALSE,
   38.02, 38.02, 'APPROVED', FALSE,
   '11111111-4000-0000-0000-000000000001'::uuid),

  -- Row 8: Ground Commercial, zone 2, 3 lb
  ('11111111-5000-0000-0000-000000000008'::uuid,
   '11111111-3000-0000-0000-000000000001'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid,
   '11111111-2000-0000-0000-000000000001'::uuid,
   '1ZPINERIDGE000008', 'PINERIDGE-UPS-TEST',
   'Ground Commercial', '002',
   3.00, 'LB', 8.00, 6.00, 5.00,
   DATE '2026-04-15', DATE '2026-04-16', DATE '2026-04-17',
   '8750 E PINE RIDGE DR', 'BOISE', 'ID', '83716', 'US',
   '8750 E PINE RIDGE DR, BOISE, ID, 83716, US',
   '808 HIGHWAY 12', 'SPOKANE', 'WA', '99201', 'US',
   8.75, 0.88, 0.00, 0.00, 0.00, 0.00, 0.00,
   9.63,
   'SHIP_FROM_ADDRESS', 'AUTO_MATCHED',
   '11111111-1000-0000-0000-000000000001'::uuid,
   'flat', 1.500000, 'carrier_account', FALSE,
   11.13, 11.13, 'APPROVED', FALSE,
   '11111111-4000-0000-0000-000000000001'::uuid),

  -- Row 9: Ground Commercial, zone 8, 15 lb
  ('11111111-5000-0000-0000-000000000009'::uuid,
   '11111111-3000-0000-0000-000000000001'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid,
   '11111111-2000-0000-0000-000000000001'::uuid,
   '1ZPINERIDGE000009', 'PINERIDGE-UPS-TEST',
   'Ground Commercial', '008',
   15.00, 'LB', 18.00, 14.00, 10.00,
   DATE '2026-04-16', DATE '2026-04-17', DATE '2026-04-17',
   '8750 E PINE RIDGE DR', 'BOISE', 'ID', '83716', 'US',
   '8750 E PINE RIDGE DR, BOISE, ID, 83716, US',
   '42 INDUSTRIAL BLVD', 'MIAMI', 'FL', '33101', 'US',
   22.80, 2.28, 0.00, 0.00, 0.00, 0.00, 0.00,
   25.08,
   'SHIP_FROM_ADDRESS', 'AUTO_MATCHED',
   '11111111-1000-0000-0000-000000000001'::uuid,
   'flat', 1.500000, 'carrier_account', FALSE,
   26.58, 26.58, 'APPROVED', FALSE,
   '11111111-4000-0000-0000-000000000001'::uuid),

  -- Row 10: Ground Residential, zone 4, 6 lb (resi)
  ('11111111-5000-0000-0000-000000000010'::uuid,
   '11111111-3000-0000-0000-000000000001'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid,
   '11111111-2000-0000-0000-000000000001'::uuid,
   '1ZPINERIDGE000010', 'PINERIDGE-UPS-TEST',
   'Ground Residential', '004',
   6.00, 'LB', 12.00, 10.00, 8.00,
   DATE '2026-04-16', DATE '2026-04-17', DATE '2026-04-17',
   '8750 E PINE RIDGE DR', 'BOISE', 'ID', '83716', 'US',
   '8750 E PINE RIDGE DR, BOISE, ID, 83716, US',
   '1100 SUNSET AVE', 'PORTLAND', 'OR', '97201', 'US',
   13.90, 1.39, 4.95, 0.00, 0.00, 0.00, 0.00,
   20.24,
   'SHIP_FROM_ADDRESS', 'AUTO_MATCHED',
   '11111111-1000-0000-0000-000000000001'::uuid,
   'flat', 1.500000, 'carrier_account', FALSE,
   21.74, 21.74, 'APPROVED', FALSE,
   '11111111-4000-0000-0000-000000000001'::uuid),

  -- Row 11: 2nd Day Air, zone 5, 4 lb
  ('11111111-5000-0000-0000-000000000011'::uuid,
   '11111111-3000-0000-0000-000000000001'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid,
   '11111111-2000-0000-0000-000000000001'::uuid,
   '1ZPINERIDGE000011', 'PINERIDGE-UPS-TEST',
   '2nd Day Air', '005',
   4.00, 'LB', 10.00, 8.00, 6.00,
   DATE '2026-04-16', DATE '2026-04-17', DATE '2026-04-17',
   '8750 E PINE RIDGE DR', 'BOISE', 'ID', '83716', 'US',
   '8750 E PINE RIDGE DR, BOISE, ID, 83716, US',
   '200 DOWNTOWN LOOP', 'CHICAGO', 'IL', '60601', 'US',
   25.40, 2.54, 0.00, 0.00, 0.00, 0.00, 0.00,
   27.94,
   'SHIP_FROM_ADDRESS', 'AUTO_MATCHED',
   '11111111-1000-0000-0000-000000000001'::uuid,
   'flat', 1.500000, 'carrier_account', FALSE,
   29.44, 29.44, 'APPROVED', FALSE,
   '11111111-4000-0000-0000-000000000001'::uuid),

  -- Row 12: Ground Commercial, zone 7, 20 lb (additional handling other_surcharges)
  ('11111111-5000-0000-0000-000000000012'::uuid,
   '11111111-3000-0000-0000-000000000001'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid,
   '11111111-2000-0000-0000-000000000001'::uuid,
   '1ZPINERIDGE000012', 'PINERIDGE-UPS-TEST',
   'Ground Commercial', '007',
   20.00, 'LB', 24.00, 18.00, 14.00,
   DATE '2026-04-16', DATE '2026-04-17', DATE '2026-04-17',
   '8750 E PINE RIDGE DR', 'BOISE', 'ID', '83716', 'US',
   '8750 E PINE RIDGE DR, BOISE, ID, 83716, US',
   '15 WAREHOUSE RD', 'ATLANTA', 'GA', '30301', 'US',
   28.60, 2.86, 0.00, 0.00, 8.50, 0.00, 0.00,
   39.96,
   'SHIP_FROM_ADDRESS', 'AUTO_MATCHED',
   '11111111-1000-0000-0000-000000000001'::uuid,
   'flat', 1.500000, 'carrier_account', FALSE,
   41.46, 41.46, 'APPROVED', FALSE,
   '11111111-4000-0000-0000-000000000001'::uuid),

  -- Row 13: Ground Residential, zone 3, 2 lb (resi)
  ('11111111-5000-0000-0000-000000000013'::uuid,
   '11111111-3000-0000-0000-000000000001'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid,
   '11111111-2000-0000-0000-000000000001'::uuid,
   '1ZPINERIDGE000013', 'PINERIDGE-UPS-TEST',
   'Ground Residential', '003',
   2.00, 'LB', 8.00, 6.00, 4.00,
   DATE '2026-04-17', DATE '2026-04-17', DATE '2026-04-17',
   '8750 E PINE RIDGE DR', 'BOISE', 'ID', '83716', 'US',
   '8750 E PINE RIDGE DR, BOISE, ID, 83716, US',
   '900 OAKBROOK CIR', 'MINNEAPOLIS', 'MN', '55401', 'US',
   11.20, 1.12, 4.95, 0.00, 0.00, 0.00, 0.00,
   17.27,
   'SHIP_FROM_ADDRESS', 'AUTO_MATCHED',
   '11111111-1000-0000-0000-000000000001'::uuid,
   'flat', 1.500000, 'carrier_account', FALSE,
   18.77, 18.77, 'APPROVED', FALSE,
   '11111111-4000-0000-0000-000000000001'::uuid),

  -- Row 14: Adjustment-only line (APV correction from prior billing cycle)
  ('11111111-5000-0000-0000-000000000014'::uuid,
   '11111111-3000-0000-0000-000000000001'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid,
   '11111111-2000-0000-0000-000000000001'::uuid,
   '1ZPINERIDGE000014', 'PINERIDGE-UPS-TEST',
   'Ground Commercial', '005',
   5.00, 'LB', NULL, NULL, NULL,
   DATE '2026-04-17', NULL, DATE '2026-04-17',
   '8750 E PINE RIDGE DR', 'BOISE', 'ID', '83716', 'US',
   '8750 E PINE RIDGE DR, BOISE, ID, 83716, US',
   '77 ADJUSTMENT LN', 'DENVER', 'CO', '80202', 'US',
   0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 3.50,
   3.50,
   'SHIP_FROM_ADDRESS', 'AUTO_MATCHED',
   '11111111-1000-0000-0000-000000000001'::uuid,
   'flat', 1.500000, 'carrier_account', TRUE,
   -- DN-2 (resolved 2026-04-20): flat fee NOT applied to adjustment-only
   -- lines. pre_ceiling_amount and final_billed_rate equal carrier_charge
   -- ($3.50). markup_value_applied still documents the configured fee.
   3.50, 3.50, 'APPROVED', FALSE,
   '11111111-4000-0000-0000-000000000001'::uuid),

  -- Row 15: Ground Commercial, zone 6, 12 lb (address correction in other_surcharges)
  ('11111111-5000-0000-0000-000000000015'::uuid,
   '11111111-3000-0000-0000-000000000001'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid,
   '11111111-2000-0000-0000-000000000001'::uuid,
   '1ZPINERIDGE000015', 'PINERIDGE-UPS-TEST',
   'Ground Commercial', '006',
   12.00, 'LB', 18.00, 14.00, 10.00,
   DATE '2026-04-17', DATE '2026-04-17', DATE '2026-04-17',
   '8750 E PINE RIDGE DR', 'BOISE', 'ID', '83716', 'US',
   '8750 E PINE RIDGE DR, BOISE, ID, 83716, US',
   '1450 RIVER RD', 'NASHVILLE', 'TN', '37201', 'US',
   19.50, 1.95, 0.00, 0.00, 0.00, 14.00, 0.00,
   35.45,
   'SHIP_FROM_ADDRESS', 'AUTO_MATCHED',
   '11111111-1000-0000-0000-000000000001'::uuid,
   'flat', 1.500000, 'carrier_account', FALSE,
   36.95, 36.95, 'APPROVED', FALSE,
   '11111111-4000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------------------------
-- 7. cactus_invoice_line_items junction (one per line item)
-- --------------------------------------------------------------------------
INSERT INTO cactus_invoice_line_items
  (cactus_invoice_id, invoice_line_item_id, org_id, final_billed_rate)
VALUES
  ('11111111-4000-0000-0000-000000000001'::uuid,
   '11111111-5000-0000-0000-000000000001'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid, 15.25),
  ('11111111-4000-0000-0000-000000000001'::uuid,
   '11111111-5000-0000-0000-000000000002'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid, 23.83),
  ('11111111-4000-0000-0000-000000000001'::uuid,
   '11111111-5000-0000-0000-000000000003'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid, 26.14),
  ('11111111-4000-0000-0000-000000000001'::uuid,
   '11111111-5000-0000-0000-000000000004'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid, 11.62),
  ('11111111-4000-0000-0000-000000000001'::uuid,
   '11111111-5000-0000-0000-000000000005'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid, 30.30),
  ('11111111-4000-0000-0000-000000000001'::uuid,
   '11111111-5000-0000-0000-000000000006'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid, 19.54),
  ('11111111-4000-0000-0000-000000000001'::uuid,
   '11111111-5000-0000-0000-000000000007'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid, 38.02),
  ('11111111-4000-0000-0000-000000000001'::uuid,
   '11111111-5000-0000-0000-000000000008'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid, 11.13),
  ('11111111-4000-0000-0000-000000000001'::uuid,
   '11111111-5000-0000-0000-000000000009'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid, 26.58),
  ('11111111-4000-0000-0000-000000000001'::uuid,
   '11111111-5000-0000-0000-000000000010'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid, 21.74),
  ('11111111-4000-0000-0000-000000000001'::uuid,
   '11111111-5000-0000-0000-000000000011'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid, 29.44),
  ('11111111-4000-0000-0000-000000000001'::uuid,
   '11111111-5000-0000-0000-000000000012'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid, 41.46),
  ('11111111-4000-0000-0000-000000000001'::uuid,
   '11111111-5000-0000-0000-000000000013'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid, 18.77),
  ('11111111-4000-0000-0000-000000000001'::uuid,
   '11111111-5000-0000-0000-000000000014'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid, 3.50),  -- DN-2: was 5.00
  ('11111111-4000-0000-0000-000000000001'::uuid,
   '11111111-5000-0000-0000-000000000015'::uuid,
   '11111111-0000-0000-0000-000000000001'::uuid, 36.95)
ON CONFLICT (cactus_invoice_id, invoice_line_item_id) DO NOTHING;

COMMIT;

-- Verification
--
--   SELECT COUNT(*) FROM invoice_line_items
--   WHERE carrier_invoice_id = '11111111-3000-0000-0000-000000000001';
--   -- Expected: 15
--
--   SELECT ROUND(SUM(final_billed_rate), 2) AS total_billed
--   FROM invoice_line_items
--   WHERE carrier_invoice_id = '11111111-3000-0000-0000-000000000001';
--   -- Expected: 354.27 (DN-2: was 355.77; row 14 dropped $1.50)
--
--   SELECT tracking_number, carrier_charge, final_billed_rate,
--          markup_type_applied, markup_value_applied, is_adjustment_only
--   FROM invoice_line_items
--   WHERE carrier_invoice_id = '11111111-3000-0000-0000-000000000001'
--   ORDER BY tracking_number;
--   -- Every row should have markup_type_applied = 'flat' and
--   -- markup_value_applied = 1.500000. Row 14 is_adjustment_only = TRUE.
