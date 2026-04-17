// ==========================================================
// FILE: src/alamo/app/api/billing/[id]/csv/route.ts
// PURPOSE: GET /api/billing/:id/csv — streams a per-line CSV
// for the given cactus_invoice id.
// ==========================================================

import { generateInvoiceCSV } from '@/app/billing/[id]/actions/csv'

export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const { csv, filename } = await generateInvoiceCSV(id)

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
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
