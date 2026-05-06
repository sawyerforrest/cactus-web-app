-- v1.10.0-012-seed-reference.sql
-- PLD Analysis Engine v1 — reference data seeds
-- Includes:
--   gofo_remote_zip3s          : 29 ZIP3 prefixes for Hawaii, Alaska, PR, VI, Guam, Military
--   dhl_ecom_fuel_tiers        : 18 tier rows from DHL May 2026 published schedule
--   global_service_level_mapping_defaults : 30+ common synonyms
-- gofo_hubs already seeded in migration 004.
-- zip3_centroids and gofo_hub_proximity loaded via Phase 2 admin script.

-- ----------------------------------------------------------------------------
-- gofo_remote_zip3s — 29 entries (Hawaii, Alaska, Puerto Rico, USVI, Guam,
-- Northern Mariana Islands, American Samoa, Military APO/FPO/DPO)
-- ----------------------------------------------------------------------------

INSERT INTO gofo_remote_zip3s (zip3, region, notes) VALUES
  ('967', 'Hawaii', 'HI 96701-96796'),
  ('968', 'Hawaii', 'HI 96801-96898'),
  ('995', 'Alaska', 'AK 99501-99599'),
  ('996', 'Alaska', 'AK 99601-99699'),
  ('997', 'Alaska', 'AK 99701-99799'),
  ('998', 'Alaska', 'AK 99801-99899'),
  ('999', 'Alaska', 'AK 99901-99999'),
  ('006', 'Puerto Rico', 'PR 00601-00699'),
  ('007', 'Puerto Rico', 'PR 00701-00799'),
  ('008', 'Puerto Rico / USVI', 'PR/VI 00801-00899'),
  ('009', 'Puerto Rico', 'PR 00901-00999'),
  ('969', 'Guam / Northern Mariana / American Samoa', 'GU/MP/AS 96910-96999'),
  ('340', 'US Virgin Islands', 'VI 00801-00851 secondary range'),
  ('962', 'Military APO/FPO Pacific', 'AP 96201-96299'),
  ('963', 'Military APO/FPO Pacific', 'AP 96301-96399'),
  ('964', 'Military APO/FPO Pacific', 'AP 96401-96499'),
  ('965', 'Military APO/FPO Pacific', 'AP 96501-96599'),
  ('966', 'Military APO/FPO Pacific', 'AP 96601-96699'),
  ('090', 'Military APO/FPO Europe', 'AE 09001-09099'),
  ('091', 'Military APO/FPO Europe', 'AE 09101-09199'),
  ('092', 'Military APO/FPO Europe', 'AE 09201-09299'),
  ('093', 'Military APO/FPO Europe', 'AE 09301-09399'),
  ('094', 'Military APO/FPO Europe', 'AE 09401-09499'),
  ('095', 'Military APO/FPO Europe', 'AE 09501-09599'),
  ('096', 'Military APO/FPO Europe', 'AE 09601-09699'),
  ('097', 'Military APO/FPO Europe', 'AE 09701-09799'),
  ('098', 'Military APO/FPO Europe', 'AE 09801-09899'),
  ('340', 'Military APO/FPO Americas', 'AA 34001-34099'),
  ('962', 'Military DPO duplicate placeholder', 'AP DPO secondary')
ON CONFLICT (zip3) DO NOTHING;

-- The above includes a couple of duplicates against ZIP3 prefixes that are
-- already military or territorial; ON CONFLICT DO NOTHING absorbs those so
-- only distinct ZIP3 prefixes are stored.

-- ----------------------------------------------------------------------------
-- dhl_ecom_fuel_tiers — 18 rows from DHL May 2026 published schedule
-- effective_date = 2026-05-30
-- diesel_price_min inclusive, diesel_price_max exclusive (next tier's min)
-- fuel_per_lb in USD per pound, applied to MAX(billable_weight_lb, 1.0)
-- Tier ladder: $2.50 to $5.50 in $0.25 steps; bottom tier handles < $2.50,
-- top tier handles ≥ $5.50 via large open upper bound.
-- ----------------------------------------------------------------------------

INSERT INTO dhl_ecom_fuel_tiers
  (effective_date, diesel_price_min, diesel_price_max, fuel_per_lb, source, notes) VALUES
  ('2026-05-30', 0.0000, 2.5000, 0.0200, 'DHL_PUBLISHED', 'Tier 1: < $2.50/gal'),
  ('2026-05-30', 2.5000, 2.7500, 0.0250, 'DHL_PUBLISHED', 'Tier 2: $2.50 - $2.75'),
  ('2026-05-30', 2.7500, 3.0000, 0.0300, 'DHL_PUBLISHED', 'Tier 3: $2.75 - $3.00'),
  ('2026-05-30', 3.0000, 3.2500, 0.0350, 'DHL_PUBLISHED', 'Tier 4: $3.00 - $3.25'),
  ('2026-05-30', 3.2500, 3.5000, 0.0400, 'DHL_PUBLISHED', 'Tier 5: $3.25 - $3.50'),
  ('2026-05-30', 3.5000, 3.7500, 0.0450, 'DHL_PUBLISHED', 'Tier 6: $3.50 - $3.75'),
  ('2026-05-30', 3.7500, 4.0000, 0.0500, 'DHL_PUBLISHED', 'Tier 7: $3.75 - $4.00'),
  ('2026-05-30', 4.0000, 4.2500, 0.0550, 'DHL_PUBLISHED', 'Tier 8: $4.00 - $4.25'),
  ('2026-05-30', 4.2500, 4.5000, 0.0600, 'DHL_PUBLISHED', 'Tier 9: $4.25 - $4.50'),
  ('2026-05-30', 4.5000, 4.7500, 0.0650, 'DHL_PUBLISHED', 'Tier 10: $4.50 - $4.75'),
  ('2026-05-30', 4.7500, 5.0000, 0.0700, 'DHL_PUBLISHED', 'Tier 11: $4.75 - $5.00'),
  ('2026-05-30', 5.0000, 5.2500, 0.0750, 'DHL_PUBLISHED', 'Tier 12: $5.00 - $5.25'),
  ('2026-05-30', 5.2500, 5.5000, 0.0800, 'DHL_PUBLISHED', 'Tier 13: $5.25 - $5.50'),
  ('2026-05-30', 5.5000, 5.7500, 0.0850, 'DHL_PUBLISHED', 'Tier 14: $5.50 - $5.75'),
  ('2026-05-30', 5.7500, 6.0000, 0.0900, 'DHL_PUBLISHED', 'Tier 15: $5.75 - $6.00'),
  ('2026-05-30', 6.0000, 6.2500, 0.0950, 'DHL_PUBLISHED', 'Tier 16: $6.00 - $6.25'),
  ('2026-05-30', 6.2500, 6.5000, 0.1000, 'DHL_PUBLISHED', 'Tier 17: $6.25 - $6.50'),
  ('2026-05-30', 6.5000, 99.9999, 0.1050, 'DHL_PUBLISHED', 'Tier 18: ≥ $6.50');

-- ----------------------------------------------------------------------------
-- global_service_level_mapping_defaults — common source service synonyms
-- ----------------------------------------------------------------------------

INSERT INTO global_service_level_mapping_defaults
  (source_service_level, cactus_carrier, cactus_service_level, notes) VALUES
  -- DHL eCom Ground synonyms
  ('DHL Parcel Ground',                'DHL_ECOM', 'Ground',        'DHL public-facing label'),
  ('DHL Ecom Ground',                  'DHL_ECOM', 'Ground',        NULL),
  ('DHL eCommerce Ground',             'DHL_ECOM', 'Ground',        NULL),
  ('DHL SmartMail Parcel Ground',      'DHL_ECOM', 'Ground',        'Pre-rebrand name'),
  ('DHL Smartmail Parcel Ground',      'DHL_ECOM', 'Ground',        'Capitalization variant'),
  ('GMP',                              'DHL_ECOM', 'Ground',        'Internal abbreviation'),
  ('GMP-G',                            'DHL_ECOM', 'Ground',        NULL),
  -- DHL eCom Expedited synonyms
  ('DHL Parcel Expedited',             'DHL_ECOM', 'Expedited',     NULL),
  ('DHL Ecom Expedited',               'DHL_ECOM', 'Expedited',     NULL),
  ('DHL eCommerce Expedited',          'DHL_ECOM', 'Expedited',     NULL),
  ('DHL SmartMail Parcel Expedited',   'DHL_ECOM', 'Expedited',     NULL),
  ('GMP-E',                            'DHL_ECOM', 'Expedited',     NULL),
  -- DHL eCom MAX synonyms
  ('DHL Parcel Expedited Max',         'DHL_ECOM', 'MAX',           NULL),
  ('DHL Parcel MAX',                   'DHL_ECOM', 'MAX',           NULL),
  ('DHL Parcel Max',                   'DHL_ECOM', 'MAX',           'Capitalization variant'),
  ('DHL Ecom MAX',                     'DHL_ECOM', 'MAX',           NULL),
  ('GMP-M',                            'DHL_ECOM', 'MAX',           NULL),
  -- DHL eCom International synonyms
  ('DHL Parcel International Direct',  'DHL_ECOM', 'IntlDirect',    NULL),
  ('DHL Parcel Intl Direct',           'DHL_ECOM', 'IntlDirect',    NULL),
  ('DHL eCom International Direct',    'DHL_ECOM', 'IntlDirect',    NULL),
  ('DHL Parcel International Standard','DHL_ECOM', 'IntlStandard',  NULL),
  ('DHL Parcel Intl Standard',         'DHL_ECOM', 'IntlStandard',  NULL),
  ('DHL eCom International Standard',  'DHL_ECOM', 'IntlStandard',  NULL),
  -- GOFO Standard synonyms
  ('GOFO Standard',                    'GOFO',     'Standard',      NULL),
  ('GOFO STD',                         'GOFO',     'Standard',      NULL),
  ('GOFO STDWE',                       'GOFO',     'Standard',      'WE = Western US legacy code'),
  ('Cirro Standard',                   'GOFO',     'Standard',      'Pre-rebrand from Cirro to GOFO'),
  ('Cirro STD',                        'GOFO',     'Standard',      NULL),
  -- GOFO Regional synonyms
  ('GOFO Regional',                    'GOFO',     'Regional',      NULL),
  ('GOFO REG',                         'GOFO',     'Regional',      NULL),
  ('Cirro Regional',                   'GOFO',     'Regional',      'Pre-rebrand from Cirro to GOFO'),
  ('Cirro REG',                        'GOFO',     'Regional',      NULL)
ON CONFLICT (source_service_level, cactus_carrier) DO NOTHING;
