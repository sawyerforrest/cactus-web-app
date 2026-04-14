'use client'

// ==========================================================
// FILE: src/alamo/app/invoices/[id]/MatchButton.tsx
// PURPOSE: "Run Matching" button for the invoice detail page.
//
// WHY A SEPARATE FILE?
// The invoice detail page (page.tsx) is a Server Component —
// it runs on the server and has no interactivity. Buttons
// with click handlers must live in Client Components
// (marked with 'use client'). Next.js lets you mix them:
// the server component renders the page, and drops in this
// small client component just for the interactive button.
//
// This is the right pattern — keep the client boundary as
// small as possible. Only the button is a client component.
// Everything else (data fetching, layout) stays on the server.
// ==========================================================

import { useState } from 'react'
import { runMatchingEngine, type MatchResult } from './actions/match'

// Props this component receives from the parent page
type MatchButtonProps = {
  invoiceId: string
}

export default function MatchButton({ invoiceId }: MatchButtonProps) {
  // Track whether the engine is currently running
  const [isRunning, setIsRunning] = useState(false)

  // Store the result after the engine completes
  // null = hasn't run yet, MatchResult = completed
  const [result, setResult] = useState<MatchResult | null>(null)

  async function handleRunMatching() {
    setIsRunning(true)
    setResult(null)

    try {
      // Call the server action directly — Next.js handles
      // the network call to the server automatically.
      // We don't need fetch() or an API route.
      const matchResult = await runMatchingEngine(invoiceId)
      setResult(matchResult)
    } catch (err) {
      setResult({
        success: false,
        totalProcessed: 0,
        lassoed: { matched: 0, held: 0, skipped: 0 },
        dark: { matched: 0, flagged: 0 },
        billingCalculated: 0,
        errors: [err instanceof Error ? err.message : 'Unknown error occurred'],
      })
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>

      {/* Action bar — button + description */}
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
            Run Matching Engine
          </div>
          <div style={{
            fontSize: 12,
            color: 'var(--cactus-muted)',
          }}>
            Matches each line item to an org, calculates variance,
            applies markup, and flags disputes for review.
          </div>
        </div>

        <button
          onClick={handleRunMatching}
          disabled={isRunning}
          style={{
            flexShrink: 0,
            padding: '8px 20px',
            background: isRunning
              ? 'var(--cactus-border)'
              : 'var(--cactus-forest)',
            color: isRunning
              ? 'var(--cactus-muted)'
              : '#ffffff',
            border: '0.5px solid var(--cactus-border)',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            cursor: isRunning ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
            transition: 'background 0.15s',
          }}
        >
          {isRunning ? 'Running…' : 'Run Matching'}
        </button>
      </div>

      {/* Result summary — appears after engine completes */}
      {result && (
        <div style={{
          marginTop: 8,
          padding: '12px 16px',
          background: result.success
            ? 'var(--cactus-mint)'
            : 'var(--cactus-bloom-bg)',
          border: `0.5px solid ${result.success
            ? 'var(--cactus-border)'
            : 'var(--cactus-bloom-border)'}`,
          borderRadius: 8,
          fontSize: 13,
        }}>

          {/* Headline */}
          <div style={{
            fontWeight: 500,
            color: result.success
              ? 'var(--cactus-forest)'
              : 'var(--cactus-bloom)',
            marginBottom: 8,
          }}>
            {result.success ? '✓ Matching complete' : '✗ Matching failed'}
          </div>

          {/* Stats grid */}
          {result.success && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 12,
              marginBottom: result.errors.length > 0 ? 12 : 0,
            }}>
              {[
                {
                  label: 'Processed',
                  value: result.totalProcessed,
                  color: 'var(--cactus-ink)',
                },
                {
                  label: 'Auto-matched',
                  value: result.lassoed.matched + result.dark.matched,
                  color: 'var(--cactus-forest)',
                },
                {
                  label: 'Billing calculated',
                  value: result.billingCalculated,
                  color: 'var(--cactus-forest)',
                },
                {
                  label: 'Held for review',
                  value:
                    result.lassoed.held +
                    result.lassoed.skipped +
                    result.dark.flagged,
                  // WHY: Bloom color only when there's actually something held
                  color:
                    result.lassoed.held +
                    result.lassoed.skipped +
                    result.dark.flagged > 0
                      ? 'var(--cactus-bloom)'
                      : 'var(--cactus-ink)',
                },
              ].map(stat => (
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
                    color: stat.color,
                  }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Non-fatal errors — shown when matching ran but had issues */}
          {result.errors.length > 0 && (
            <div style={{
              borderTop: result.success
                ? '0.5px solid var(--cactus-border)'
                : 'none',
              paddingTop: result.success ? 10 : 0,
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
                  · {err}
                </div>
              ))}
            </div>
          )}

          {/* Prompt to review disputes if any were held */}
          {result.success &&
            result.lassoed.held + result.lassoed.skipped + result.dark.flagged > 0 && (
            <div style={{
              borderTop: '0.5px solid var(--cactus-border)',
              paddingTop: 10,
              marginTop: 10,
              fontSize: 12,
              color: 'var(--cactus-muted)',
            }}>
              Some line items require manual review.{' '}
              {/* This link will go to the disputes page once built */}
              <span style={{ color: 'var(--cactus-bloom)', fontWeight: 500 }}>
                Disputes review coming next.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}