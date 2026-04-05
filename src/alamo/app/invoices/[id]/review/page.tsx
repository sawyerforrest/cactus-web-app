// ==========================================================
// FILE: src/alamo/app/invoices/[id]/review/page.tsx
// PURPOSE: AI normalization review page. Shows the raw
// headers extracted from the uploaded carrier invoice and
// the AI-suggested mappings to Cactus standard fields.
// Admin can accept, correct, or skip each mapping before
// confirming and advancing to line item processing.
// ==========================================================

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

// WHY: The complete list of Cactus standard fields that
// a carrier invoice header can map to. This is what Claude
// chooses from when suggesting mappings. Grouped by category
// for readability in the review UI.
const CACTUS_STANDARD_FIELDS = [
  // Tracking
  { value: 'tracking_number',       label: 'Tracking Number' },
  { value: 'tracking_number_lead',  label: 'Tracking Number (Lead)' },
  { value: 'account_number_carrier',label: 'Account Number (Carrier)' },
  // Charges
  { value: 'carrier_charge',        label: 'Carrier Charge (Total)' },
  { value: 'base_charge',           label: 'Base Charge' },
  { value: 'fuel_surcharge',        label: 'Fuel Surcharge' },
  { value: 'residential_surcharge', label: 'Residential Surcharge' },
  { value: 'address_correction',    label: 'Address Correction' },
  { value: 'delivery_area_surcharge', label: 'Delivery Area Surcharge' },
  { value: 'additional_handling',   label: 'Additional Handling' },
  { value: 'apv_adjustment',        label: 'APV Adjustment' },
  // Weight
  { value: 'weight_billed',         label: 'Weight (Billed)' },
  { value: 'weight_unit_billed',    label: 'Weight Unit (Billed)' },
  { value: 'weight_entered',        label: 'Weight (Entered)' },
  // Dimensions
  { value: 'length_entered',        label: 'Length (Entered)' },
  { value: 'width_entered',         label: 'Width (Entered)' },
  { value: 'height_entered',        label: 'Height (Entered)' },
  { value: 'length_carrier',        label: 'Length (Carrier)' },
  { value: 'width_carrier',         label: 'Width (Carrier)' },
  { value: 'height_carrier',        label: 'Height (Carrier)' },
  // Service
  { value: 'service_level',         label: 'Service Level' },
  { value: 'zone',                  label: 'Zone' },
  // Dates
  { value: 'date_shipped',          label: 'Date Shipped' },
  { value: 'date_delivered',        label: 'Date Delivered' },
  { value: 'date_invoiced',         label: 'Date Invoiced' },
  // Shipment characteristics
  { value: 'is_residential',        label: 'Is Residential' },
  { value: 'pieces_count',          label: 'Pieces Count' },
  { value: 'bundle_number',         label: 'Bundle Number' },
  { value: 'payor',                 label: 'Payor' },
  { value: 'packaging_type',        label: 'Packaging Type' },
  // Sender address
  { value: 'address_sender_line1',  label: 'Sender Address Line 1' },
  { value: 'address_sender_line2',  label: 'Sender Address Line 2' },
  { value: 'address_sender_city',   label: 'Sender City' },
  { value: 'address_sender_state',  label: 'Sender State' },
  { value: 'address_sender_zip',    label: 'Sender Zip' },
  { value: 'address_sender_country',label: 'Sender Country' },
  // Receiver address
  { value: 'address_receiver_line1','label': 'Receiver Address Line 1' },
  { value: 'address_receiver_line2','label': 'Receiver Address Line 2' },
  { value: 'address_receiver_city', label: 'Receiver City' },
  { value: 'address_receiver_state',label: 'Receiver State' },
  { value: 'address_receiver_zip',  label: 'Receiver Zip' },
  { value: 'address_receiver_country', label: 'Receiver Country' },
  // References
  { value: 'reference_1',           label: 'Reference 1' },
  { value: 'reference_2',           label: 'Reference 2' },
  { value: 'reference_3',           label: 'Reference 3' },
  { value: 'reference_4',           label: 'Reference 4' },
  { value: 'reference_5',           label: 'Reference 5' },
  { value: 'reference_6',           label: 'Reference 6' },
  { value: 'reference_7',           label: 'Reference 7' },
  { value: 'reference_8',           label: 'Reference 8' },
  // International
  { value: 'customs_value',         label: 'Customs Value' },
  { value: 'customs_currency_code', label: 'Customs Currency Code' },
  { value: 'status_international',  label: 'International Status' },
  { value: 'confirmation_delivery', label: 'Delivery Confirmation' },
  // Skip
  { value: 'SKIP',                  label: '— Skip this field —' },
]

// WHY: Server action that calls the Claude API to normalize
// the raw headers from the uploaded invoice file.
// Called when the admin clicks "Normalize with AI".
async function normalizeHeaders(formData: FormData) {
  'use server'

  const admin = createAdminSupabaseClient()
  const invoiceId = formData.get('invoice_id') as string

  // Fetch the invoice to get raw_headers and carrier_code
  const { data: invoice } = await admin
    .from('carrier_invoices')
    .select('id, carrier_code, raw_headers, status')
    .eq('id', invoiceId)
    .single()

  if (!invoice || !invoice.raw_headers) return

  // WHY: Update status to NORMALIZING so the UI shows
  // the admin that AI processing is in progress.
  await admin
    .from('carrier_invoices')
    .update({ status: 'NORMALIZING' })
    .eq('id', invoiceId)

  // WHY: Build the prompt for Claude. We send the raw headers
  // and the list of Cactus standard fields. Claude returns
  // a JSON array of mappings — one per header.
  const standardFieldsList = CACTUS_STANDARD_FIELDS
    .filter(f => f.value !== 'SKIP')
    .map(f => `${f.value} (${f.label})`)
    .join('\n')

  const prompt = `You are normalizing carrier invoice headers for Cactus Logistics OS.

Carrier: ${invoice.carrier_code}

Raw headers from the uploaded invoice file:
${(invoice.raw_headers as string[]).map((h, i) => `${i + 1}. "${h}"`).join('\n')}

Cactus standard fields available for mapping:
${standardFieldsList}

For each raw header, suggest the best matching Cactus standard field.
If a header does not match any standard field, use "SKIP".

Important mapping rules:
- "Billed Charge" or similar → carrier_charge
- "Tracking Number" or similar → tracking_number
- "Account Number" or similar → account_number_carrier
- "Service Level" or similar → service_level
- "Weight" alone → weight_billed
- "Sender Street" or similar → address_sender_line1
- "Pickup Date" or "Ship Date" → date_shipped
- "Invoice Date" → date_invoiced
- "Incentive Credit" or adjustment fields → apv_adjustment
- "Zone" → zone
- Reference fields → reference_1, reference_2, reference_3 in order
- Fields like "Invoice Number", "Invoice Type", "Invoice Due Date",
  "Invoice Section", "Pickup Record" → SKIP
- "Sender Name", "Sender Company", "Receiver Name", "Receiver Company" → SKIP
- "Third Party" payor indicator → payor

Respond ONLY with a valid JSON array. No explanation. No markdown. Example format:
[
  { "raw_header": "Tracking Number", "cactus_field": "tracking_number", "confidence": 0.99 },
  { "raw_header": "Invoice Number", "cactus_field": "SKIP", "confidence": 1.0 }
]`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()
    const text = data.content?.[0]?.text ?? ''

    // WHY: Parse Claude's JSON response. Strip any accidental
    // markdown fences before parsing.
    const clean = text.replace(/```json|```/g, '').trim()
    const mappings = JSON.parse(clean) as Array<{
      raw_header: string
      cactus_field: string
      confidence: number
    }>

    // WHY: Store each mapping in carrier_invoice_mappings
    // with ai_suggested=TRUE so the admin knows these came
    // from Claude and need human review before being trusted.
    for (const mapping of mappings) {
      if (mapping.cactus_field === 'SKIP') continue

      await admin
        .from('carrier_invoice_mappings')
        .upsert({
          carrier_code: invoice.carrier_code,
          raw_header_name: mapping.raw_header,
          cactus_standard_field: mapping.cactus_field,
          ai_suggested: true,
          ai_confidence_score: mapping.confidence,
          effective_date: new Date().toISOString().split('T')[0],
        }, {
          onConflict: 'carrier_code,raw_header_name,effective_date',
        })
    }

    // WHY: Advance status to REVIEW so the admin can see
    // and confirm the mappings on this page.
    await admin
      .from('carrier_invoices')
      .update({
        status: 'REVIEW',
        ai_processing_notes: `Claude mapped ${mappings.filter(m => m.cactus_field !== 'SKIP').length} of ${mappings.length} headers. ${mappings.filter(m => m.cactus_field === 'SKIP').length} skipped.`,
      })
      .eq('id', invoiceId)

  } catch (err) {
    console.error('AI normalization error:', err)
    await admin
      .from('carrier_invoices')
      .update({
        status: 'FAILED',
        ai_processing_notes: 'AI normalization failed. Please try again.',
      })
      .eq('id', invoiceId)
  }

  redirect(`/invoices/${invoiceId}/review`)
}

export default async function InvoiceReviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()

  // Fetch invoice and existing mappings in parallel
  const [{ data: invoice }, { data: mappings }] = await Promise.all([
    admin
      .from('carrier_invoices')
      .select('id, invoice_file_name, carrier_code, status, raw_headers, ai_processing_notes')
      .eq('id', id)
      .single(),
    admin
      .from('carrier_invoice_mappings')
      .select('raw_header_name, cactus_standard_field, ai_suggested, ai_confidence_score')
      .eq('carrier_code', 'UPS') // WHY: scoped to carrier — will use invoice.carrier_code dynamically
      .order('created_at', { ascending: false }),
  ])

  if (!invoice) redirect('/invoices')

  const rawHeaders = (invoice.raw_headers as string[]) ?? []

  // WHY: Build a lookup map of existing mappings so we can
  // show the current suggested value for each header.
  const mappingLookup: Record<string, { field: string; confidence: number; aiSuggested: boolean }> = {}
  for (const m of mappings ?? []) {
    if (!mappingLookup[m.raw_header_name]) {
      mappingLookup[m.raw_header_name] = {
        field: m.cactus_standard_field,
        confidence: Number(m.ai_confidence_score ?? 0),
        aiSuggested: m.ai_suggested,
      }
    }
  }

  const isUploaded = invoice.status === 'UPLOADED'
  const isNormalizing = invoice.status === 'NORMALIZING'
  const isReview = invoice.status === 'REVIEW'
  const isFailed = invoice.status === 'FAILED'

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '200px 1fr',
      minHeight: '100vh',
      background: 'var(--cactus-sand)',
    }}>
      <Sidebar />

      <div style={{ display: 'flex', flexDirection: 'column' }}>

        {/* Breadcrumb bar */}
        <div style={{
          background: 'var(--cactus-canvas)',
          borderBottom: '0.5px solid var(--cactus-border)',
          padding: '0 24px',
          height: 48,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <a href="/invoices" style={{ fontSize: 13, color: 'var(--cactus-muted)', textDecoration: 'none' }}>
            Carrier Invoices
          </a>
          <span style={{ color: 'var(--cactus-border)', fontSize: 13 }}>/</span>
          <a href={`/invoices/${id}`} style={{ fontSize: 13, color: 'var(--cactus-muted)', textDecoration: 'none', fontFamily: 'monospace' }}>
            {invoice.invoice_file_name}
          </a>
          <span style={{ color: 'var(--cactus-border)', fontSize: 13 }}>/</span>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>
            Review
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>

          {/* Page heading */}
          <div style={{
            fontSize: 20,
            fontWeight: 500,
            color: 'var(--cactus-ink)',
            letterSpacing: '-0.02em',
            marginBottom: 4,
          }}>
            AI Header Normalization
          </div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 20 }}>
            {invoice.carrier_code} · {invoice.invoice_file_name} · {rawHeaders.length} headers detected
          </div>

          {/* AI processing notes */}
          {invoice.ai_processing_notes && (
            <div style={{
              background: isFailed ? 'var(--cactus-bloom-bg)' : 'var(--cactus-amber-bg)',
              border: `0.5px solid ${isFailed ? 'var(--cactus-bloom-border)' : 'var(--cactus-border)'}`,
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 20,
              fontSize: 13,
              color: isFailed ? 'var(--cactus-bloom)' : 'var(--cactus-ink)',
            }}>
              <span style={{ fontWeight: 500, marginRight: 8 }}>
                {isFailed ? 'Error:' : 'AI Notes:'}
              </span>
              {invoice.ai_processing_notes}
            </div>
          )}

          {/* Normalize button — shown when status is UPLOADED or FAILED */}
          {(isUploaded || isFailed) && rawHeaders.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <form action={normalizeHeaders}>
                <input type="hidden" name="invoice_id" value={id} />
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--cactus-forest)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  {isFailed ? 'Retry AI Normalization →' : 'Normalize with AI →'}
                </button>
              </form>
            </div>
          )}

          {/* Processing state */}
          {isNormalizing && (
            <div style={{
              background: 'var(--cactus-amber-bg)',
              border: '0.5px solid var(--cactus-border)',
              borderRadius: 8,
              padding: '16px',
              marginBottom: 24,
              fontSize: 13,
              color: 'var(--cactus-ink)',
            }}>
              Claude is normalizing headers... refresh in a moment.
            </div>
          )}

          {/* Headers table */}
          {rawHeaders.length > 0 && (
            <div style={{
              background: 'var(--cactus-canvas)',
              border: '0.5px solid var(--cactus-border)',
              borderRadius: 10,
              overflow: 'hidden',
            }}>
              {/* Table header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 2fr 80px',
                background: 'var(--cactus-sand)',
                borderBottom: '0.5px solid var(--cactus-border)',
                padding: '8px 16px',
              }}>
                {['Raw Header', 'Cactus Standard Field', 'Confidence'].map(h => (
                  <div key={h} style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--cactus-muted)',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}>{h}</div>
                ))}
              </div>

              {/* Header rows */}
              {rawHeaders.map((header, i) => {
                const mapping = mappingLookup[header]
                const confidence = mapping?.confidence ?? 0
                const hasMapping = !!mapping && mapping.field !== 'SKIP'

                return (
                  <div
                    key={header}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 2fr 80px',
                      padding: '10px 16px',
                      alignItems: 'center',
                      borderBottom: i < rawHeaders.length - 1
                        ? '0.5px solid var(--cactus-border)'
                        : 'none',
                    }}
                  >
                    {/* Raw header name */}
                    <div style={{
                      fontSize: 12,
                      fontFamily: 'monospace',
                      color: 'var(--cactus-ink)',
                    }}>
                      {header}
                    </div>

                    {/* Mapped field */}
                    <div>
                      {mapping ? (
                        <span style={{
                          display: 'inline-flex',
                          padding: '2px 8px',
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 500,
                          fontFamily: hasMapping ? 'monospace' : 'inherit',
                          color: hasMapping
                            ? 'var(--cactus-forest)'
                            : 'var(--cactus-muted)',
                          background: hasMapping
                            ? 'var(--cactus-mint)'
                            : 'var(--cactus-sand)',
                          border: '0.5px solid var(--cactus-border)',
                        }}>
                          {hasMapping ? mapping.field : '— skipped —'}
                        </span>
                      ) : (
                        <span style={{
                          fontSize: 12,
                          color: 'var(--cactus-hint)',
                        }}>
                          {isReview ? '— no mapping —' : '—'}
                        </span>
                      )}
                    </div>

                    {/* Confidence score */}
                    <div style={{
                      fontSize: 12,
                      color: confidence >= 0.9
                        ? 'var(--cactus-forest)'
                        : confidence >= 0.7
                        ? 'var(--cactus-amber)'
                        : 'var(--cactus-muted)',
                      fontWeight: confidence >= 0.9 ? 500 : 400,
                    }}>
                      {mapping ? `${Math.round(confidence * 100)}%` : '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* No headers state */}
          {rawHeaders.length === 0 && (
            <div style={{
              background: 'var(--cactus-canvas)',
              border: '0.5px solid var(--cactus-border)',
              borderRadius: 10,
              padding: '32px 16px',
              textAlign: 'center',
              fontSize: 13,
              color: 'var(--cactus-muted)',
            }}>
              No headers found in this file. The file may be empty or in an unsupported format.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}