// ==========================================================
// FILE: src/alamo/app/invoices/upload/page.tsx
// PURPOSE: Carrier invoice upload page. Admin selects a
// carrier, chooses a CSV or XLSX file, and submits.
// On submit:
//   1. Parse file and extract headers
//   2. Upload file to Supabase Storage (carrier-invoices)
//   3. Create carrier_invoices row with headers + file_path
//   4. Redirect to review page for AI normalization
// ==========================================================

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

async function uploadInvoice(formData: FormData) {
  'use server'

  const admin = createAdminSupabaseClient()

  const carrierCode = formData.get('carrier_code') as string
  const file = formData.get('invoice_file') as File

  if (!carrierCode || !file || file.size === 0) return

  // WHY: Convert file to buffer so we can both upload it
  // to storage and parse headers from it in one pass.
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // ----------------------------------------------------------
  // STEP 1: Extract headers from the file
  // WHY: We store raw headers in carrier_invoices.raw_headers
  // so the AI normalization step can read them without
  // re-fetching the file from storage.
  // ----------------------------------------------------------

  let rawHeaders: string[] = []

  if (file.name.endsWith('.csv')) {
    // WHY: CSV headers are always the first line.
    // Split on newline, take row 0, split on comma.
    // Trim each header to remove whitespace and quotes.
    const text = buffer.toString('utf-8')
    const firstLine = text.split('\n')[0]
    rawHeaders = firstLine
      .split(',')
      .map(h => h.trim().replace(/^"|"$/g, ''))
      .filter(h => h.length > 0)

  } else if (
    file.name.endsWith('.xlsx') ||
    file.name.endsWith('.xls')
  ) {
    // WHY: XLSX files are binary — we can't split on newlines.
    // We use a simple approach: find the first populated row
    // by looking for the shared strings table in the XML.
    // For Phase 1 UPS files which are CSV this path is a
    // fallback. Full XLSX parsing comes in the normalization
    // engine with the xlsx npm package.
    rawHeaders = ['XLSX_PARSE_REQUIRED']
  }

  // ----------------------------------------------------------
  // STEP 2: Upload file to Supabase Storage
  // WHY: We store the actual file so the parser can re-read
  // it during line item processing. Path includes carrier
  // code and timestamp for uniqueness and easy lookup.
  // ----------------------------------------------------------

  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = `${carrierCode}/${timestamp}_${safeName}`

  const { error: storageError } = await admin
    .storage
    .from('carrier-invoices')
    .upload(filePath, buffer, {
      contentType: file.type || 'text/csv',
      upsert: false,
    })

  if (storageError) {
    console.error('Storage upload error:', storageError)
    return
  }

  // ----------------------------------------------------------
  // STEP 3: Create carrier_invoices row
  // WHY: Status starts as UPLOADED. The review page will
  // advance it to NORMALIZING when AI processing begins.
  // ----------------------------------------------------------

  const { data: invoice, error: dbError } = await admin
    .from('carrier_invoices')
    .insert({
      carrier_code: carrierCode,
      invoice_file_name: file.name,
      file_path: filePath,
      raw_headers: rawHeaders,
      status: 'UPLOADED',
    })
    .select('id')
    .single()

  if (dbError || !invoice) {
    console.error('Invoice insert error:', dbError)
    // WHY: Clean up the uploaded file if the DB insert fails
    // so we don't orphan files in storage.
    await admin.storage
      .from('carrier-invoices')
      .remove([filePath])
    return
  }

  // WHY: Redirect to the invoice detail page where the admin
  // can trigger AI normalization and review the mappings.
  redirect(`/invoices/${invoice.id}/review`)
}

export default async function UploadInvoicePage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

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
          <a href="/invoices" style={{
            fontSize: 13,
            color: 'var(--cactus-muted)',
            textDecoration: 'none',
          }}>
            Carrier Invoices
          </a>
          <span style={{ color: 'var(--cactus-border)', fontSize: 13 }}>/</span>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>
            Upload Invoice
          </div>
        </div>

        {/* Page content */}
        <div style={{ padding: '20px 24px' }}>

          <div style={{
            fontSize: 20,
            fontWeight: 500,
            color: 'var(--cactus-ink)',
            letterSpacing: '-0.02em',
            marginBottom: 4,
          }}>
            Upload Carrier Invoice
          </div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 24 }}>
            Upload a CSV or XLSX file exported from a carrier. Cactus will extract
            the headers and use AI to map them to standard fields.
          </div>

          {/* Upload form */}
          <div style={{
            background: 'var(--cactus-canvas)',
            border: '0.5px solid var(--cactus-border)',
            borderRadius: 10,
            padding: '24px',
            maxWidth: 480,
          }}>
            <form action={uploadInvoice}>

              {/* Carrier selector */}
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--cactus-muted)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}>
                  Carrier
                </label>
                <select
                  name="carrier_code"
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '0.5px solid var(--cactus-border-mid)',
                    background: '#fff',
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--cactus-ink)',
                    outline: 'none',
                  }}
                >
                  <option value="">Select a carrier...</option>
                  <option value="UPS">UPS</option>
                  <option value="FEDEX">FedEx</option>
                  <option value="USPS">USPS</option>
                  <option value="UNIUNI">UniUni</option>
                  <option value="GOFO">GOFO</option>
                  <option value="SHIPX">ShipX</option>
                  <option value="DHL_ECOM">DHL eCommerce</option>
                  <option value="DHL_EXPRESS">DHL Express</option>
                </select>
              </div>

              {/* File input */}
              <div style={{ marginBottom: 24 }}>
                <label style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--cactus-muted)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}>
                  Invoice File
                </label>
                <input
                  type="file"
                  name="invoice_file"
                  accept=".csv,.xlsx,.xls"
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '0.5px solid var(--cactus-border-mid)',
                    background: '#fff',
                    fontSize: 13,
                    color: 'var(--cactus-ink)',
                    outline: 'none',
                  }}
                />
                <div style={{
                  fontSize: 11,
                  color: 'var(--cactus-muted)',
                  marginTop: 4,
                }}>
                  Accepted formats: CSV, XLSX, XLS
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'var(--cactus-forest)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Upload & Normalize →
              </button>

            </form>
          </div>
        </div>
      </div>
    </div>
  )
}