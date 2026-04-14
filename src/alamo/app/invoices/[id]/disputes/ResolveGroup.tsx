'use client'

// =============================================================
// FILE: src/alamo/app/invoices/[id]/disputes/ResolveGroup.tsx
// PURPOSE: Interactive resolution UI for a group of disputed
// line items that share the same dispute reason.
//
// WHY GROUPED?
// When multiple line items have the same dispute reason
// (e.g. all flagged because address matched 2 locations),
// the admin should be able to resolve all of them at once
// by selecting the correct org — not one by one.
//
// This component receives a group of line items + available
// orgs, lets the admin select the correct org, optionally
// add notes, and submit. The resolve server action handles
// the billing calc and database updates.
// =============================================================

import { useState } from 'react'
import { resolveDisputeGroup, type ResolveResult } from '../actions/resolve'

type Org = {
  id: string
  name: string
}

type LineItem = {
  id: string
  tracking_number: string | null
  address_sender_normalized: string | null
  carrier_charge: string
}

type ResolveGroupProps = {
  groupIndex: number
  disputeReason: string
  lineItems: LineItem[]
  orgs: Org[]
  carrierCode: string
  carrierInvoiceId: string
  resolvedBy: string
}

export default function ResolveGroup({
  groupIndex,
  disputeReason,
  lineItems,
  orgs,
  carrierCode,
  carrierInvoiceId,
  resolvedBy,
}: ResolveGroupProps) {
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<ResolveResult | null>(null)

  // Total carrier charge for this group — shown for context
  const groupTotal = lineItems
    .reduce((sum, item) => sum + Number(item.carrier_charge), 0)
    .toFixed(2)

  async function handleResolve() {
    if (!selectedOrgId) return

    setIsSubmitting(true)
    setResult(null)

    try {
      const resolveResult = await resolveDisputeGroup({
        lineItemIds: lineItems.map((item) => item.id),
        orgId: selectedOrgId,
        carrierCode,
        carrierInvoiceId,
        resolvedBy,
        notes: notes.trim() || undefined,
      })
      setResult(resolveResult)
    } catch (err) {
      setResult({
        success: false,
        resolved: 0,
        errors: [err instanceof Error ? err.message : 'Unknown error'],
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Once resolved successfully, show a compact success state
  if (result?.success) {
    return (
      <div style={{
        padding: '12px 16px',
        background: 'var(--cactus-mint)',
        border: '0.5px solid var(--cactus-border)',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 13, color: 'var(--cactus-forest)', fontWeight: 500 }}>
          ✓ {result.resolved} line {result.resolved === 1 ? 'item' : 'items'} resolved
        </div>
        <div style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>
          Assigned to {orgs.find(o => o.id === selectedOrgId)?.name}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--cactus-canvas)',
      border: '0.5px solid var(--cactus-border)',
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: 16,
    }}>

      {/* Group header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '0.5px solid var(--cactus-border)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        background: 'var(--cactus-bloom-bg)',
      }}>
        <div>
          <div style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--cactus-bloom)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}>
            Dispute Group {groupIndex + 1} · {lineItems.length} line {lineItems.length === 1 ? 'item' : 'items'} · ${groupTotal}
          </div>
          <div style={{
            fontSize: 13,
            color: 'var(--cactus-bloom-mid)',
          }}>
            {disputeReason}
          </div>
        </div>
      </div>

      {/* Line items in this group */}
      <div style={{ borderBottom: '0.5px solid var(--cactus-border)' }}>

        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 100px',
          padding: '8px 16px',
          background: 'var(--cactus-sand)',
          borderBottom: '0.5px solid var(--cactus-border)',
        }}>
          {['Tracking / Address', 'Sender Address', 'Carrier Charge'].map(h => (
            <div key={h} style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--cactus-muted)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>
              {h}
            </div>
          ))}
        </div>

        {/* Line item rows */}
        {lineItems.map((item, i) => (
          <div
            key={item.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 100px',
              padding: '10px 16px',
              alignItems: 'center',
              borderBottom: i < lineItems.length - 1
                ? '0.5px solid var(--cactus-border)'
                : 'none',
              borderLeft: '2px solid var(--cactus-bloom)',
            }}
          >
            <div style={{
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              color: 'var(--cactus-ink)',
            }}>
              {item.tracking_number ?? '—'}
            </div>
            <div style={{
              fontSize: 11,
              color: 'var(--cactus-muted)',
              fontFamily: 'var(--font-mono)',
            }}>
              {item.address_sender_normalized ?? '—'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
              ${Number(item.carrier_charge).toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {/* Resolution controls */}
      <div style={{ padding: '14px 16px' }}>
        <div style={{
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--cactus-muted)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          marginBottom: 10,
        }}>
          Assign to Org
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>

          {/* Org selector */}
          <select
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            disabled={isSubmitting}
            style={{
              flex: 1,
              padding: '7px 10px',
              fontSize: 13,
              fontWeight: 500,
              color: selectedOrgId ? 'var(--cactus-ink)' : 'var(--cactus-hint)',
              background: 'var(--cactus-canvas)',
              border: '0.5px solid var(--cactus-border-mid)',
              borderRadius: 6,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              outline: 'none',
            }}
          >
            <option value="">Select org…</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>

          {/* Optional notes */}
          <input
            type="text"
            placeholder="Resolution notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isSubmitting}
            style={{
              flex: 1,
              padding: '7px 10px',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--cactus-ink)',
              background: 'var(--cactus-canvas)',
              border: '0.5px solid var(--cactus-border-mid)',
              borderRadius: 6,
              outline: 'none',
            }}
          />

          {/* Resolve button */}
          <button
            onClick={handleResolve}
            disabled={!selectedOrgId || isSubmitting}
            style={{
              flexShrink: 0,
              padding: '7px 20px',
              background: !selectedOrgId || isSubmitting
                ? 'var(--cactus-border)'
                : 'var(--cactus-forest)',
              color: !selectedOrgId || isSubmitting
                ? 'var(--cactus-muted)'
                : '#ffffff',
              border: '0.5px solid var(--cactus-border)',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              cursor: !selectedOrgId || isSubmitting ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {isSubmitting
              ? 'Resolving…'
              : `Approve ${lineItems.length === 1 ? 'Item' : `All ${lineItems.length}`}`}
          </button>
        </div>

        {/* Error display */}
        {result && !result.success && result.errors.length > 0 && (
          <div style={{
            marginTop: 10,
            padding: '10px 12px',
            background: 'var(--cactus-bloom-bg)',
            border: '0.5px solid var(--cactus-bloom-border)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--cactus-bloom-mid)',
          }}>
            {result.errors.map((err, i) => (
              <div key={i}>· {err}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}