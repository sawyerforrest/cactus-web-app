// ==========================================================
// FILE: src/alamo/app/api/billing/[id]/pdf/route.ts
// PURPOSE: GET /api/billing/:id/pdf — streams a one-page
// PDF summary for the given cactus_invoice id.
// ==========================================================

import { generateInvoicePDF } from '@/app/billing/[id]/actions/pdf'

// pdfkit depends on Node APIs — force the Node.js runtime
// so this route is never compiled to the edge runtime.
export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const pdfBuffer = await generateInvoicePDF(id)
    const body = new Uint8Array(pdfBuffer)

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          `attachment; filename="cactus-invoice-${id.slice(0, 8)}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
