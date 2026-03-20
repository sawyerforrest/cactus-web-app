# CACTUS: The Resilient Logistics OS
**End-to-End Logistics | Small Parcel Focus**

## 1. Vision, Soul & Core Values
Cactus is an **AI-assisted** logistics ecosystem designed to serve 3PLs and brands in the small parcel e-commerce industry.

**Our Core Values:**
> **Gratitude | Curiosity | Creation**

---

## 2. The Three-Phase Roadmap

### Phase 1: The Billing & Rating Engine (CORE)
* **Focus:** E-commerce Small Parcel Logistics.
* **World-Class Rating Engine:** Secure middleware integrating with national/regional carriers and WMS, TMS, and OMS platforms.
* **Normalization Layer:** Consolidating diverse carrier invoice formats into a "FedEx-Style" gold standard.
* **Financial Bedrock:** Implementation of "Single-Ceiling" shipment-level markup and Cactus-to-Client invoicing.
* **Cactus Portal:** Merchant dashboard for shipments, meter transactions, and funding control.

### Phase 2: Client-Facing Billing & Analytics
* **Sub-Client Suite:** Allowing Cactus Orgs to invoice *their* clients directly from the portal with custom downstream markups.
* **Analytics Dashboard:** Visually digestible data showing shipping trends, cost-per-package, and margin health.

### Phase 3: Full WMS & B2B Expansion
* **Full WMS Suite:** Warehouse management for small parcel fulfillment (aisles, bins, shelves).
* **B2B Logistics:** Strategic expansion into LTL (Less Than Truckload) and FTL (Full Truckload) retail fulfillment.

---

## 3. Product Architecture
* **Cactus Portal (Client):** The interface for label generation, tracking, and financial management.
* **Alamo (Internal):** The "Mission Control" for Cactus admins to manage rate cards, normalization mappings, and audit logs.
* **Cactus API:** High-performance integration layer for external software (WMS/OMS).

---

## 4. Financial OS: The Markup Pipeline

### A. Bifurcated Settlement
* **Pre-Paid (USPS Only):** Metered wallet with automated reloads (Initial Load → Min Threshold → Reload Amount).
* **Post-Paid (National/Regional):** Consolidated weekly invoicing with an automated "Auto-Pull" on the **due_date**.

### B. The "Single-Ceiling" Pipeline
All currency math must use high-precision **Decimal** types to prevent floating-point errors.
1.  **Stage 1 (Shipment Markup):** Apply the organization's specific markup percentage to the fully-loaded, normalized carrier cost.
2.  **Stage 2 (Final Rounding):** Immediately round up (Ceiling) to the next whole cent to determine the final "Merchant Rate."

---

## 5. Cactus Pulse: AI-Assisted Resilience
* **Proactive Monitoring:** AI flags "At-Risk" shipments for human-led intervention before the customer notices a delay.
* **Frictionless Claims:** One-click claim filing for late or lost shipments based on verified carrier data.
* **Financial Integrity:** Internal carrier costs and specific markup percentages are strictly hidden from the Client Portal to maintain competitive integrity.

---

## 6. Technical Guardrails & Standards
* **Performance:** Sub-500ms rating responses for frictionless e-commerce checkout.
* **Failover:** Dual payment processors (Primary + Warm Backup) to ensure meter reloads never fail.
* **Naming Conventions:**
    * **Files & Folders:** `kebab-case` (e.g., `database-setup.sql`)
    * **Database (SQL):** `snake_case` (e.g., `org_id`)
    * **Application Code:** `camelCase` (e.g., `finalCactusRate`)