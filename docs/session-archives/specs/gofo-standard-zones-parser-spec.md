# GOFO Standard Zone Matrix XLSX — Parser Specification

**Source file:** `2026_CIRRO_GOFO_Standard___Economy_Zones.xlsx` (single file, 8 hub tabs)

**Target table:** `carrier_zone_matrices` (existing, no schema changes needed)

**Senior Architect inspection date:** 2026-05-05
**Status:** Authoritative for v1 parser implementation. Adds GOFO Standard support to the existing Zone Matrices screen alongside DHL eCom Domestic.

---

## 1. Single-file upload (different from DHL Domestic's 18-file upload)

Unlike DHL eCom Domestic (one file per DC), GOFO publishes a **single workbook with 8 tabs**, one tab per injection-point hub. Single file picker, single upload event.

The same Zone Matrices screen handles both — the upload form will let the operator pick "DHL eCom Domestic" or "GOFO Standard" from a service selector before picking files. The DHL flow expects 18 files; the GOFO flow expects 1 file.

This keeps the screen unified ("zone matrices") while accommodating the published-format differences.

---

## 2. File-level structure

- **8 tabs**, one per GOFO injection-point hub
- **Each tab has identical schema** but different data (hub-specific zones)
- One tab (LAX) has an extra metadata column (`Remote tab`); others have 3 columns

### Tab name → hub_code mapping

Tab names are inconsistent in whitespace — parser must trim. Mapping table:

| Tab name (raw) | Tab name (trimmed) | Hub code (from `gofo_hubs`) | Hub city | Home ZIP3 | Spot-check |
|---|---|---|---|---|---|
| `ECOWE,STDWE` | `ECOWE,STDWE` | `LAX` | Los Angeles | 900 | home rates zone 2 ✓ |
| `ECONE,STDNE` | `ECONE,STDNE` | `JFK` | Queens NYC | 114 | zone 2 ✓ |
| `ECONJ,STDNJ` | `ECONJ,STDNJ` | `EWR` | Newark | 071 | zone 2 ✓ |
| `ECOCE, STDCE` | `ECOCE,STDCE` | `ORD` | Chicago | 606 | zone 2 ✓ |
| `ECOEA, STDEA` | `ECOEA,STDEA` | `ATL` | Atlanta | 303 | zone 2 ✓ |
| `ECOSO, STDSO` | `ECOSO,STDSO` | `DFW` | Dallas | 752 | zone 2 ✓ |
| `ECOSE,STDSE` | `ECOSE,STDSE` | `MIA` | Miami | 331 | zone 2 ✓ |
| `ECOSL,STDSL` | `ECOSL,STDSL` | `SLC` | Salt Lake City | 841 | zone 2 ✓ |

The "ECO" prefix is GOFO Economy service; "STD" is GOFO Standard. Per architectural decision (confirmed 2026-05-05 with Sawyer): **same zone applies to both Economy and Standard from a given hub**. Parser inserts as `service_level='Standard'` only — Economy reuses the same matrix at rating time.

If GOFO ever publishes Economy with different zones than Standard, the schema can accommodate (just insert separate rows with `service_level='Economy'`). Document this assumption in the parser file header.

### Per-tab columns

- **`Zone`** (text): zone code as string (see § 3 below)
- **`Closing Zip`** (text, 5-digit): destination ZIP5
- **`3-digit`** (text, 3-digit): destination ZIP3 prefix — pre-aggregated by GOFO
- **`Remote tab`** (text, only on LAX tab): metadata like "Puerto Rico", "Alaska", "Military" — informational, not loaded

---

## 3. ZIP3 aggregation — lossless flatten

**Critical architectural finding** (verified 2026-05-05 by Senior Architect): every ZIP3 prefix in the file has a uniform zone across all its ZIP5s. No ZIP3 has multiple zones. This means the GOFO Standard matrix is **effectively ZIP3-keyed** despite being published at ZIP5 granularity.

**The parser aggregates ZIP5 → ZIP3 during parse**, producing 931 ZIP3 rows per tab × 8 tabs = **7,448 total target rows**.

Aggregation logic per tab:
1. Read all 93,100 rows from the tab
2. Group by `3-digit` (ZIP3)
3. For each group, take the single zone value (validation: assert `nunique() == 1` per group; hard error if not)
4. Output one row per ZIP3 with the resolved zone

This compression matches the DHL Domestic shape (one row per origin × destination ZIP3) and reuses the existing schema with no migration.

If GOFO ever publishes data with intra-ZIP3 zone variance, the parser must hard-error and we revisit the architecture.

---

## 4. Zone value range

Across all 8 tabs, distinct zone values:

```
Standard zones:  '2', '3', '4', '5', '6', '7', '8'
Remote zones:    'remote 1', 'remote 2', 'remote 4', 'remote 5', 
                 'remote 6', 'remote 7', 'remote 8', 'remote 9'
```

No zone 1, no zone 9, no zone 10 in source data. Some "remote N" values present in some tabs but not others (varies by hub geography).

**Zone column is TEXT** in `carrier_zone_matrices` (already), so we store these verbatim as strings: `'8'`, `'remote 8'`, etc. No transformation needed.

---

## 5. Output row derivation

For each ZIP3 in each of the 8 tabs, write **one row** to `carrier_zone_matrices`:

```
carrier_code     = 'GOFO'
service_level    = 'Standard'
matrix_version   = '2026-04-28' (publication date — see § 6)
origin_zip3      = <hub's primary_zip5[:3], from gofo_hubs>
                   LAX→'900', DFW→'752', ORD→'606', EWR→'071',
                   JFK→'114', ATL→'303', MIA→'331', SLC→'841'
dest_zip3        = <ZIP3 from source>
zone             = <aggregated zone as text, e.g., '5' or 'remote 8'>
effective_date   = <picked by operator on upload screen>
deprecated_date  = NULL
source           = 'GOFO Standard Zones XLSX (single workbook, 8 hub tabs)'
notes            = 'Hub: ' || <hub_code>  -- e.g., 'Hub: LAX'
```

**Total expected rows: 7,448** (931 ZIP3s × 8 hubs).

Origin ZIP3 lookup must come from `gofo_hubs` table at parse time (live query), not hardcoded — per Pattern 5 discipline. If a hub gets added or changed in the future, the parser inherits the change without code modification.

---

## 6. Effective date — operator picks

The source file has no encoded effective date. Add a date picker to the upload form:

- **Default value:** `2026-04-28` (matches the GOFO Standard rate card filenames `4_28_PU` / `4_28_drop_off` from the prior batch upload)
- **Required:** yes
- **Validation:** valid date, no year > current+5

Used as both `effective_date` and `matrix_version`.

---

## 7. Validation rules

### Hard errors (block upload)
- File doesn't have exactly 8 tabs
- Tab names don't match the canonical 8 (after whitespace trim)
- Any tab missing required columns: `Zone`, `Closing Zip`, `3-digit`
- Any ZIP5 not exactly 5 digits
- Any ZIP3 not exactly 3 digits
- Any zone value not in `{'2','3','4','5','6','7','8'}` ∪ `{'remote 1'..'remote 9'}`
- **Within-ZIP3 zone variance** in any tab (the lossless-aggregation assumption is violated)
- Total ZIP3s per tab significantly different from expected ~931 (sanity bounds: 800-1100)

### Warnings (allow upload)
- Total ZIP3 count differs from prior active set by >5%
- New ZIP3s appearing not in prior active set (informational count)
- ZIP3s in prior active set missing from this upload (informational count)

### Preview summary stats
```
Source file:        2026_CIRRO_GOFO_Standard___Economy_Zones.xlsx
Tabs found:         8 / 8 expected (✓ LAX, JFK, EWR, ORD, ATL, DFW, MIA, SLC)
Total ZIP3s:        931 per hub (matches across all 8)
Output rows:        7,448 (931 × 8)
Zone distribution:  Z2 (X), Z3 (Y), ... Z8 (Z), remote-N (W)
Effective date:     2026-04-28
[ first 10 ZIP3s × 8 hubs preview table ]
[ warnings, if any ]
[ Commit (7,448 zone matrix rows) ]   [ Upload different file ]
```

---

## 8. Sample data for unit testing

### Source rows from LAX tab (`ECOWE,STDWE`), first 5 ZIP5s

```
Zone  Closing Zip  3-digit  Remote tab
8     00500        005      NaN
8     00501        005      NaN
8     00502        005      NaN
8     00503        005      NaN
8     00504        005      NaN
```

### Aggregated LAX row for ZIP3 005

After ZIP5→ZIP3 aggregation:

```
ZIP3 005 → zone '8' (all ZIP5s in 005 share zone 8)
```

### Expected `carrier_zone_matrices` output for ZIP3 005 across all 8 hubs

```
('GOFO', 'Standard', '2026-04-28', '900', '005', '8', '2026-04-28', NULL, '<src>', 'Hub: LAX')
('GOFO', 'Standard', '2026-04-28', '114', '005', '<lookup from JFK tab>', ..., 'Hub: JFK')
('GOFO', 'Standard', '2026-04-28', '071', '005', '<lookup from EWR tab>', ..., 'Hub: EWR')
... (5 more rows for ORD, ATL, DFW, MIA, SLC)
```

Pattern: 931 ZIP3s × 8 hubs = 7,448 rows, all with `service_level='Standard'`.

### Spot-check: hub home ZIP3 should rate zone 2

Each hub's own home ZIP3 must show as zone 2 (verified in inspection):
- LAX→ZIP3 900: zone 2
- JFK→ZIP3 114: zone 2
- EWR→ZIP3 071: zone 2
- ORD→ZIP3 606: zone 2
- ATL→ZIP3 303: zone 2
- DFW→ZIP3 752: zone 2
- MIA→ZIP3 331: zone 2
- SLC→ZIP3 841: zone 2

If any of these don't match in the parsed output, the tab-to-hub mapping is wrong.

---

## 9. Atomic commit semantics

After preview confirmation, the commit Server Action runs:

```sql
BEGIN;

-- Wipe prior active set for GOFO Standard (scoped delete, doesn't touch DHL rows)
DELETE FROM carrier_zone_matrices 
  WHERE carrier_code = 'GOFO' AND service_level = 'Standard';

-- Bulk INSERT all 7,448 new rows
INSERT INTO carrier_zone_matrices (carrier_code, service_level, matrix_version, 
  origin_zip3, dest_zip3, zone, effective_date, deprecated_date, source, notes) 
VALUES (... 7,448 rows ...);

COMMIT;
```

The 7,448-row INSERT is small enough to do as a single multi-VALUES statement (~1 MB SQL string). No chunking needed unlike GOFO Regional Coverage's 66k rows. Single PG function call handles the atomic write.

If the INSERT fails mid-stream, ROLLBACK restores prior active set. No partial state.

---

## 10. UI flow (mirrors DHL Domestic and GOFO Regional Coverage)

Same architectural pattern:

1. **Service selector** ("DHL eCom Domestic" or "GOFO Standard") above the upload picker
2. **Single file picker** (.xlsx, no multiple) for GOFO Standard; multi-file picker for DHL Domestic — service selector controls which mode
3. **Effective date picker** (defaults to 2026-04-28 for GOFO Standard)
4. **Upload Server Action** parses the file, uploads to `pld-uploads/zone-matrices/<upload_uuid>/gofo-standard.xlsx`
5. **Preview** shows summary + tab-validation table + zone distribution + first 10 ZIP3 rows × 8 hubs
6. **Commit Server Action** re-parses, validates re-parse summary matches preview, runs scope-deleted INSERT, deletes stage file
7. **SubmitButton pending state** for both Upload and Commit (per the recent rollout)

### Stage path namespacing

For GOFO Standard (single file): `pld-uploads/zone-matrices/<upload_uuid>/gofo-standard.xlsx`

For DHL Domestic (18 files): `pld-uploads/zone-matrices/<upload_uuid>/<dc_code>.xlsx`

Both use the same `<upload_uuid>` parent folder pattern so cleanup logic works uniformly.

---

## 11. End-to-end verification (after commit)

- 7,448 rows in `carrier_zone_matrices` WHERE `carrier_code='GOFO' AND service_level='Standard'`
- 8 distinct `origin_zip3` values: 900, 752, 606, 071, 114, 303, 331, 841
- 931 distinct `dest_zip3` values
- Zone distribution includes both standard zones (2-8) and remote N variants
- Spot-check each hub's home ZIP3 → zone 2:
  - `(900, '900')` → '2'
  - `(114, '114')` → '2'
  - `(071, '071')` → '2'
  - `(606, '606')` → '2'
  - `(303, '303')` → '2'
  - `(752, '752')` → '2'
  - `(331, '331')` → '2'
  - `(841, '841')` → '2'
- Stage file deleted from `pld-uploads/zone-matrices/<upload_uuid>/`
- DHL_ECOM rows in `carrier_zone_matrices` unchanged (scope-delete didn't touch them)
- Production tables (`shipment_ledger=953`, `invoice_line_items=967`, `cactus_invoices=3`) unchanged

---

## 12. Things this spec does NOT cover

- **GOFO Economy service level** — same matrix as Standard per Sawyer's confirmation. If Economy ever diverges, add a separate parser path that inserts `service_level='Economy'` rows from the same tabs.
- **GOFO Regional zone matrix** — already in production (`gofo_regional_zone_matrix` table). Different table, different shape (ZIP5-keyed in that case because GOFO Regional genuinely varies by ZIP5).
- **DHL eCom Domestic** — separate parser, multi-file upload. See `dhl-ecom-zones-parser-spec.md`.
- **DHL DAS ZIP list** — separate concept (surcharge flag list, not zone matrix). Future small screen, mirrors `gofo_remote_zip3s` UX.

---

End of spec.
