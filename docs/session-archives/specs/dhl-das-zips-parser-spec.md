# DHL DAS ZIPs — Screen + Parser Specification

**Source file:** `dhl_das_zip_list_2026.xlsx` (single file, single sheet `'2026 DAS ZIPS'`)

**Effective date encoded in source:** `2026-01-18` (per the file's row 2: "Effective 1/18/2026")

**Senior Architect inspection date:** 2026-05-05
**Status:** Authoritative for v1 implementation

---

## 1. What this is and why it's small

The DHL DAS (Delivery Area Surcharge) ZIP list is a **flag list** — a set of ZIP5s where DHL eCommerce applies an additional per-package surcharge. It's not a zone matrix, not a rate card, and not a coverage list. The rating engine consumes it as a binary: "is this destination ZIP5 a DAS ZIP? if yes, add $X surcharge per the rate card."

Conceptually identical to the existing `gofo_remote_zip3s` table — same shape (ZIP-list-as-flag), same operator UX, same admin-only edit pattern. Different data (DHL surcharges, ZIP5-level instead of ZIP3-level, much larger list).

This screen is **deliberately the smallest in sub-phase 2b**. Existing infrastructure carries 90% of it.

---

## 2. Source file structure

- **Single sheet:** `'2026 DAS ZIPS'`
- **Total file size:** ~22,272 cells
- **Title rows:** 0-6 contain title, effective date string, and explanatory paragraphs (skip)
- **Header row:** index 7, single column `'Destination ZIP Codes'`
- **Data rows:** 8 through 22,271 (**22,264 ZIP5 values**)

### Effective date format

The effective date is encoded in row 2 (cell A2) as the literal string `'Effective 1/18/2026'`. Parser must:

1. Read cell A2
2. Extract the date via regex (e.g., `/Effective (\d{1,2})\/(\d{1,2})\/(\d{4})/`)
3. Reformat to ISO `2026-01-18`
4. Use as `effective_date` for all rows

If the cell doesn't match the expected format, hard-error with: `Cannot parse effective date from cell A2 (got "<value>"). Expected format: "Effective M/D/YYYY".`

### ZIP column conventions

- **Column type:** TEXT (5-digit ZIP5, zero-padded)
- **Read with `dtype=str`** to preserve leading zeros
- **Values:** confirmed all 22,264 are exactly 5 digits, no junk rows interleaved
- **No duplicate ZIPs in source** (verified)

---

## 3. New table: `dhl_ecom_das_zips`

A new reference data table mirroring the `gofo_remote_zip3s` shape, with ZIP5 granularity instead of ZIP3.

### Migration `v1.10.0-026-create-dhl-ecom-das-zips.sql`

```sql
CREATE TABLE dhl_ecom_das_zips (
  zip5            CHAR(5)  NOT NULL,
  effective_date  DATE     NOT NULL,
  deprecated_date DATE     NULL,
  source          TEXT     NOT NULL DEFAULT 'DHL eCommerce DAS ZIP List XLSX',
  notes           TEXT     NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (zip5, effective_date)
);

COMMENT ON TABLE dhl_ecom_das_zips IS
  'DHL eCommerce Delivery Area Surcharge ZIP5 list. Reference data sourced '
  'from DHL''s published 2026 DAS ZIP file. Rating engine queries this table '
  'to determine if a destination ZIP5 is subject to the DAS surcharge. '
  'Re-uploads truncate-and-replace the active set in one transaction. '
  'Conceptually mirrors gofo_remote_zip3s but at ZIP5 granularity.';

ALTER TABLE dhl_ecom_das_zips ENABLE ROW LEVEL SECURITY;

CREATE POLICY dhl_ecom_das_zips_authenticated_select ON dhl_ecom_das_zips
  FOR SELECT TO authenticated USING (true);

-- Pattern 6 discipline: explicit GRANTs alongside RLS policy
GRANT SELECT ON dhl_ecom_das_zips TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE 
  ON dhl_ecom_das_zips TO service_role;

CREATE INDEX idx_dhl_ecom_das_zips_zip5 ON dhl_ecom_das_zips(zip5) 
  WHERE deprecated_date IS NULL;
```

### Why ZIP5 not ZIP3

DAS isn't a "whole ZIP3 prefix is remote" concept — it's a "this specific ZIP5 has a surcharge" concept. Looking at the source data (22,264 ZIP5s clustered in specific geographic patches, not whole ZIP3 prefixes), aggregating to ZIP3 would be lossy. Keep at ZIP5.

### Why a partial index

Active-set lookups (`WHERE deprecated_date IS NULL`) will be the hot path from the rating engine. A partial index keeps the index size minimal while still covering the lookup pattern. Standard PostgreSQL pattern for soft-deleted reference data.

---

## 4. Atomic commit semantics

After preview confirmation, the commit Server Action runs:

```sql
BEGIN;

-- Wipe prior active set (truncate-replace pattern, same as GOFO Regional Coverage)
TRUNCATE TABLE dhl_ecom_das_zips;

-- Bulk INSERT all 22,264 new rows
INSERT INTO dhl_ecom_das_zips (zip5, effective_date, source, notes) 
VALUES (... 22,264 rows ...);

COMMIT;
```

22,264 rows is small enough for a single multi-VALUES INSERT (~2 MB of SQL). No chunking needed. PG function `commit_dhl_ecom_das_zips_upload(p_rows jsonb)` handles the atomic write per established pattern.

### Migration `v1.10.0-027-commit-dhl-ecom-das-zips-fn.sql`

Mirror the v1.10.0-023 (DHL Domestic) and v1.10.0-025 (GOFO Standard) commit functions:
- SECURITY DEFINER + pinned `search_path = public`
- Pattern 6 discipline: explicit `GRANT EXECUTE TO authenticated, service_role`
- Returns `(zips_written int)` for verification
- Truncate (not scope-deleted DELETE) since this table holds only DHL DAS ZIPs

---

## 5. UI — small, single-purpose screen

**Route:** `/pld-analysis/reference-data/dhl-das-zips/`

**Page title and breadcrumb:** "PLD Roundup › Reference Data › DHL DAS ZIPs"

### Loaded-state status card

```
22,264 DAS ZIP5s
[clock icon] Active set loaded YYYY-MM-DD HH:MM UTC
Effective 2026-01-18
Source: DHL eCommerce DAS ZIP List XLSX
```

### Empty-state copy

> "No DAS ZIPs loaded yet. The rating engine cannot apply the DHL Delivery Area Surcharge until this list is loaded. Upload the DHL DAS ZIP XLSX below to begin."

### Upload card

Single-file picker (no multi-file). Effective date is **auto-resolved from cell A2 in the source file** — no manual date picker. Show the resolved date in the preview before commit.

### PreviewPanel

Smaller than zone matrices since there's less to render:

```
TOTAL ZIPs    22,264
EFFECTIVE     2026-01-18 (auto-resolved from "Effective 1/18/2026")
SOURCE        DHL eCommerce DAS ZIP List XLSX
[ first 10 ZIPs preview ]
[ warnings, if any ]
[ Commit (22,264 ZIPs) ]   [ Upload different file ]
```

The preview's "first 10 ZIPs" is a simple ascending list — no per-DC breakdown, no zone distribution, no hub checklist. The data shape doesn't have those dimensions.

---

## 6. Validation rules

### Hard errors
- Sheet not named `'2026 DAS ZIPS'`
- Header row at index 7 is not the literal string `'Destination ZIP Codes'`
- Cell A2 doesn't match `/Effective \d{1,2}\/\d{1,2}\/\d{4}/`
- Any data row not exactly 5 digits
- Duplicate ZIPs in source (defensive — current file has none)
- Total ZIPs < 1,000 (sanity guard)
- Total ZIPs > 50,000 (sanity guard)

### Warnings
- Total ZIPs differs from prior active set by >25% (could indicate accidentally-truncated source)
- New ZIPs appearing not in prior active set (informational count)
- ZIPs in prior active set missing from this upload (informational count)

---

## 7. Index page row

Add a new row in the **Reference Data index** under the existing "Coverage and Zone Data" group (or under a new "Surcharge Zones" group if you'd prefer to differentiate it from coverage/zone data):

**Loaded state:**
```
DHL DAS ZIPs                                   [loaded]
22,264 ZIP5s · Effective 2026-01-18
Reference list. DAS surcharge fires when 
destination ZIP5 is in this list.              [Replace upload →]
```

**Empty state:**
```
DHL DAS ZIPs                                   [not loaded]
DAS surcharge cannot fire until the list 
is loaded. Upload the DHL DAS ZIP XLSX.        [Upload XLSX →]
```

Recommendation on grouping: keep it under "Coverage and Zone Data" for now (avoids creating a new group with only one item). When future surcharge zones land (USPS DAS, FedEx DAS, etc.), promote to a "Surcharge Zones" group with a renamed group header.

---

## 8. Things this spec does NOT cover

- **Surcharge dollar amounts.** This spec only handles the ZIP list — the "is this ZIP a DAS ZIP" boolean. The actual surcharge amount per package depends on product and weight, and lives in DHL's published Fees & Surcharges document. That's a Rate Cards screen concern (next sub-phase 2b item), not this screen's.
- **Other DHL surcharges** (Extended Area Surcharge, Residential Surcharge, etc.) — handled separately when/if those data sources arrive. The architecture here doesn't preclude adding `dhl_ecom_eas_zips` and similar tables.
- **Browse view** for the loaded ZIPs — same call as GOFO Regional Coverage and Zone Matrices: deferred.

---

## 9. Verification queries (post-commit)

```sql
-- 1. Row count
SELECT count(*) FROM dhl_ecom_das_zips;
-- Expected: 22264

-- 2. Effective date
SELECT DISTINCT effective_date FROM dhl_ecom_das_zips;
-- Expected: single row, '2026-01-18'

-- 3. ZIP length sanity
SELECT length(zip5), count(*) FROM dhl_ecom_das_zips GROUP BY length(zip5);
-- Expected: single row, 5, 22264

-- 4. Spot check known DAS ZIP (from source: 01005 is the first ZIP in the file)
SELECT * FROM dhl_ecom_das_zips WHERE zip5 = '01005';
-- Expected: 1 row, effective_date = '2026-01-18'

-- 5. Other carrier zone tables unchanged
SELECT carrier_code, service_level, count(*) 
FROM carrier_zone_matrices 
GROUP BY carrier_code, service_level;
-- Expected: DHL_ECOM/Ground=16740, GOFO/Standard=7448

-- 6. Production tables unchanged: 953 / 967 / 3
```

---

## 10. Pause point sequence

Lighter than DHL Domestic since this is mostly a re-tread of GOFO Regional Coverage's shape with simpler scope.

1. **Pause #1** (after migrations + empty-state shell render) — quick design review
2. **Pause #2** (after parser written) — no chat needed, spec covers it
3. **Pause #3** (after preview works end-to-end with real file) — chat for verification of the resolved effective_date and 22,264 count
4. **Pause #4** (after full end-to-end commit) — chat for final database verification

---

End of spec.
