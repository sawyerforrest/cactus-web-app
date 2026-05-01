# Phase A.0 — Cactus Portal Foundation Spec

**Version:** 1.0.0
**Date:** 2026-04-30
**Author:** Sawyer + Claude (architecture session)
**For:** Claude Code execution
**Estimated build time:** 5–7 days of focused solo work
**Predecessor:** Session D.1 (dark-path adjustment-only fix, merged 2026-04-27)
**Successor:** Phase A.1 (Stripe Payment Method Capture)

---

## 1. Purpose

Establish the foundation for the client-facing Cactus Portal. This phase delivers four pages (login, dashboard, invoices list/detail, payment methods UI shell), the routing and authentication infrastructure that supports both The Alamo (admin) and the Portal (clients) under a single Next.js app deployed to two subdomains, and the schema/auth changes required to distinguish Cactus internal admins from client portal users.

This phase does **NOT** include:

- Stripe SDK integration or Payment Element wiring (that is Phase A.1)
- Auto-debit pipeline (that is Phase A.2)
- Real-time tracking dashboards
- Claims management
- Analytics dashboards
- User management (multi-user-per-org)
- Notification preferences UI
- Email sending infrastructure (Resend wiring deferred to A.1 alongside Stripe webhooks)

Scope is intentionally minimal. Three clients are onboarding in May; this is the spine they need to see and the foundation we'll build A.1 and A.2 onto.

---

## 2. Prerequisites & assumptions

Before starting Phase A.0, verify the following are true. Halt and surface to Sawyer if any are not.

### 2.1 Verified state

- The Alamo lives under `src/alamo/` in the `cactus-web-app` repo, deployed to Vercel
- Cactus brand domain `cactus-logistics.com` is in active use for the marketing site (separate Vercel project, separate repo `cactus-marketing`)
- Supabase project `wfzscshukatnxlnebstj` (Cactus: Logistics OS) is the live database
- 19 tables exist in `public` schema per Section 10 of the master briefing
- `org_users` table has 0 rows — no user-to-org mapping exists yet for any user
- `organizations` table has 4 rows — one of these will be designated as the Cactus internal org
- Next.js 16 conventions in use: `proxy.ts` (not `middleware.ts`), function named `proxy`
- Supabase Auth handles authentication; The Alamo currently uses a single shared admin login pattern without per-user org scoping
- Sawyer has access to Vercel project settings to add subdomains
- Sawyer has access to the DNS provider (Squarespace, per briefing) for `cactus-logistics.com` to add CNAME records

### 2.2 Decisions locked in this spec

The following decisions have been made and should not be relitigated during execution:

- **Single Next.js app**, not separate apps. Route groups for organizational separation.
- **Two subdomains**: `alamo.cactus-logistics.com` (admin) and `portal.cactus-logistics.com` (clients)
- **Login page lives at `portal.cactus-logistics.com/login`** as the more public surface. After login, admins redirect to `alamo.cactus-logistics.com/dashboard`; clients stay on portal.
- **Cactus internal admin identification**: membership in a single designated "Cactus Logistics LLC" org row in the `organizations` table determines admin status. No new schema column needed for role distinction at the user level.
- **Auth cookies scoped to `.cactus-logistics.com`** so they carry across both subdomains.
- **`portal_role_enum` (ADMIN, FINANCE, STANDARD) remains the per-org client role enum.** It is unrelated to Cactus internal admin status. A user IS a Cactus admin iff they belong to the Cactus internal org via an `org_users` row.

---

## 3. Architectural overview

### 3.1 Repository structure

The existing `cactus-web-app` repo expands from a single-surface Alamo app into a two-surface app with route groups:

```
cactus-web-app/
├── src/
│   ├── app/                       # Next.js App Router root
│   │   ├── (alamo)/               # Admin route group
│   │   │   ├── layout.tsx         # Alamo layout (existing sidebar, etc.)
│   │   │   ├── dashboard/
│   │   │   ├── carriers/
│   │   │   ├── invoices/
│   │   │   ├── billing/
│   │   │   └── ...                # All existing Alamo pages move here
│   │   ├── (portal)/              # Client route group (NEW)
│   │   │   ├── layout.tsx         # Portal layout
│   │   │   ├── dashboard/
│   │   │   ├── invoices/
│   │   │   └── payment-methods/
│   │   ├── (public)/              # Shared public pages (NEW)
│   │   │   └── login/
│   │   ├── api/                   # Existing API routes
│   │   ├── proxy.ts               # Host-based + role-based middleware (NEW)
│   │   ├── globals.css
│   │   └── layout.tsx             # Root layout (minimal)
│   ├── lib/
│   │   ├── supabase/              # Supabase client setup
│   │   │   ├── browser-client.ts  # createBrowserClient — 'use client' only
│   │   │   ├── server-client.ts   # createServerClient — Server Components / Route Handlers
│   │   │   └── admin-client.ts    # Service role client — server-side only
│   │   ├── auth/
│   │   │   ├── get-current-user.ts        # Returns { authUser, orgUser, isCactusAdmin }
│   │   │   ├── require-cactus-admin.ts    # Throws redirect if not admin
│   │   │   ├── require-portal-user.ts     # Throws redirect if not authenticated
│   │   │   └── constants.ts               # CACTUS_INTERNAL_ORG_ID, etc.
│   │   ├── address.ts             # Existing — keep
│   │   └── ...
│   └── components/
│       ├── shared/                # Used by both surfaces (logo, etc.)
│       ├── alamo/                 # Alamo-only components
│       └── portal/                # Portal-only components (NEW)
├── database/migrations/
│   └── v1.8.0-portal-foundation.sql      # Adds is_cactus_internal flag (NEW)
├── docs/
│   └── session-archives/specs/
│       └── cactus-phase-a0-portal-foundation-spec.md   # This file
└── ...
```

**Migration steps for the existing Alamo code**:

1. The current Alamo code under `src/alamo/app/` moves into `src/app/(alamo)/`
2. The current `src/alamo/lib/` moves into `src/lib/` (shared) — most of it is used by the Alamo only today, but keeping it in `src/lib/` makes it accessible to portal code if needed later
3. The current `src/alamo/components/` splits: shared things move to `src/components/shared/`, Alamo-specific things move to `src/components/alamo/`
4. The current `src/alamo/package.json` likely stays as-is at the project root (not nested) — confirm before moving

This is a non-trivial reorganization. **HALT POINT 1**: confirm with Sawyer before executing the file moves. The reorganization should be a single commit, not interleaved with new feature work, so the diff is reviewable.

### 3.2 Routing & host-based middleware

The `proxy.ts` file at `src/app/proxy.ts` is the routing brain. Per Next.js 16 conventions, it exports a function named `proxy`.

**Host detection logic:**

```typescript
// pseudocode — final implementation may differ
export function proxy(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const path = request.nextUrl.pathname

  const isAlamoHost = host === 'alamo.cactus-logistics.com'
  const isPortalHost = host === 'portal.cactus-logistics.com'
  const isLocalDev = host.startsWith('localhost')

  // Local dev: allow access to any route group via path prefix
  if (isLocalDev) {
    return NextResponse.next()
  }

  // Production: rewrite paths based on host
  if (isAlamoHost) {
    // Rewrite `/dashboard` to `/(alamo)/dashboard` internally
    // Block any path that starts with /portal
    if (path.startsWith('/portal')) {
      return NextResponse.redirect('https://portal.cactus-logistics.com' + path.replace('/portal', ''))
    }
    return NextResponse.rewrite(new URL(`/(alamo)${path}`, request.url))
  }

  if (isPortalHost) {
    if (path.startsWith('/alamo')) {
      return NextResponse.redirect('https://alamo.cactus-logistics.com' + path.replace('/alamo', ''))
    }
    return NextResponse.rewrite(new URL(`/(portal)${path}`, request.url))
  }

  // Unknown host — show login or 404
  return NextResponse.rewrite(new URL('/(public)/login', request.url))
}
```

**Role enforcement** runs in `proxy.ts` after host detection:

- If the path is in the Alamo route group AND the user is not a Cactus admin → redirect to portal dashboard
- If the path is in the Portal route group AND the user is not authenticated → redirect to login
- If the user is authenticated but their org has no records yet → show "Account being set up" page (Phase A.0 won't have many such cases; punt to a simple message)

**Login page is exempt from auth enforcement** — it's the entry point.

**Local development convention**: developers access either surface via path prefix at `localhost:3000`:
- `localhost:3000/alamo/dashboard` → Alamo admin
- `localhost:3000/portal/dashboard` → Portal client
- `localhost:3000/login` → shared login

This avoids needing local DNS overrides like `/etc/hosts` entries. The proxy detects `localhost` and skips host-based rewriting.

### 3.3 Auth cookie configuration

For SSO across `alamo.` and `portal.` subdomains, Supabase Auth cookies must be scoped to the parent domain `.cactus-logistics.com` (note the leading dot). This is configured in the Supabase client setup:

```typescript
// src/lib/supabase/server-client.ts (sketch)
createServerClient(url, anonKey, {
  cookies: { /* getter / setter as usual */ },
  cookieOptions: {
    domain: process.env.NODE_ENV === 'production' ? '.cactus-logistics.com' : undefined,
    secure: true,
    sameSite: 'lax',
  },
})
```

Without this, a user logging in via portal and being redirected to alamo would land unauthenticated. Test thoroughly across both subdomains before declaring auth complete.

---

## 4. Schema changes

### 4.1 Migration v1.8.0 — `portal-foundation.sql`

A single migration adds a flag to identify the Cactus internal organization. This is intentionally minimal — no new tables, no new columns on `org_users`.

```sql
-- Migration v1.8.0-portal-foundation.sql
-- Adds is_cactus_internal flag to organizations.
-- A user IS a Cactus admin if they belong to an organization where is_cactus_internal = TRUE.

BEGIN;

ALTER TABLE organizations
  ADD COLUMN is_cactus_internal BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN organizations.is_cactus_internal IS
  'TRUE for the Cactus Logistics LLC internal org. Members of this org via org_users are Cactus admins with full Alamo access. Should be TRUE for exactly one org row.';

-- Add a partial unique index to enforce "at most one internal org"
CREATE UNIQUE INDEX organizations_one_cactus_internal_idx
  ON organizations (is_cactus_internal)
  WHERE is_cactus_internal = TRUE;

-- Verification block
DO $$
DECLARE
  internal_count INT;
BEGIN
  SELECT COUNT(*) INTO internal_count
  FROM organizations
  WHERE is_cactus_internal = TRUE;

  IF internal_count > 1 THEN
    RAISE EXCEPTION 'More than one organization marked is_cactus_internal — migration aborted';
  END IF;
END $$;

COMMIT;
```

### 4.2 Manual data step (post-migration)

After migration applies cleanly, identify which of the 4 existing `organizations` rows is the Cactus internal entity and set the flag.

**HALT POINT 2**: surface the 4 org rows to Sawyer for confirmation before flipping the flag. Query to run:

```sql
SELECT id, name, org_type, parent_org_id, created_at
FROM organizations
ORDER BY created_at;
```

Sawyer identifies the correct row and provides the UUID. Then:

```sql
UPDATE organizations
SET is_cactus_internal = TRUE
WHERE id = '<UUID Sawyer provided>';
```

If none of the existing rows is "Cactus Logistics LLC" as the internal entity (i.e., the existing rows are all test orgs and the actual internal org doesn't exist yet), insert a new row first:

```sql
INSERT INTO organizations (name, org_type, terms_days, is_active, is_cactus_internal)
VALUES ('Cactus Logistics LLC', '3PL', 7, TRUE, TRUE);
```

The choice of `org_type = '3PL'` is debatable — Cactus is the operator, not a 3PL — but the enum has no "INTERNAL" value and adding one is more invasive than necessary. `3PL` is functionally accurate and avoids enum churn. If Sawyer prefers, add a new enum value in a follow-up migration.

### 4.3 Sawyer's user record

After the internal org exists and is flagged, create the `org_users` row that makes Sawyer a Cactus admin.

**HALT POINT 3**: this requires Sawyer's `auth.users.id` (his Supabase Auth user UUID). Surface a query for Sawyer to run in Supabase Studio:

```sql
SELECT id, email FROM auth.users WHERE email = 'sawyer@cactus-logistics.com';
```

Sawyer provides the UUID. Then:

```sql
INSERT INTO org_users (org_id, user_id, role)
VALUES (
  (SELECT id FROM organizations WHERE is_cactus_internal = TRUE),
  '<Sawyer's auth.users.id>',
  'ADMIN'
);
```

After this, Sawyer is a Cactus admin and the auth flow can recognize him on next login.

### 4.4 RLS policies

Enable and configure RLS so portal users can only read their own org's data, and Cactus admins can read everything. The exact policies depend on which tables the portal will read from in A.0.

**Tables the portal reads in A.0**:
- `organizations` (for "Welcome, [Org Name]" header)
- `cactus_invoices` (invoices list and detail)
- `cactus_invoice_line_items` (invoice detail line items)
- `invoice_line_items` (invoice detail line items, joined via cactus_invoice_line_items)
- `org_users` (auth flow needs to read this for the current user)

**Tables the portal does NOT read in A.0**:
- `shipment_ledger`, `shipment_events` (no tracking dashboard yet)
- `carrier_invoices`, `org_carrier_accounts`, `rate_cards` (admin-only data)
- `meters`, `meter_transactions` (no USPS clients yet)
- `notification_preferences` (no UI in A.0)
- `audit_logs`, `rate_shop_log`, `carrier_invoice_mappings`, `carrier_invoice_formats`, `carrier_charge_routing` (admin-only)
- `locations` (read by Alamo only in A.0; portal location management deferred)

**Policy pattern for portal-readable tables**:

```sql
-- Example: cactus_invoices SELECT policy for portal users
CREATE POLICY "portal_users_read_own_org_invoices"
  ON cactus_invoices
  FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM org_users WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM org_users ou
      JOIN organizations o ON o.id = ou.org_id
      WHERE ou.user_id = auth.uid() AND o.is_cactus_internal = TRUE
    )
  );
```

The pattern: a row is readable if the requesting user belongs to the row's org, OR the requesting user belongs to the Cactus internal org (admins see everything).

**HALT POINT 4**: before applying RLS policies, verify with Sawyer that the existing Alamo functionality won't break. The Alamo currently accesses tables via the Supabase service role client (`admin-client.ts`), which bypasses RLS. Verify this is true throughout the Alamo before enabling stricter RLS — otherwise admin pages could break unexpectedly.

Apply policies for each table the portal needs. Do this in a separate migration (`v1.8.1-portal-rls-policies.sql`) so it can be rolled back independently if issues surface.

---

## 5. Page-by-page specifications

### 5.1 Login page — `(public)/login`

**Path**: `portal.cactus-logistics.com/login` (and `alamo.cactus-logistics.com/login` redirects here)

**Visual design**: Adapt the existing Alamo login page (`src/alamo/app/login/page.tsx` per briefing Section 12) with two changes:
- Header text changes from "—— THE ALAMO ——" to a neutral "—— CACTUS LOGISTICS ——" (forest green, bold, flanking rules unchanged)
- Background, card, stallion icon, "Logistics with Soul." footer all unchanged

**Behavior**:
- Email + password form
- On submit: call Supabase Auth `signInWithPassword`
- On success: query `org_users` for the authenticated user's row
  - If user belongs to the Cactus internal org → `window.location.href = 'https://alamo.cactus-logistics.com/dashboard'`
  - Else → `router.push('/dashboard')` (stays on portal subdomain)
  - If no `org_users` row exists for the user → show error: "Your account is being set up. Please contact your administrator."
- On error: show error message inline (existing Alamo error handling pattern)

**Files to create/modify**:
- `src/app/(public)/login/page.tsx` (new — adapted from Alamo login)
- `src/app/(public)/login/actions.ts` (new — login server action with role detection and redirect)
- `src/components/shared/CactusLogo.tsx` (move from existing Alamo location to shared)

**Acceptance criteria**:
- Loads at both `portal.cactus-logistics.com/login` and `alamo.cactus-logistics.com/login` (the latter redirects to portal)
- Successful login as Sawyer redirects to `alamo.cactus-logistics.com/dashboard`
- Successful login as a portal user redirects to `portal.cactus-logistics.com/dashboard`
- Failed login shows clear error inline, doesn't navigate
- Visual matches existing Alamo login aesthetics (forest green, desert dunes, stallion, mono header)

### 5.2 Portal dashboard — `(portal)/dashboard`

**Path**: `portal.cactus-logistics.com/dashboard`

**Visual design**: Minimal but branded. Forest green header bar with Cactus logo left and the org's name centered ("Welcome, MarketSculpt"). Sand background. Card-based layout for content blocks.

**Content blocks (top to bottom)**:

1. **Welcome card** — "Welcome to Cactus, [Org Name]." Brief paragraph: "Your Cactus account is now active. Use the navigation to view invoices and manage payment methods."
2. **Quick stats card** — three stats with large numbers and small labels:
   - "Open invoices: [count of cactus_invoices where status = 'UNPAID' OR 'FAILED']"
   - "Total outstanding: [SUM of total_amount where status = 'UNPAID' OR 'FAILED']"
   - "Payment methods on file: 0" (hardcoded for A.0; A.1 wires it up)
3. **Recent activity card** — list up to 5 most recent `cactus_invoices` for this org, sorted by created_at DESC. Each row shows: invoice period, total amount, status badge, "View" link.
4. **Need help? card** — single line: "Questions? Contact sawyer@cactus-logistics.com"

**Files to create**:
- `src/app/(portal)/layout.tsx` — portal sidebar + header layout
- `src/app/(portal)/dashboard/page.tsx` — dashboard server component
- `src/components/portal/PortalSidebar.tsx` — sidebar (Dashboard, Invoices, Payment Methods, Sign Out)
- `src/components/portal/StatsCard.tsx` — reusable stats card component

**Acceptance criteria**:
- Page renders for an authenticated portal user (e.g., a test user belonging to MarketSculpt's org)
- Displays the correct org name from the `organizations` table
- Open invoice count and outstanding total query correctly with RLS in place
- Recent activity shows the right invoices for the org and only that org
- Cactus admins navigating directly to `portal.cactus-logistics.com/dashboard` without an impersonation token see an error or are redirected back to alamo dashboard (impersonation flow comes in 5.6)
- Sidebar is fixed-position (200px wide) consistent with Alamo pattern from briefing Section 12

### 5.3 Portal invoices list — `(portal)/invoices`

**Path**: `portal.cactus-logistics.com/invoices`

**Behavior**: Read-only list of all `cactus_invoices` for the user's org.

**Filters at top of page body** (per Cactus UI standard from memories: search + filter components at the top of the page body for all list/report pages):
- Date range FROM/TO on `billing_period_start`
- Status filter: ALL / UNPAID / PAID / FAILED / VOID
- Export CSV button (exports the filtered invoice list — a simple summary CSV with one row per invoice)

**Table columns**:
- Invoice period (e.g., "Apr 21–27, 2026")
- Total amount
- Due date
- Status (color-coded badge: UNPAID = amber, PAID = forest, FAILED = bloom, VOID = neutral)
- Action: "View" link to detail page

**Files to create**:
- `src/app/(portal)/invoices/page.tsx` — server component fetching invoices
- `src/components/portal/PortalInvoiceFilters.tsx` — filter UI (model on existing Alamo `InvoiceFilters.tsx`)
- `src/components/portal/PortalInvoicesTable.tsx` — table component

**Acceptance criteria**:
- Lists only invoices for the authenticated user's org (verified via RLS test — try to query another org's invoice and confirm it returns nothing)
- Filters work client-side, no page reloads
- Export CSV downloads a file named `cactus-invoices-{org-slug}-{YYYYMMDD}.csv`
- Status badges use the brand colors per design system (Forest #2D5A27, Amber #D97706, Bloom #D81B7A)
- Empty state: when no invoices exist, show "No invoices yet. Your first invoice will appear here once your shipping activity is processed."

### 5.4 Portal invoice detail — `(portal)/invoices/[id]`

**Path**: `portal.cactus-logistics.com/invoices/[id]`

**Behavior**: Read-only detail view of a single `cactus_invoice` with line items and download buttons.

**Page sections**:

1. **Header**: Invoice period, due date (forest green bold), status badge, total amount due (large, right-aligned)
2. **Summary by carrier**: Shipment count and amount per carrier (similar to existing Alamo PDF summary)
3. **Summary by origin location**: Shipment count and amount per location (capped at 12, "+ N more" overflow)
4. **Download buttons**: "Download PDF" and "Download CSV" — wire up to existing Alamo generators at `src/alamo/app/billing/[id]/actions/pdf.ts` and `csv.ts` (paths will move with the reorg in 3.1)
5. **Payment status section**: For UNPAID invoices, "Payment will be automatically collected on the due date via your payment method on file." (placeholder text; A.1/A.2 wire this up). For PAID invoices, show paid date.

**Important display rule** (from briefing Section 12, financial rules):
- Lassoed account lines: show ONLY `final_billed_rate` (never `carrier_charge`)
- Dark account lines: show both `carrier_charge` and `final_billed_rate`
- This is per-line-item, looked up via the `org_carrier_account_id` join on each line item to determine `carrier_account_mode`

**Files to create**:
- `src/app/(portal)/invoices/[id]/page.tsx` — server component
- `src/app/(portal)/invoices/[id]/DownloadPDFButton.tsx` — adapted from existing Alamo button
- `src/app/(portal)/invoices/[id]/DownloadCSVButton.tsx` — same
- `src/app/api/portal/invoices/[id]/pdf/route.ts` — protected API route (checks user belongs to invoice's org before generating)
- `src/app/api/portal/invoices/[id]/csv/route.ts` — same

**Acceptance criteria**:
- Renders correctly for an invoice belonging to the user's org
- Returns 404 for an invoice belonging to a different org (RLS enforced — do NOT rely on the URL knowledge to leak existence)
- PDF download produces the same one-page summary the Alamo currently generates
- CSV download produces the existing 9-column format (85-column format is a separate Session B.2 deliverable; do NOT block A.0 on it)
- Display rules honored per carrier_account_mode

### 5.5 Portal payment methods page — `(portal)/payment-methods`

**Path**: `portal.cactus-logistics.com/payment-methods`

**Behavior in A.0**: UI shell only. NO Stripe wiring. NO Payment Element. NO `client_payment_methods` table queries (table doesn't exist yet — created in A.1).

**Page content**:

1. Header: "Payment Methods"
2. Empty state placeholder card: "Payment method capture is being finalized. You'll be notified by email when you can add your payment details."
3. Below that, an explanatory paragraph: "Cactus accepts ACH bank transfers and major credit cards. Per the Payment Authorization Agreement you signed, debits will be processed weekly on Fridays based on the previous week's shipping activity. ACH is preferred and free of processing fees. Credit card transactions incur a 3% processing fee."

**Why build this now if it's empty**: it establishes the route, the navigation entry, the layout, and the visual pattern. Phase A.1 fills it in. Clients clicking "Payment Methods" before A.1 ships should land on a page that explains what's coming, not a 404.

**Files to create**:
- `src/app/(portal)/payment-methods/page.tsx` — placeholder server component

**Acceptance criteria**:
- Page renders with the placeholder content
- Sidebar nav item "Payment Methods" is active when on this page
- No console errors, no Stripe SDK imports

### 5.6 Admin impersonation flow — `(alamo)/orgs/[id]` enhancement

**Goal**: Allow Sawyer to view a client's portal as if he were that client, for QA and screen-share purposes.

**Scope in A.0**: minimal but functional. Full impersonation infrastructure (signed tokens, expiration, audit logging) is appropriate for A.0 because the security boundary matters even with three clients.

**Implementation sketch**:

1. On `(alamo)/orgs/[id]/page.tsx`, add a button: "View Portal as [Org Name]"
2. Button calls a server action `createImpersonationToken(orgId)`:
   - Verifies the requesting user is a Cactus admin
   - Generates a short-lived signed JWT (30 minutes, single-use) containing the target org_id and the admin's user_id
   - Stores the token's jti (JWT ID) in a new `impersonation_tokens` table with `consumed_at` initially NULL
   - Returns the token
3. Button opens new tab to `https://portal.cactus-logistics.com/dashboard?impersonation_token=<token>`
4. Portal middleware (or a portal-side route handler) detects the `impersonation_token` query param:
   - Verifies the token signature and expiration
   - Verifies the token's jti is unconsumed in `impersonation_tokens` table
   - Marks the token consumed
   - Sets a session cookie `cactus_impersonating_org_id = <target org_id>` (also scoped to `.cactus-logistics.com`, short-lived, secure, httpOnly)
   - Writes an `audit_logs` entry: `action_type = 'IMPERSONATION_STARTED'`, `entity_type = 'organizations'`, `entity_id = target org_id`, `user_id = admin's user_id`, metadata includes IP
   - Strips the query param and redirects to `/dashboard`
5. All portal queries during impersonation use the impersonation cookie's org_id rather than the admin's own org_users record
6. Visible banner across top of every portal page during impersonation: "VIEWING AS [ORG NAME] — Exit impersonation" in Bloom (#D81B7A) text
7. "Exit impersonation" button clears the cookie, writes another audit log entry (`IMPERSONATION_ENDED`), and redirects back to `https://alamo.cactus-logistics.com/orgs/[id]`

**New schema for impersonation**:

```sql
-- Add to v1.8.0-portal-foundation.sql
CREATE TABLE impersonation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jti TEXT NOT NULL UNIQUE,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  target_org_id UUID NOT NULL REFERENCES organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX impersonation_tokens_jti_idx ON impersonation_tokens (jti);
CREATE INDEX impersonation_tokens_admin_user_id_idx ON impersonation_tokens (admin_user_id);
```

**Files to create**:
- `src/lib/auth/impersonation.ts` — token creation, verification, consumption
- `src/app/(alamo)/orgs/[id]/ImpersonationButton.tsx` — button component
- `src/app/(alamo)/orgs/[id]/actions/create-impersonation-token.ts` — server action
- `src/components/portal/ImpersonationBanner.tsx` — banner shown on every portal page during impersonation
- `src/app/(portal)/api/impersonation/exit/route.ts` — exit endpoint

**Acceptance criteria**:
- Sawyer logs into Alamo, navigates to MarketSculpt's org page, clicks "View Portal as MarketSculpt"
- New tab opens at `portal.cactus-logistics.com/dashboard` showing MarketSculpt's data with a clear banner
- Sawyer can navigate the portal seeing only MarketSculpt's data
- Sawyer clicks "Exit impersonation" → returned to Alamo org page, no longer impersonating
- Audit logs show both START and END events
- Token cannot be re-used (consumed_at prevents replay)
- Token expires after 30 minutes
- Non-admin users attempting to call the create-impersonation server action get a 403

---

## 6. Vercel & DNS configuration

These steps happen outside the codebase but are required for the build to function in production.

### 6.1 Vercel domain configuration

In the Vercel dashboard for the `cactus-web-app` project (the one hosting The Alamo today):

1. **Settings → Domains**
2. Add domain: `alamo.cactus-logistics.com`
3. Add domain: `portal.cactus-logistics.com`
4. Vercel will display the required DNS records for each domain (CNAME to `cname.vercel-dns.com` typically)

### 6.2 DNS configuration (Squarespace)

In Squarespace DNS settings for `cactus-logistics.com`:

1. Add CNAME record: `alamo` → `cname.vercel-dns.com`
2. Add CNAME record: `portal` → `cname.vercel-dns.com`
3. Wait for DNS propagation (usually under an hour, can be up to 24)

Verify via `dig alamo.cactus-logistics.com` and `dig portal.cactus-logistics.com` once propagated. Vercel will mark each domain "Valid Configuration" in the dashboard once it sees the DNS.

### 6.3 SSL certificates

Vercel provisions Let's Encrypt certificates automatically for both subdomains. No manual configuration needed.

### 6.4 Environment variables

No new environment variables are added in A.0. The existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are reused. A.1 will add Stripe variables.

**HALT POINT 5**: confirm with Sawyer that Vercel and DNS configuration are completed before deploying. The code can deploy without DNS pointed correctly, but it will be reachable only via the existing domain until DNS propagates.

---

## 7. Build sequence

Recommended order of operations for Claude Code execution:

**Day 1 — Foundation (no user-visible changes)**
1. Repository reorganization (HALT POINT 1)
2. Migration v1.8.0 with `is_cactus_internal` flag and impersonation tokens table
3. Identify and flag the Cactus internal org (HALT POINT 2)
4. Create Sawyer's `org_users` row (HALT POINT 3)
5. Verify The Alamo still works after reorganization (zero behavior changes expected)

**Day 2 — Auth infrastructure**
6. `proxy.ts` with host detection and route group rewriting
7. Auth helpers in `src/lib/auth/`
8. Cookie scoping for `.cactus-logistics.com`
9. Local dev: verify both surfaces accessible via path prefixes at localhost:3000

**Day 3 — Login page + portal layout**
10. Shared login page at `(public)/login`
11. Login server action with role-based redirect
12. Portal layout (`(portal)/layout.tsx`) with sidebar
13. Portal dashboard page (skeleton with stats cards)

**Day 4 — Portal invoices**
14. Portal invoices list page with filters
15. Portal invoice detail page
16. Wire up PDF/CSV downloads through portal-protected API routes
17. RLS policies for `cactus_invoices`, `cactus_invoice_line_items`, `invoice_line_items` (HALT POINT 4)

**Day 5 — Payment methods placeholder + impersonation**
18. Payment methods placeholder page
19. Impersonation token creation and verification
20. Impersonation button in Alamo org page
21. Impersonation banner in portal layout
22. Audit logging for impersonation events

**Day 6 — Vercel/DNS + end-to-end testing**
23. Vercel domain configuration (HALT POINT 5)
24. DNS records added at Squarespace
25. End-to-end test scenarios from Section 9

**Day 7 — Buffer for unexpected issues, polish, documentation update**

---

## 8. Halt points summary

Five points where Claude Code must stop and surface to Sawyer before proceeding:

| # | Section | What requires confirmation |
|---|---------|---------------------------|
| 1 | 3.1 | Repository reorganization plan and timing |
| 2 | 4.2 | Which existing org row should be flagged as Cactus internal (or insert new) |
| 3 | 4.3 | Sawyer's `auth.users.id` to create his `org_users` admin record |
| 4 | 4.4 | RLS policies — verify Alamo uses service-role client throughout before applying |
| 5 | 6.4 | Vercel and DNS configuration completed before deployment validation |

---

## 9. Test scenarios (manual QA checklist)

After build completes, Sawyer (or Claude Code via instructed manual checks) walks through these scenarios:

### 9.1 Login & routing
- [ ] Visit `portal.cactus-logistics.com/login` — login page renders correctly
- [ ] Visit `alamo.cactus-logistics.com/login` — redirects to portal subdomain
- [ ] Login as Sawyer (Cactus admin) → lands on `alamo.cactus-logistics.com/dashboard`
- [ ] Login as a portal-only test user → lands on `portal.cactus-logistics.com/dashboard`
- [ ] Wrong password → error shown, no navigation
- [ ] Logged out user visiting `alamo.cactus-logistics.com/dashboard` → redirected to login
- [ ] Logged out user visiting `portal.cactus-logistics.com/dashboard` → redirected to login
- [ ] Logged in portal user visiting `alamo.cactus-logistics.com/dashboard` → redirected to portal dashboard
- [ ] Logged in admin visiting `portal.cactus-logistics.com/dashboard` (no impersonation token) → either error page or redirected back to alamo

### 9.2 Portal pages
- [ ] Portal dashboard shows org name correctly
- [ ] Portal dashboard stats query the right data
- [ ] Portal invoices list shows only the user's org's invoices
- [ ] Filters work (status, date range)
- [ ] CSV export downloads
- [ ] Invoice detail page loads
- [ ] PDF download works
- [ ] CSV download works
- [ ] Try to access an invoice belonging to a different org by URL → 404 (RLS verified)
- [ ] Payment methods page renders placeholder content

### 9.3 Impersonation
- [ ] As Sawyer, navigate to MarketSculpt's org page in Alamo
- [ ] Click "View Portal as MarketSculpt" → new tab opens to portal dashboard
- [ ] Banner shows at top: "VIEWING AS MARKETSCULPT — Exit impersonation"
- [ ] Portal data displayed is MarketSculpt's, not another org's
- [ ] Click "Exit impersonation" → returned to Alamo
- [ ] Try to re-use the same impersonation URL → fails (token consumed)
- [ ] Wait 30+ minutes, generate token, try to use → fails (token expired)
- [ ] Verify `audit_logs` has IMPERSONATION_STARTED and IMPERSONATION_ENDED entries

### 9.4 Cross-subdomain auth
- [ ] Login on portal subdomain → cookie set on `.cactus-logistics.com`
- [ ] Manually visit alamo subdomain → still authenticated (no re-login required)
- [ ] Logout → cookie cleared on both subdomains

### 9.5 Existing Alamo functionality regression
- [ ] All existing Alamo pages still render (dashboard, carriers, invoices, billing, etc.)
- [ ] Existing invoice upload + parse + match flow still works end-to-end
- [ ] Billing engine still produces cactus_invoices correctly
- [ ] PDF and CSV generation in Alamo unaffected

---

## 10. Out of scope (deferred to A.1, A.2, or later)

Explicit list of things NOT in A.0 to prevent scope creep:

- Stripe SDK integration of any kind
- `client_payment_methods` table or Stripe Customer creation
- Payment Element embed
- Stripe webhook handler
- Auto-debit on invoice due date
- ACH return code handling
- Payment failure email notifications
- Resend email infrastructure
- Notification preferences UI
- 85-column detail CSV (Session B.2)
- Tracking dashboard
- Claims management
- Analytics
- Multi-user-per-org management
- Sub-client billing (Phase 2)
- Rate card UI for clients
- USPS meter UI for clients
- Real-time shipment tracking
- Phone-based authentication or 2FA
- Password reset flow (use Supabase's hosted reset for now if needed)

---

## 11. Risk register

Issues to watch for during execution. Surface to Sawyer if any materialize.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Repo reorganization breaks Alamo imports | Medium | High | Single atomic commit, full Alamo regression test before declaring step done |
| RLS policies break Alamo if Alamo uses anon client anywhere | Low | High | Audit Alamo for non-service-role queries before HALT POINT 4 |
| Cookie domain misconfiguration breaks SSO across subdomains | Medium | Medium | Test both subdomain auth flows explicitly in Section 9.4 |
| DNS propagation delays block production launch | Low | Low | Add DNS records 24+ hours before planned launch |
| Existing Alamo login flow conflicts with new shared login | Medium | Medium | Replace Alamo login outright, don't try to maintain both |
| Impersonation banner doesn't render on all portal pages | Medium | Low | Banner lives in `(portal)/layout.tsx` so it inherits everywhere |
| Service-role queries in Alamo bypass RLS and accidentally leak across orgs | Low | High | Code review every Alamo query that uses service role; document why service role is needed in each location |

---

## 12. Post-completion update to master briefing

After A.0 ships and verifies, update the following sections of `cactus-master-briefing.md`:

- Section 10: increment table count to 20 (added `impersonation_tokens`)
- Section 10: add `impersonation_tokens` row to the table inventory
- Section 10: note v1.8.0 schema changes (is_cactus_internal column, impersonation_tokens table)
- Section 11: add naming note for route groups: `(alamo)/`, `(portal)/`, `(public)/`
- Section 12: mark Phase A.0 complete with date and any deviations from spec
- Section 12: update "Next task" to point at Phase A.1 spec
- Section 12 architectural decisions: add "Cactus admin = membership in is_cactus_internal=TRUE org" and "Subdomain split: alamo. + portal."

---

## 13. Open questions deferred to in-flight decisions

Things the spec intentionally does not lock down. Claude Code should make reasonable choices and document them in the session summary.

1. **Exact JWT library** for impersonation tokens (`jose`, `jsonwebtoken`, native Web Crypto) — pick whichever is most idiomatic for Next.js 16 App Router server actions
2. **Sidebar nav item icons** for portal — use Lucide icons matching the Alamo pattern (LayoutDashboard, FileText, CreditCard, LogOut)
3. **Date format on portal pages** — match the Alamo PDF generator's format ("Apr 21–27, 2026" style)
4. **Empty state copy** for invoices list — "No invoices yet" placeholder is fine; refine wording if needed
5. **Local dev hostname** — `localhost:3000` works; no need for `lvh.me` or hosts file edits unless cookie testing requires it

---

## 14. Sign-off

This spec is the contract between architecture (chat session) and execution (Claude Code). Deviations during execution should be documented and surfaced to Sawyer; do not silently change scope or design decisions.

**End of spec.**
