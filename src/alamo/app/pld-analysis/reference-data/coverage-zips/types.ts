// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/coverage-zips/types.ts
// PURPOSE: Plain (non-'use server') module for shared types and the
// initial-state constant used by UploadForm's useActionState hook.
//
// Why this file exists separately from actions.ts:
//   actions.ts has a top-level `'use server'` directive, which marks
//   every export as a server action. Non-function exports from such a
//   module aren't reliably available in client component imports — the
//   bundler can resolve them to undefined, which causes runtime
//   "Cannot read properties of undefined" errors when the client
//   component tries to consume them. Keeping types + plain constants in
//   a vanilla module side-steps that entire class of problem.
//
// All fields in initialPreviewState are explicitly populated (empty
// arrays for arrays, null for nullable scalars) so that any consumer
// reading the state on first render gets defined, type-correct values.
// Per PATTERNS.md Pattern 5 sibling rule for client state: never let
// optional-by-omission become optional-by-undefined at render time.
// ==========================================================

import type { ParsedZipRow, ParserSummary } from '@/lib/pld-analysis/gofo-regional-parser'

export type PreviewStatus = 'idle' | 'parsing' | 'preview' | 'error'

export interface PreviewState {
  status: PreviewStatus
  errors: string[]
  warnings: string[]
  summary: ParserSummary | null
  firstTenRows: ParsedZipRow[]
  effectiveDate: string | null
  fileName: string | null
  stagePath: string | null
}

export const initialPreviewState: PreviewState = {
  status: 'idle',
  errors: [],
  warnings: [],
  summary: null,
  firstTenRows: [],
  effectiveDate: null,
  fileName: null,
  stagePath: null,
}
