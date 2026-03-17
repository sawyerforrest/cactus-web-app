# CACTUS: The Resilient Logistics OS

## 1. Vision & Soul
Cactus is an AI-powered logistics middleware designed for 3PLs and merchants. We act as a high-integrity "Market Maker," providing sub-500ms rating, proactive tracking, and automated financial reconciliation.

## 2. Product Architecture
- **Cactus Portal (Client):** Organization dashboard for label production, AI tracking, and automated invoice payments.
- **Alamo (Internal):** Admin mission control for rate card arbitrage and the Carrier Reconciliation Engine.
- **Cactus API:** High-performance integration layer for WMS/OMS platforms.

## 3. The Smart Rating Engine
- **Hybrid Strategy:** Prioritizes Rate Cards (USPS/UniUni/GOFO) while falling back to real-time APIs for private carriers.
- **Auto-Fallback:** Ensures label production never stops by reverting to full API calls if static data is unavailable.

## 4. Financial OS: Bifurcated Settlement
### A. Pre-Paid (USPS Only)
- **Metered Wallet:** Automated reloads via Primary/Backup payment methods based on pre-set thresholds.
- **Transparency:** Real-time email receipts for every reload event.

### B. Post-Paid (Non-USPS Carriers)
- **Reconciliation Engine:** Ingests raw carrier invoices and categorizes line items into a standardized Cactus format.
- **Precise Mapping:** Matches carrier line items to specific Organizations via Tracking Number verification.
- **Automated Markup:** Applies stackable, Org-specific margins (10-20%+) to reconciled line items.
- **Consolidated Invoicing:** One weekly invoice across all carriers, synced with QBO.
- **The "Auto-Pull":** Automated payment processing triggered precisely on the Invoice **due_date**.

## 5. Margin & Pricing (Internal Only)
- **Arbitrage Support:** Captures the spread between internal NSA/Platform rates and external Merchant Rate Cards.
- **Invisible Data:** Internal costs and specific markups are hidden from the Client Portal.

## 6. Cactus Pulse: AI Resilience
- **Proactive Tracking:** AI monitoring for "At-Risk" shipments with automated claim-eligible flagging.
- **Frictionless Claims:** One-click claim filing for late/lost shipments based on reconciled carrier data.

## 7. Technical Guardrails
- **Performance:** Sub-500ms rating targets.
- **Failover:** Dual payment processors (Primary + Warm Backup).
- **Compliance:** Standardized categorizing of all surcharges (Fuel, DAS, etc.) for high-fidelity auditing.