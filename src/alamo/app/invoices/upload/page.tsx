// ==========================================================
// FILE: src/alamo/app/invoices/upload/page.tsx
// PURPOSE: Carrier invoice upload page. Admin selects carrier,
// format (DETAIL or SUMMARY), and uploads a CSV file.
// On submit:
//   DETAIL format: reads file, stores it, triggers parser
//   SUMMARY format: extracts headers, triggers AI normalization
// ==========================================================

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

async function uploadInvoice(formData: FormData) {
  'use server'

  const admin = createAdminSupabaseClient()

  const carrierCode = formData.get('carrier_code') as string
  const invoiceFormat = formData.get('invoice_format') as string
  const file = formData.get('invoice_file') as File

  if (!carrierCode || !invoiceFormat || !file || file.size === 0) return

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // ----------------------------------------------------------
  // STEP 1: Extract headers (SUMMARY only)
  // WHY: Detail files have no headers — the column template
  // in carrier_invoice_formats provides them. Summary files
  // have headers in row 1 that we extract and store for AI
  // normalization.
  // ----------------------------------------------------------
  let rawHeaders: string[] = []

  if (invoiceFormat === 'SUMMARY') {
    if (file.name.endsWith('.csv')) {
      const text = buffer.toString('utf-8')
      const firstLine = text.split('\n')[0]
      rawHeaders = firstLine
        .split(',')
        .map(h => h.trim().replace(/^"|"$/g, ''))
        .filter(h => h.length > 0)
    }
  }

  // ----------------------------------------------------------
  // STEP 2: Upload file to Supabase Storage
  // ----------------------------------------------------------
  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = `${carrierCode}/${invoiceFormat}/${timestamp}_${safeName}`

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
  // ----------------------------------------------------------
  const { data: invoice, error: dbError } = await admin
    .from('carrier_invoices')
    .insert({
      carrier_code: carrierCode,
      invoice_file_name: file.name,
      file_path: filePath,
      invoice_format: invoiceFormat,
      raw_headers: invoiceFormat === 'SUMMARY' ? rawHeaders : null,
      status: 'UPLOADED',
    })
    .select('id')
    .single()

  if (dbError || !invoice) {
    console.error('Invoice insert error:', dbError)
    await admin.storage.from('carrier-invoices').remove([filePath])
    return
  }

  // ----------------------------------------------------------
  // STEP 4: Route to correct next step
  // WHY: Detail format goes straight to parsing — no AI
  // normalization needed, routing is rule-based.
  // Summary format goes to AI review page.
  // ----------------------------------------------------------
  if (invoiceFormat === 'DETAIL') {
    redirect(`/invoices/${invoice.id}/parse`)
  } else {
    redirect(`/invoices/${invoice.id}/review`)
  }
}

// WHY: Format options per carrier. As we add FedEx, UniUni
// etc. this map will grow. For now UPS has both formats.
const CARRIER_FORMATS: Record<string, { value: string; label: string }[]> = {
  UPS: [
    { value: 'DETAIL', label: 'Detail (250 columns — recommended)' },
    { value: 'SUMMARY', label: 'Summary (32 columns)' },
  ],
  FEDEX: [
    { value: 'SUMMARY', label: 'Summary' },
  ],
  USPS: [
    { value: 'SUMMARY', label: 'Summary' },
  ],
  UNIUNI: [
    { value: 'SUMMARY', label: 'Summary' },
  ],
  GOFO: [
    { value: 'SUMMARY', label: 'Summary' },
  ],
  SHIPX: [
    { value: 'SUMMARY', label: 'Summary' },
  ],
  DHL_ECOM: [
    { value: 'SUMMARY', label: 'Summary' },
  ],
  DHL_EXPRESS: [
    { value: 'SUMMARY', label: 'Summary' },
  ],
}

export default async function UploadInvoicePage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div style={{
      marginLeft: 200,
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
            Select the carrier and invoice format before uploading.
            Detail format is recommended for UPS — it provides richer
            data including dimensions and individual charge breakdown.
          </div>

          <div style={{
            background: 'var(--cactus-canvas)',
            border: '0.5px solid var(--cactus-border)',
            borderRadius: 10,
            padding: '24px',
            maxWidth: 520,
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

              {/* Format selector */}
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
                  Invoice Format
                </label>
                <select
                  name="invoice_format"
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
                  <option value="">Select a format...</option>
                  <option value="DETAIL">
                    UPS Detail (250 columns — recommended)
                  </option>
                  <option value="SUMMARY">
                    UPS Summary (32 columns)
                  </option>
                </select>
                {/* WHY: Help text sets admin expectations on
                    which format to use and what happens next */}
                <div style={{
                  marginTop: 6,
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: 'var(--cactus-mint)',
                  border: '0.5px solid var(--cactus-border)',
                  fontSize: 11,
                  color: 'var(--cactus-forest)',
                  lineHeight: 1.5,
                }}>
                  <strong>Detail:</strong> Rule-based parsing. Richer data,
                  dimensions, individual charge breakdown. No AI review needed.
                  <br />
                  <strong>Summary:</strong> AI header normalization. Requires
                  human review before line items are processed.
                </div>
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
                Upload Invoice →
              </button>

            </form>
          </div>
        </div>
      </div>
    </div>
  )
}