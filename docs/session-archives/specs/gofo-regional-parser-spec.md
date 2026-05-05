# GOFO Regional Coverage XLSX — Parser Specification

**Source file:** `gofo_regional_zip_list_2026.xlsx`
**Target tables:** `service_coverage_zips`, `gofo_regional_zone_matrix`
**Senior Architect inspection date:** 2026-05-05
**Status:** Authoritative for v1 parser implementation

---

## 1. File-level structure

- **Workbook contains a single sheet:** `'Zip Code List'` (8,364 rows × 8 cols total)
- **Title rows** occupy rows 1-2 (merged cells `A1:H1` and `B2:H2`). Skip these.
- **Header row is row 3.** Headers: `Zip Code`, `LAX`, `DFW ` (trailing space — strip it), `ORD`, `EWR/JFK`, `ATL`, `MIA`, `SLC`
- **Data rows: 4 through 8364** (8,361 ZIP rows total)
- **No hidden columns.** No rich-text formatting on data cells. Only the title rows have merged cells.

**Parser instruction:** read with `header=2` (0-indexed third row) and strip column whitespace immediately after.

---

## 2. Column conventions

### `Zip Code` column
- **Storage type in the file:** TEXT (string), with Excel display format `'00000'` to preserve leading zeros.
- **Length:** all 8,361 values are exactly 5 digits.
- **No leading-zero stripping needed** if you read the column as `dtype=str`. Important: do NOT let your XLSX library coerce to int — that will silently drop ZIPs starting with "0" (Northeast/PR ranges).

### Hub columns (`LAX`, `DFW`, `ORD`, `EWR/JFK`, `ATL`, `MIA`, `SLC`)
- **Storage type:** mostly integers 1-8 (the zone code).
- **Sentinel value:** the string `'-'` (single hyphen) means "this ZIP is not serviceable from this hub." Found in only 4 cells across the entire file (all in the DFW column for Oregon ZIPs 97321, 97322, 97330, 97331).
- **No empty cells** — every cell has either a zone code or `'-'`.
- **`DFW` column has trailing space** in the header. Strip it during parsing.

### EWR/JFK column — split on parse
- The source uses a single combined `EWR/JFK` column.
- **Mapping rule: each EWR/JFK cell value produces TWO rows in `gofo_regional_zone_matrix`** — one with `injection_point='EWR'` and one with `injection_point='JFK'`, both using the same zone value.
- This reflects the operational reality: GOFO publishes one zone for the NYC metro area regardless of whether the parcel injects at Newark or Queens. After our v1.10.0-019 hub split, we represent these as distinct injection points in the schema, but the source data treats them as one.
- If GOFO ever publishes them separately (separate `EWR` and `JFK` columns), parser detection logic should look at column headers and skip the duplication step. For now: assume `EWR/JFK` exists and always split.

---

## 3. Output row derivation rules

### `service_coverage_zips`

For each ZIP row in the source file, write **one row** to `service_coverage_zips`:

```
carrier_code   = 'GOFO'
service_level  = 'Regional'
zip5           = <ZIP from source>
is_serviceable = true   -- always true for v1 (rule below)
effective_date = <picked by operator on upload screen>
deprecated_date = NULL
source         = 'GOFO Regional ZIP coverage XLSX'
notes          = NULL
```

**Why `is_serviceable=true` for every row:** all 8,361 ZIPs are serviceable from at least one hub (verified — only 4 cells across the whole file have the `'-'` sentinel, never a full row of dashes). So presence in the source file = serviceable. Per-hub serviceability is captured in `gofo_regional_zone_matrix`, not here.

**Total expected rows: 8,361.**

### `gofo_regional_zone_matrix`

For each ZIP × hub combination where the cell value is NOT `'-'`, write **one row** to `gofo_regional_zone_matrix`:

```
matrix_version   = 'v1.10.0-bootstrap-' || <effective_date>   -- or any deterministic string
injection_point  = <hub code, see mapping below>
dest_zip5        = <ZIP from source>
zone             = <cell value as text, e.g., '1', '2', ... '8'>
effective_date   = <picked by operator on upload screen>
deprecated_date  = NULL
source           = 'GOFO Regional zone matrix XLSX'
notes            = NULL
```

**Hub column → injection_point mapping:**

| Source column | injection_point enum value(s) | Note |
|---|---|---|
| `LAX` | `'LAX'` | 1:1 |
| `DFW` | `'DFW'` | 1:1, may have `'-'` sentinel cells (skip) |
| `ORD` | `'ORD'` | 1:1 |
| `EWR/JFK` | `'EWR'` AND `'JFK'` | duplicate each cell into two rows |
| `ATL` | `'ATL'` | 1:1 |
| `MIA` | `'MIA'` | 1:1 |
| `SLC` | `'SLC'` | 1:1 |

**Total expected rows after EWR/JFK split: 66,884**

Calculation:
- 7 hub columns × 8,361 ZIPs = 58,527 source cells
- 4 cells are `'-'` (skip) → 58,523 serviceable cells
- EWR/JFK column (8,361 cells, no dashes) duplicates → +8,361
- Total: 58,523 + 8,361 = **66,884 rows**

---

## 4. Effective_date — operator picks on upload

The source file has no effective_date encoded anywhere (filename only says "2026"). Add a date picker to the upload form before the file picker:

- **Default value:** `2026-04-28` (matches the GOFO Standard rate card filenames `4_28_PU` / `4_28_drop_off`, suggesting the Q2 2026 publication date)
- **Required:** yes, blocks upload if empty
- **Validation:** must be a valid date, no year > current+5 sanity cap

Both target tables get the same `effective_date` value from the picker.

`matrix_version` is a deterministic string derived from effective_date — suggested format: `'2026-04-28'` (matches effective_date string). This lets future re-uploads with new dates create a new version row distinct from the prior version.

---

## 5. Validation rules (parser warnings vs hard errors)

### Hard errors (block upload, show error in preview, no DB write)
- ZIP not 5 digits after string normalization
- ZIP contains non-digit characters (after stripping whitespace)
- Zone cell value is not in the set `{1, 2, 3, 4, 5, 6, 7, 8, '-'}` (numbers or single sentinel)
- Duplicate ZIP rows in source (defensive — current file has none)
- Required header row not found at row 3
- `EWR/JFK` column missing (parser depends on it for the split)
- Total source rows < 1,000 (sanity guard against accidentally uploading wrong file)
- Total source rows > 50,000 (sanity guard against zip bombs / wrong file types)

### Warnings (allow upload, show in preview, operator confirms)
- Total ZIP count differs from current active set by >25% (could indicate accidentally truncated source)
- New ZIPs appearing that weren't in the prior active set (informational — list count, not each ZIP)
- ZIPs in prior active set missing from this upload (informational — list count, not each ZIP)
- Any ZIP serviceable from < 3 hubs (informational — operationally unusual but valid)

### Preview summary stats to display
```
Source file:        gofo_regional_zip_list_2026.xlsx
Total ZIP rows:     8,361
Total zone cells:   58,523 serviceable / 4 not-serviceable (DFW only)
After EWR/JFK split: 66,884 zone matrix rows will be written
Effective date:     <from picker>
[ first 10 ZIPs as table preview ]
[ warnings, if any ]
[ "Looks good — Commit" button ] [ "Upload different file" ]
```

---

## 6. Sample data for unit testing

Authoritative parsing of the first 5 source rows yields these target rows:

### Source rows 1-5 (after header strip)
```
Zip Code  LAX  DFW  ORD  EWR/JFK  ATL  MIA  SLC
90008     1    6    7    8        8    8    5
90016     1    6    7    8        8    8    5
90022     1    6    7    8        8    8    5
90023     1    6    7    8        8    8    5
90024     1    6    7    8        8    8    5
```

### Expected `service_coverage_zips` output (5 rows)
```
('GOFO', 'Regional', '90008', true, <eff_date>, NULL, 'GOFO Regional ZIP coverage XLSX', NULL)
('GOFO', 'Regional', '90016', true, <eff_date>, NULL, 'GOFO Regional ZIP coverage XLSX', NULL)
('GOFO', 'Regional', '90022', true, <eff_date>, NULL, 'GOFO Regional ZIP coverage XLSX', NULL)
('GOFO', 'Regional', '90023', true, <eff_date>, NULL, 'GOFO Regional ZIP coverage XLSX', NULL)
('GOFO', 'Regional', '90024', true, <eff_date>, NULL, 'GOFO Regional ZIP coverage XLSX', NULL)
```

### Expected `gofo_regional_zone_matrix` output (5 ZIPs × 8 injection_points = 40 rows)
First ZIP fully expanded:
```
(<v>, 'LAX', '90008', '1', <eff>, NULL, 'GOFO Regional zone matrix XLSX', NULL)
(<v>, 'DFW', '90008', '6', <eff>, NULL, 'GOFO Regional zone matrix XLSX', NULL)
(<v>, 'ORD', '90008', '7', <eff>, NULL, 'GOFO Regional zone matrix XLSX', NULL)
(<v>, 'EWR', '90008', '8', <eff>, NULL, 'GOFO Regional zone matrix XLSX', NULL)
(<v>, 'JFK', '90008', '8', <eff>, NULL, 'GOFO Regional zone matrix XLSX', NULL)
(<v>, 'ATL', '90008', '8', <eff>, NULL, 'GOFO Regional zone matrix XLSX', NULL)
(<v>, 'MIA', '90008', '8', <eff>, NULL, 'GOFO Regional zone matrix XLSX', NULL)
(<v>, 'SLC', '90008', '5', <eff>, NULL, 'GOFO Regional zone matrix XLSX', NULL)
```
Repeat the 8-row pattern for each of the other 4 ZIPs (90016, 90022, 90023, 90024). All have the same hub-zone profile in the test sample.

### Sample row with the `'-'` sentinel
Source row at line index 7723:
```
Zip Code  LAX  DFW  ORD  EWR/JFK  ATL  MIA  SLC
97321     5    -    7    8        8    8    5
```

Expected output:
- 1 row in `service_coverage_zips` (is_serviceable=true)
- 7 rows in `gofo_regional_zone_matrix`: LAX=5, ORD=7, EWR=8, JFK=8, ATL=8, MIA=8, SLC=5
- **No DFW row** (sentinel skipped)

---

## 7. Atomic commit semantics

After preview confirmation, the commit Server Action runs:

```sql
BEGIN;

-- Wipe prior active set (safe per the discussed truncate-replace pattern)
TRUNCATE TABLE service_coverage_zips;
TRUNCATE TABLE gofo_regional_zone_matrix;

-- Bulk INSERT new rows
INSERT INTO service_coverage_zips (carrier_code, service_level, zip5, is_serviceable, effective_date, source) VALUES
  (... 8,361 rows ...);

INSERT INTO gofo_regional_zone_matrix (matrix_version, injection_point, dest_zip5, zone, effective_date, source) VALUES
  (... 66,884 rows ...);

COMMIT;
```

**Important:** the 66,884-row INSERT is large. Two options:

1. **Single multi-VALUES INSERT statement** — Postgres handles this fine but the SQL string will be ~8 MB. Server Action needs enough body limit.
2. **Batched INSERTs in a loop** — chunks of 1,000 rows, all inside the same transaction. More resilient to memory/string-size limits, slightly more code.

Recommend option 2 with chunks of 1,000 rows. Total commit time should still be sub-5-second over the wire.

If either INSERT fails mid-stream, ROLLBACK fires and the prior active set is restored (truncate is also rolled back). No "partial state" risk.

---

## 8. Things this spec does NOT cover yet

- **Browse view** for spot-checking loaded rows. Out of scope for first cut; defer until after upload flow is verified.
- **Re-upload diff display** ("12 ZIPs added, 3 removed since last upload"). Nice-to-have for v2; v1 just truncates and replaces.
- **Error recovery** if the commit transaction fails mid-flight in production. Postgres ROLLBACK handles correctness, but the UI should surface the failure clearly (current architecture already does this via flash messages — confirm pattern is in place for this Server Action).

---

End of spec.
