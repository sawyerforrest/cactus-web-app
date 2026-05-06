# DHL eCom Domestic Zone Matrix XLSX — Parser Specification

**Source files:** 18 files at `/mnt/user-data/uploads/DHL_eCommerce_Zones_Table_<DC>.xlsx` where `<DC>` is one of: ATL, BOS, CAK, CLT, CVG, DEN, DFW, EWR, IAD, IAH, LAX, MCI, MCO, ORD, PHX, SEA, SFO, SLC

**Target table:** `carrier_zone_matrices` (existing, schema-verified)

**Prerequisite migration:** `v1.10.0-022-dhl-ecom-dcs.sql` (creates the DC lookup table)

**Senior Architect inspection date:** 2026-05-05
**Status:** Authoritative for v1 parser implementation

---

## 1. File set semantics — "all 18 at once" upload

Unlike the GOFO Regional file (one consolidated XLSX), DHL publishes **one file per DC** — 18 files total. The Zone Matrices upload UI must accept multiple files in a single upload event:

- **Multi-file picker** with `accept=".xlsx"` and `multiple` attribute
- Operator selects all 18 files at once (Cmd+A in the file picker after navigating to the folder)
- Server-side parser walks all uploaded files
- Validation requires the set to be exactly 18 distinct DCs from the canonical list
- Atomic commit: all 18 land or none do

**Why all-at-once and not per-DC commits:** the schema's `carrier_zone_matrices` truncate-and-replace pattern (per the GOFO Regional precedent) means partial uploads create incomplete coverage. If only 17 DCs are loaded, a 5L analysis with a Charlotte-origin shipment would silently miss CLT zone lookups. Better to require all 18 up front.

**Re-uploads:** later in the year if DHL publishes updated zones, operator re-uploads all 18 again (DHL re-publishes the entire set; partial updates aren't a thing in their workflow).

---

## 2. File-level structure (consistent across all 18 files)

Verified across all 18 files — same shape, same headers:

- **Single sheet** named `'ZONES'`
- **Row 1:** title `'DHL eCommerce Zone'` (cell A1)
- **Row 2:** `'Origin Terminal: <DC>'` (e.g., `'Origin Terminal: ATL'`)
- **Row 3:** column headers — exactly: `'ORIGIN'`, `'ORIGIN_ZIP3'`, `'DEST_ZIP3'`, `'ZONE'`, `'UPDATED'`
- **Rows 4-933:** 930 data rows
- **No merged cells, no rich text, no hidden columns**

**Parser instruction:** read with `header=2` (third row is the header), skip the title rows above.

---

## 3. Column conventions

### `ORIGIN` column
- Format: `US<DC>1` (e.g., `'USATL1'`, `'USCLT1'`)
- Always exactly one distinct value per file
- Used to identify which DC the file represents
- Cross-reference against `dhl_ecom_dcs.origin_code` to resolve `dc_code`

### `ORIGIN_ZIP3` column
- 3-digit string, zero-padded
- Always exactly one distinct value per file (the DC's ZIP3)
- Will match `dhl_ecom_dcs.dc_zip3` for the resolved DC

### `DEST_ZIP3` column
- 3-digit string, zero-padded
- 930 distinct values per file
- Same 930-ZIP3 set across all 18 files (verified)
- Range: `'005'` through `'999'`, with gaps for unpopulated ZIP3 prefixes
- **Read as string with `dtype=str`** to preserve leading zeros (Excel may auto-coerce to int)

### `ZONE` column
- Integer in source file; stored as TEXT in `carrier_zone_matrices.zone` column
- **Valid values: 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13** (note: gaps at 9 and 10)
- Zone semantics:
  - 1-8: standard contiguous-US distance zones
  - 11: Puerto Rico (DEST_ZIP3 in 006-009)
  - 12: Military APO/FPO (DEST_ZIP3 in 090-098)
  - 13: Alaska (DEST_ZIP3 in 995-999)
- Convert integer to TEXT on insert (e.g., `'5'`, `'11'`)

### `UPDATED` column
- Date string like `'22-MARCH-2026'`
- All rows in a file share the same UPDATED date
- Use this as the source-of-truth `effective_date` (parsed to ISO format `YYYY-MM-DD`)
- If different files in the upload have different UPDATED dates: warn but don't block (DHL may publish DC-by-DC); use the most recent date for the upload's effective_date

---

## 4. Output row derivation

For each row in each of the 18 files, write **one row** to `carrier_zone_matrices`:

```
carrier_code     = 'DHL_ECOM'
service_level    = 'Ground'             -- (DHL eCommerce Ground; see note below)
matrix_version   = effective_date string -- e.g., '2026-03-22'
origin_zip3      = <ORIGIN_ZIP3 from row>
dest_zip3        = <DEST_ZIP3 from row>
zone             = <ZONE as text>
effective_date   = <parsed UPDATED date>
deprecated_date  = NULL
source           = 'DHL eCommerce Zones Table XLSX (per DC)'
notes            = 'DC: ' || <dc_code>  -- e.g., 'DC: CLT'
```

**Total expected output: 16,740 rows** (18 DCs × 930 dest ZIP3s).

### Note on `service_level`

The DHL DC zone files don't specify a service level — the same zone matrix applies to all DHL eCommerce Ground products (Ground, Expedited, MAX). For v1, **populate `service_level = 'Ground'`** as a representative value. The rate cards (next sub-phase 2b screen) will distinguish service levels per cell. If you'd rather track separate matrix rows per service level, that's a schema design decision worth raising — for now, one matrix row per (DC, dest ZIP3) is sufficient.

If concerns surface later, this can be revised by adding additional service_level rows in a follow-on migration.

---

## 5. Validation rules

### Hard errors (block upload)
- File set is not exactly 18 files
- Any uploaded filename doesn't match the pattern `DHL_eCommerce_Zones_Table_<DC>.xlsx`
- Any DC code from the filename is not in the canonical 18-DC set (cross-reference `dhl_ecom_dcs`)
- Duplicate DC in the upload set (e.g., two ATL files)
- Missing DC from the upload set (only 17 distinct DCs found)
- Any file's `ORIGIN` doesn't match the expected `US<DC>1` for its filename DC
- Any file's `ORIGIN_ZIP3` doesn't match the expected DC ZIP3 from `dhl_ecom_dcs`
- Any file has != 930 data rows
- Any DEST_ZIP3 outside the 005-999 range or not 3 digits
- Any ZONE value not in {1,2,3,4,5,6,7,8,11,12,13}
- Any header row mismatch

### Warnings (allow upload, surface in preview)
- Files have different `UPDATED` dates (use most recent for effective_date, but flag the disparity)
- Total ZIPs covered per DC differs from prior active set by >5%

### Preview summary stats to display
```
Files uploaded:     18 / 18 expected (✓ ATL, BOS, CAK, CLT, CVG, DEN, DFW, EWR, IAD, IAH, LAX, MCI, MCO, ORD, PHX, SEA, SFO, SLC)
Total rows:         16,740
Distinct dest ZIP3: 930
Zone distribution:  Z1 (X), Z2 (Y), Z3 (Z) ... Z11 (4 PR), Z12 (19 Military), Z13 (5 AK)
Effective date:     2026-03-22 (from UPDATED column; all files agree)
[ first 10 rows table preview ]
[ warnings, if any ]
[ Commit (16,740 zone matrix rows) ]   [ Upload different files ]
```

---

## 6. Sample data for unit testing

### Source file: `DHL_eCommerce_Zones_Table_ATL.xlsx`, rows 4-8

```
ORIGIN  ORIGIN_ZIP3  DEST_ZIP3  ZONE  UPDATED
USATL1  302          005        5     22-MARCH-2026
USATL1  302          006        11    22-MARCH-2026
USATL1  302          007        11    22-MARCH-2026
USATL1  302          008        11    22-MARCH-2026
USATL1  302          009        11    22-MARCH-2026
```

### Expected `carrier_zone_matrices` output (5 rows from ATL)

```
('DHL_ECOM', 'Ground', '2026-03-22', '302', '005', '5',  '2026-03-22', NULL, 'DHL eCommerce Zones Table XLSX (per DC)', 'DC: ATL')
('DHL_ECOM', 'Ground', '2026-03-22', '302', '006', '11', '2026-03-22', NULL, 'DHL eCommerce Zones Table XLSX (per DC)', 'DC: ATL')
('DHL_ECOM', 'Ground', '2026-03-22', '302', '007', '11', '2026-03-22', NULL, 'DHL eCommerce Zones Table XLSX (per DC)', 'DC: ATL')
('DHL_ECOM', 'Ground', '2026-03-22', '302', '008', '11', '2026-03-22', NULL, 'DHL eCommerce Zones Table XLSX (per DC)', 'DC: ATL')
('DHL_ECOM', 'Ground', '2026-03-22', '302', '009', '11', '2026-03-22', NULL, 'DHL eCommerce Zones Table XLSX (per DC)', 'DC: ATL')
```

For the full upload, expect this pattern × 930 rows × 18 DCs = 16,740 rows.

---

## 7. Atomic commit semantics

After preview confirmation, the commit Server Action runs:

```sql
BEGIN;

-- Wipe prior active set for DHL eCommerce Domestic
DELETE FROM carrier_zone_matrices 
  WHERE carrier_code = 'DHL_ECOM' AND service_level = 'Ground';

-- Bulk INSERT all 16,740 new rows
INSERT INTO carrier_zone_matrices (carrier_code, service_level, matrix_version, 
  origin_zip3, dest_zip3, zone, effective_date, deprecated_date, source, notes) 
VALUES (... 16,740 rows ...);

COMMIT;
```

**Important:** unlike GOFO Regional Coverage (which truncates two whole tables), this commit deletes only **DHL eCom Ground rows** from `carrier_zone_matrices` — leaving any other carriers' zone data untouched. Future uploads (GOFO Standard, etc.) will use the same WHERE-clause-scoped delete pattern.

The 16,740-row INSERT is moderate. Use the same chunked-batch pattern (1,000-row chunks) inside the same transaction as GOFO Regional Coverage's commit.

If any INSERT fails mid-stream, ROLLBACK fires and the prior active set is restored. No partial-state risk.

---

## 8. UI flow (mirrors GOFO Regional Coverage screen)

Same architectural pattern:

1. **Multi-file picker** + effective_date inferred from UPDATED column (no manual picker — auto-resolved from data, but show in preview)
2. **Upload all 18 files** → server uploads each to `pld-uploads/zone-matrices/<uuid>.xlsx` (one path per file, 18 stage files total)
3. **Preview Server Action** parses all 18, validates the set, returns summary + first-10-row preview + warnings + array of stagePaths
4. **Commit Server Action** reads all 18 files back from Storage, re-parses, validates re-parse matches preview, writes atomically, deletes all 18 stage files on success
5. **SubmitButton pending state** for both Upload and Commit (per the recent rollout)

### Stage path naming convention

For multi-file uploads: namespace by upload event UUID, then per-DC filename:

```
pld-uploads/zone-matrices/<upload_uuid>/<dc_code>.xlsx
```

E.g., `pld-uploads/zone-matrices/abc-123-uuid/ATL.xlsx`. This makes cleanup straightforward (delete the whole folder on commit success or on cron sweep).

---

## 9. Things this spec does NOT cover

- **GOFO Standard zone matrix** — pending Sawyer's GOFO rep response. Will be added to the same screen later, with its own parser logic, when source file (or confirmation that GOFO Regional zones can be reused) arrives.
- **DHL DAS ZIP list** — 22,264 ZIP5s where DHL applies a delivery area surcharge. Different concept (flag list, not zone matrix). Belongs on its own small screen later, mirroring `gofo_remote_zip3s` UX. Out of scope for this Zone Matrices screen.
- **Other DHL service levels** (Expedited, MAX, etc.) — for v1, all DHL Ground domestic traffic shares one zone matrix. If DHL ever publishes service-level-specific matrices, that's a v1.5 addition.

---

End of spec.
