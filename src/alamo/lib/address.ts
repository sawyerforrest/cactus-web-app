// Shared address normalization. The parser (writes
// invoice_line_items.address_sender_normalized when ingesting UPS
// detail invoices) and the location form (writes
// locations.normalized_address on admin creation) must produce
// byte-identical output for dark-account matching to work — that
// match compares invoice_line_items.address_sender_normalized
// against locations.normalized_address.
//
// line_2 is included on purpose: shipments from the same building
// with different suite numbers would otherwise collide and route
// to the wrong org.

export function normalizeAddress(parts: {
  line_1?: string | null
  line_2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null
}): string | null {
  const joined = [
    parts.line_1,
    parts.line_2,
    parts.city,
    parts.state,
    parts.postal_code,
    parts.country,
  ]
    .filter(Boolean)
    .join(', ')
    .toUpperCase()
  return joined || null
}
