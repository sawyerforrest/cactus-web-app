# UI Patterns

**Audience:** Anyone (human or AI assistant) authoring or modifying client-side UI in The Alamo or Cactus Portal.
**Status:** Living document — append a new pattern whenever a UX bug teaches us something non-obvious.
**Read this before:** Adding a new form, button, or interactive control that talks to a Server Action or external API.

---

## Pattern 1: Async submit buttons must show pending state

**Rule:** Any button that triggers a Server Action or other async operation longer than ~250 ms must use the shared `<SubmitButton>` component. Operators must never see an idle-looking button after clicking.

**Why:** Server Actions can take seconds — file parse, atomic multi-table writes, external API calls. A button that doesn't change appearance after click invites double-clicks, which can cause integrity issues: duplicated uploads, double-billing, race-condition writes. A spinner + disabled-look + pending-label is the minimum visual contract.

This pattern was surfaced by the GOFO Regional Coverage commit flow: the atomic dual-table write took ~10 seconds, the button looked idle the whole time, and the operator was tempted to click again.

**How:**

Wrong (the failure mode):
```tsx
<form action={someServerAction}>
  <button type="submit" style={primaryButtonStyle}>
    <CheckCircle2 size={12} /> Commit
  </button>
</form>
```

Right:
```tsx
import { SubmitButton } from '@/components/SubmitButton'

<form action={someServerAction}>
  <SubmitButton style={primaryButtonStyle} pendingLabel="Committing…">
    <CheckCircle2 size={12} /> Commit
  </SubmitButton>
</form>
```

`<SubmitButton>` lives at [`src/alamo/components/SubmitButton.tsx`](../src/alamo/components/SubmitButton.tsx). It internally calls `useFormStatus()` to read the pending state of the nearest form ancestor. While pending it renders a spinning `Loader2` icon followed by the `pendingLabel` text, sets `disabled=true`, sets `cursor: not-allowed`, and applies `opacity: 0.7`. After the action completes (or the page navigates), the button re-renders with its idle children.

**API:**
- `children` — idle-state contents, typically icon + label
- `pendingLabel` (required) — short text describing the operation in progress (e.g., "Saving…", "Parsing…", "Committing…", "Fetching…")
- `style` — passed through; the component overlays opacity/cursor when pending
- `spinnerSize` — defaults to 12; set to 10 for compact buttons

**Choosing a pending label.** Hint at the specific operation, not just "Loading…". Examples already in the codebase:

| Action | pendingLabel |
|---|---|
| Save manual diesel entry | `Saving…` |
| Fetch from EIA | `Fetching…` |
| Upload + parse XLSX preview | `Parsing…` |
| Atomic dual-table commit | `Committing…` |
| Save fuel tier edit | `Saving…` |

**Constraint:** `<SubmitButton>` MUST be rendered inside a `<form>` whose `action` attribute is a Server Action. `useFormStatus` only reflects pending state for the nearest form ancestor — outside a form it's always `{ pending: false }`.

**When to bend the rule:** Operations that complete in under 250 ms (a value the user can perceive as instantaneous) don't need a pending state. But err on the side of including it — the cost is a one-line change and the failure mode is real.

---

## How to add a new pattern to this doc

When a UX bug teaches us something the existing patterns don't cover:

1. Add a new `## Pattern N: <one-line summary>` section.
2. Include: Rule (what to do), Why (the failure mode if you don't), How (mechanics with wrong/right code examples), API surface where relevant.
3. Reference the discoveries that motivated it (commit SHA, the bug it solved).
4. Commit alongside the change that surfaced the pattern.

---

## Document history

- **2026-05-05 (v1.10.0):** Initial creation. Pattern 1 from sub-phase 2b GOFO Regional Coverage commit-button bug.
