// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/rate-cards/actions.ts
// PURPOSE: Server Actions for the Rate Cards upload flows.
//
// PAUSE 2 SCOPE: parser-stub action only. The real parse → stage →
// preview → commit pipeline lands at Pause 3+. The stub validates
// minimal form shape (file selected, .xlsx extension, ≤25MB) and
// returns a "parser-not-yet-implemented" error so the operator sees
// the form posts cleanly before the real parsers wire in.
//
// One Server Action handles all five scopes; per-mode/per-fulfillment
// branching will live in the action body once the real parsers ship.
// ==========================================================

'use server'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  initialParseStubState,
  type ParseStubState,
} from './types'

export async function parseRateCardStub(
  _prev: ParseStubState,
  formData: FormData,
): Promise<ParseStubState> {
  // Auth — not strictly required for a stub, but matches the pattern
  // every real Server Action will use so the contract doesn't shift
  // between Pause 2 and Pause 3.
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      ...initialParseStubState,
      status: 'error',
      error: 'Not authenticated. Please sign in again.',
    }
  }

  const fileEntry = formData.get('file')
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null

  if (!file) {
    return {
      ...initialParseStubState,
      status: 'error',
      error: 'No file selected. Pick a rate-card .xlsx before clicking Parse.',
    }
  }
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return {
      ...initialParseStubState,
      status: 'error',
      error: `File "${file.name}" is not a .xlsx. Only .xlsx accepted.`,
    }
  }
  if (file.size > 25 * 1024 * 1024) {
    return {
      ...initialParseStubState,
      status: 'error',
      error: `File "${file.name}" exceeds 25MB. Verify the upload is a rate-card workbook.`,
    }
  }

  return {
    ...initialParseStubState,
    status: 'error',
    error: `Parser not yet implemented. File "${file.name}" (${file.size.toLocaleString('en-US')} bytes) accepted; real per-carrier parsers land at Pause 3.`,
  }
}
