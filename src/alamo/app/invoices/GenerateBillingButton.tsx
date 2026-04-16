'use client'

// ==========================================================
// FILE: src/alamo/app/invoices/GenerateBillingButton.tsx
// PURPOSE: "Run Weekly Billing" button for the invoices page.
//
// Triggers the billing engine server action that creates
// cactus_invoices from all APPROVED line items, grouped by org.
//
// Only renders when hasApproved = true (passed from server).
// Disables during execution to prevent double-click.
// Shows a result summary card after completion.
// ==========================================================

import { useState } from 'react'
import { runWeeklyBilling, type BillingRunResult } from './actions/generate'

type GenerateBillingButtonProps = {
  hasApproved: boolean
}

export default function GenerateBillingButton({
  hasApproved,
}: GenerateBillingButtonProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<BillingRunResult | null>(null)

  if (!hasApproved && !result) return null

  async function handleRunBilling() {
    setIsRunning(true)
    setResult(null)

    try {
      const billingResult = await runWeeklyBilling()
      setResult(billingResult)
    } catch (err) {
      setResult({
        success: false,
        totalOrgs: 0,
        totalLineItems: 0,
        totalAmount: '0',
        invoicesGenerated: [],
        errors: [err instanceof Error ? err.message : 'Unknown error occurred'],
        reason: 'COMPLETE_FAILURE',
      })
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>

      {/* Action bar */}
      <div style={{
        background: 'var(--cactus-canvas)',
        border: '0.5px solid var(--cactus-border)',
        borderRadius: 8,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <div>
          <div style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--cactus-ink)',
            marginBottom: 2,
          }}>
            Weekly Billing
          </div>
          <div style={{
            fontSize: 12,
            color: 'var(--cactus-muted)',
          }}>
            Generate client invoices from all APPROVED line items across the system.
          </div>
        </div>

        <button
          onClick={handleRunBilling}
          disabled={isRunning || !hasApproved}
          style={{
            flexShrink: 0,
            padding: '8px 20px',
            background: isRunning || !hasApproved
              ? 'var(--cactus-border)'
              : 'var(--cactus-forest)',
            color: isRunning || !hasApproved
              ? 'var(--cactus-muted)'
              : '#ffffff',
            border: '0.5px solid var(--cactus-border)',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            cursor: isRunning || !hasApproved ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
            transition: 'background 0.15s',
          }}
        >
          {isRunning ? 'Running\u2026' : 'Run Weekly Billing'}
        </button>
      </div>

      {/* Result summary */}
      {result && (
        <div style={{
          marginTop: 8,
          padding: '12px 16px',
          background: result.reason === 'NOTHING_TO_BILL'
            ? 'var(--cactus-sand)'
            : result.success
            ? 'var(--cactus-mint)'
            : 'var(--cactus-bloom-bg)',
          border: `0.5px solid ${
            result.reason === 'NOTHING_TO_BILL'
              ? 'var(--cactus-border)'
              : result.success
              ? 'var(--cactus-border)'
              : 'var(--cactus-bloom-border)'
          }`,
          borderRadius: 8,
          fontSize: 13,
        }}>

          {/* Nothing to bill state */}
          {result.reason === 'NOTHING_TO_BILL' && (
            <div style={{
              fontWeight: 500,
              color: 'var(--cactus-muted)',
            }}>
              Nothing to bill — no APPROVED line items found.
            </div>
          )}

          {/* Success state */}
          {result.success && result.reason !== 'NOTHING_TO_BILL' && (
            <>
              <div style={{
                fontWeight: 500,
                color: result.reason === 'PARTIAL_FAILURE'
                  ? 'var(--cactus-amber)'
                  : 'var(--cactus-forest)',
                marginBottom: 8,
              }}>
                {result.reason === 'PARTIAL_FAILURE'
                  ? 'Billing complete with errors'
                  : 'Billing complete'}
              </div>

              {/* Summary stats */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
                marginBottom: 12,
              }}>
                {[
                  { label: 'Orgs Billed', value: result.totalOrgs },
                  { label: 'Line Items', value: result.totalLineItems },
                  { label: 'Total Amount', value: `$${result.totalAmount}` },
                ].map((stat) => (
                  <div key={stat.label}>
                    <div style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: 'var(--cactus-muted)',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      marginBottom: 2,
                    }}>
                      {stat.label}
                    </div>
                    <div style={{
                      fontSize: 18,
                      fontWeight: 500,
                      color: 'var(--cactus-ink)',
                    }}>
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Per-org breakdown */}
              <div style={{
                borderTop: '0.5px solid var(--cactus-border)',
                paddingTop: 10,
              }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--cactus-muted)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}>
                  Invoices Generated
                </div>
                {result.invoicesGenerated.map((inv) => (
                  <div
                    key={inv.invoiceId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '4px 0',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ color: 'var(--cactus-ink)' }}>
                      {inv.orgName}
                      <span style={{
                        color: 'var(--cactus-muted)',
                        marginLeft: 8,
                      }}>
                        {inv.lineItems} {inv.lineItems === 1 ? 'item' : 'items'}
                      </span>
                    </div>
                    <div style={{
                      fontWeight: 500,
                      color: 'var(--cactus-forest)',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      ${inv.amount}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Complete failure state */}
          {!result.success && result.reason !== 'NOTHING_TO_BILL' && (
            <div style={{
              fontWeight: 500,
              color: 'var(--cactus-bloom)',
            }}>
              Billing run failed
            </div>
          )}

          {/* Errors */}
          {result.errors.length > 0 && (
            <div style={{
              borderTop: result.success
                ? '0.5px solid var(--cactus-border)'
                : 'none',
              paddingTop: result.success ? 10 : 8,
              marginTop: result.success ? 10 : 0,
            }}>
              <div style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--cactus-bloom)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}>
                Errors
              </div>
              {result.errors.map((err, i) => (
                <div key={i} style={{
                  fontSize: 12,
                  color: 'var(--cactus-bloom-mid)',
                  marginBottom: 2,
                }}>
                  {'\u00B7'} {err}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
