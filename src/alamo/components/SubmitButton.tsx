// ==========================================================
// FILE: src/alamo/components/SubmitButton.tsx
// PURPOSE: Shared submit button that surfaces a Server Action's
//   pending state so operators get immediate feedback after click.
//
// Why this exists:
//   Server Actions can take seconds (file uploads, parsing, atomic
//   multi-table writes). A submit button that stays idle-looking
//   during that window invites double-clicks, which can cause
//   integrity issues — duplicated uploads, double-billing, etc.
//   The pattern below is the minimum visual contract for any
//   button that triggers an async server-side operation.
//
// Usage:
//   <form action={someServerAction}>
//     <SubmitButton style={primaryButtonStyle} pendingLabel="Saving…">
//       <Pencil size={12} /> Save entry
//     </SubmitButton>
//   </form>
//
// API:
//   - Children: idle-state contents (typically icon + label).
//   - pendingLabel: string shown next to the spinner when pending.
//   - style: passed through to the <button>. The component overlays
//     opacity/cursor changes when pending.
//   - spinnerSize: size of the Loader2 icon (default 12 to match
//     existing inline icon sizes).
//
// The component reads `useFormStatus().pending` from the enclosing
// <form>. It MUST be rendered inside a form whose `action` is a
// Server Action — useFormStatus only reflects pending state for the
// nearest form ancestor.
//
// See docs/ui-patterns.md Pattern 1 for the full discipline.
// ==========================================================

'use client'

import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'

interface SubmitButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Idle-state contents — typically an icon followed by a text label. */
  children: ReactNode
  /** Text shown next to the spinner while the action is pending. */
  pendingLabel: string
  /** Inline style for the button. The component overlays opacity/cursor when pending. */
  style?: CSSProperties
  /** Loader2 icon size. Defaults to 12 to match the existing icon sizes used on Alamo buttons. */
  spinnerSize?: number
}

export function SubmitButton({
  children,
  pendingLabel,
  style,
  spinnerSize = 12,
  ...rest
}: SubmitButtonProps) {
  const { pending } = useFormStatus()

  const mergedStyle: CSSProperties = {
    ...(style ?? {}),
    opacity: pending ? 0.7 : style?.opacity,
    cursor: pending ? 'not-allowed' : style?.cursor ?? 'pointer',
  }

  return (
    <button
      type="submit"
      disabled={pending || rest.disabled}
      aria-busy={pending}
      style={mergedStyle}
      {...rest}
    >
      {pending ? (
        <>
          <Loader2 size={spinnerSize} className="cactus-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  )
}
