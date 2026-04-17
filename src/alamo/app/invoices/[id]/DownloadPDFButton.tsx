'use client'

// ==========================================================
// FILE: src/alamo/app/invoices/[id]/DownloadPDFButton.tsx
// PURPOSE: Download the one-page PDF summary for a generated
// cactus_invoice. Fetches the PDF from the API route, creates
// an object URL, and triggers a browser download.
// ==========================================================

import { useState } from 'react'

type DownloadPDFButtonProps = {
  cactusInvoiceId: string
}

export default function DownloadPDFButton({ cactusInvoiceId }: DownloadPDFButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload() {
    setIsDownloading(true)
    setError(null)

    try {
      const res = await fetch(`/api/invoices/${cactusInvoiceId}/pdf`)
      if (!res.ok) {
        throw new Error(`PDF generation failed (${res.status})`)
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = `cactus-invoice-${cactusInvoiceId.slice(0, 8)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()

      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button
        onClick={handleDownload}
        disabled={isDownloading}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 14px',
          background: isDownloading
            ? 'var(--cactus-border)'
            : 'var(--cactus-forest)',
          color: isDownloading
            ? 'var(--cactus-muted)'
            : '#ffffff',
          border: '0.5px solid var(--cactus-border)',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          cursor: isDownloading ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap',
          transition: 'background 0.15s',
        }}
      >
        {isDownloading ? 'Generating…' : 'Download PDF'}
      </button>
      {error && (
        <div style={{ fontSize: 11, color: 'var(--cactus-bloom)' }}>
          {error}
        </div>
      )}
    </div>
  )
}
