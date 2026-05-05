// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/zone-matrices/actions.ts
// PURPOSE: Server Actions for the DHL eCom Domestic Zones upload flow.
//
// EMPTY-STATE COMMIT: parser not yet wired. The preview action below
// returns an info-flash error when invoked so the operator sees the
// pause-point status. Pause point #2 deliverable per Senior Architect.
//
// When the parser lands (after design review), this file will host:
//   - previewDhlEcomZones (useActionState pattern, multi-file)
//   - commitDhlEcomZones (regular form action, redirects with flash)
// mirroring the coverage-zips/actions.ts shape.
// ==========================================================

'use server'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { initialPreviewState, type PreviewState } from './types'

export async function previewDhlEcomZones(
  _prev: PreviewState,
  _formData: FormData,
): Promise<PreviewState> {
  // Auth gate — always check at action entry.
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      ...initialPreviewState,
      status: 'error',
      errors: ['Not authenticated. Please sign in again.'],
    }
  }

  return {
    ...initialPreviewState,
    status: 'error',
    errors: [
      'Multi-file parser not yet implemented. Pause point #2 (empty-state design review) is the current deliverable; the parser lands in the next commit per docs/session-archives/specs/dhl-ecom-zones-parser-spec.md.',
    ],
  }
}
