// ==========================================================
// FILE: src/alamo/app/invoices/upload/page.tsx
// PURPOSE: Carrier invoice upload page. Admin selects a
// carrier, chooses a CSV or XLSX file, and submits. Cactus
// creates a carrier_invoices row and redirects to the AI
// normalization review screen.
// ==========================================================

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

// WHY: Server action — runs on the server when the form is
// submitted. Never exposed to the browser. This is how
// Next.js 16 handles form submissions without an API route.
async function uploadInvoice(formData: FormData) {
  'use server'

  const admin = createAdminSupabaseClient()

  const carrierCode = formData.get('carrier_code') as string
  const file = formData.get('invoice_file') as File

  if (!carrierCode || !file || file.size === 0) return

  // WHY: We store the file name so admins can identify the
  // invoice in the list. We do not store the file itself in
  // the database — raw file storage comes in a later stage.
  const fileName = file.name

  // WHY: Status starts as UPLOADED. The AI normalization step
  // will advance it to NORMALIZING then REVIEW.
  const { data: invoice, error } = await admin
    .from('carrier_invoices')
    .insert({
      carrier_code: carrierCode,
      invoice_file_name: fileName,
      status: 'UPLOADED',
    })
    .select('id')
    .single()

  if (error || !invoice) {
    console.error('Invoice insert error:', error)
    return
  }

  // WHY: Redirect to the invoice detail page. In the next
  // build stage this page will trigger AI normalization.
  redirect(`/invoices/${invoice.id}`)
}

export default async function UploadInvoicePage() {
  // WHY: Auth check — every Alamo page requires a logged-in user.
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
            Upload a CSV or XLSX file from a carrier. Cactus will use AI to normalize the headers.
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