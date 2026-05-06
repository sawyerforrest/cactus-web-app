// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/rate-cards/dhl-ecom-products.ts
// PURPOSE: Canonical DHL eCom Domestic product strings — verbatim from
// the source workbook. These land in analysis_rate_cards.service_level
// exactly as listed below. No normalization, no upper-snake, no
// display-vs-storage split.
//
// Source: dhl_ecommerce_cactus_base_rates_2026.xlsx (Pause 3 reference file).
//
// Validated at parse time via Pattern 5 strict-subset: every distinct
// Product value in the uploaded workbook must be a member of this
// 7-element set. Unknown product → fail upload with the unknown value
// surfaced verbatim so Sawyer learns exactly what to fix without
// diving into the file.
// ==========================================================

export const DHL_ECOM_PRODUCTS = [
  'BPM Expedited',
  'BPM Ground',
  'Expedited Max',
  'SM LWP Expedited',
  'SM LWP Ground',
  'SM Parcel Plus Expedited',
  'SM Parcel Plus Ground',
] as const

export type DhlEcomProduct = typeof DHL_ECOM_PRODUCTS[number]

export const DHL_ECOM_PRODUCT_SET: ReadonlySet<string> =
  new Set<string>(DHL_ECOM_PRODUCTS)
