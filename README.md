# CACTUS: The Resilient Logistics OS

## 1. Vision & Soul
Cactus is an **AI-assisted** logistics middleware designed for 3PLs and high-volume merchants. We believe people are the soul of business; our technology empowers human expertise to protect merchant reputations.

## 2. Product Architecture
- **Cactus Portal (Client):** Dashboard for labels, tracking, and automated invoice payments.
- **Alamo (Internal):** Admin mission control for rate card management and the Reconciliation Engine.
- **Cactus API:** High-performance integration layer for WMS/OMS platforms.

## 3. Financial OS: Bifurcated Settlement
### A. Pre-Paid (USPS Only)
- **Metered Wallet:** Automated reloads (Initial Load → Min Threshold → Reload Amount).
- **Redundancy:** Primary and Backup payment methods on file.

### B. Post-Paid (Non-USPS Carriers)
- **Reconciliation Engine:** Ingests raw carrier invoices and maps shipments to Organizations with precision.
- **Consolidated Invoicing:** One weekly invoice across all carriers, synced with QBO.
- **The "Auto-Pull":** Automated payment processing triggered on the Invoice **due_date**.

## 4. Strict Calculation Sequence (The Markup Pipeline)
- **Calculation Type:** All currency math must use high-precision Decimal types.
- **Stage 1: Primary-Markup:** Applied to the fully-loaded carrier cost.
- **Stage 2: Primary Rounding:** IMMEDIATELY round up (Ceiling) the Primary subtotal to the next whole cent.
- **Stage 3: Secondary-Markup:** Applied to the rounded result of Stage 2.
- **Stage 4: Final Rounding:** Round up (Ceiling) the Secondary subtotal to the next whole cent to create the Final Cactus Rate.
- **Audit Integrity:** Store the results of both Stage 2 and Stage 4 to ensure the "Penny-Path" is 100% auditable.

## 5. Margin & Pricing (Internal Only)
- **Arbitrage Support:** Captures spread between internal NSA rates and external Merchant Rate Cards.
- **Invisible Data:** All internal costs and markup titles (Primary/Secondary) are hidden from the Client Portal.

## 6. Cactus Pulse: AI-Assisted Resilience
- **Proactive Monitoring:** AI flags "At-Risk" shipments for human-led intervention.
- **Frictionless Claims:** One-click claim filing for late/lost shipments based on reconciled carrier data.

## 7. Technical Guardrails
- **Performance:** Sub-500ms rating responses.
- **Failover:** Dual payment processors (Primary + Warm Backup).