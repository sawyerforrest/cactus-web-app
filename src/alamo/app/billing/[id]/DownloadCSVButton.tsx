'use client'

// ==========================================================
// FILE: src/alamo/app/billing/[id]/DownloadCSVButton.tsx
// PURPOSE: Download the per-line CSV for a generated
// cactus_invoice. Mirrors DownloadPDFButton behavior —
// disables during fetch, restores after, surfaces errors.
// ==========================================================

import { useState } from 'react'

type DownloadCSVButtonProps = {
  cactusInvoiceId: string
}

export default function DownloadCSVButton({ cactusInvoiceId }: DownloadCSVButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload() {
    setIsDownloading(true)
    setError(null)

    try {
      const res = await fetch(`/api/billing/${cactusInvoiceId}/csv`)
      if (!res.ok) {
        throw new Error(`CSV generation failed (${res.status})`)
      }

      // Pull the server-supplied filename out of Content-Disposition
      // so the slug ({org-slug}) lives in one place — the action.
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? `cactus-invoice-${cactusInvoiceId.slice(0, 8)}.csv`

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = filename
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
            : 'var(--cactus-canvas)',
          color: isDownloading
            ? 'var(--cactus-muted)'
            : 'var(--cactus-ink)',
          border: '0.5px solid var(--cactus-border)',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          cursor: isDownloading ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap',
          transition: 'background 0.15s',
        }}
      >
        {isDownloading ? 'Generating…' : 'Download CSV'}
      </button>
      {error && (
        <div style={{ fontSize: 11, color: 'var(--cactus-bloom)' }}>
          {error}
        </div>
      )}
    </div>
  )
}
