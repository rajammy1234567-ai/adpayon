# AdPayOn - Assumptions, Financial Rules & Open Questions Specification

This document details all business logic, financial rules, binary tree calculations, commission distributions, and compliance assumptions for **AdPayOn**. Any changes to monetary rules require explicit sign-off.

---

## 1. Currency & Ledger Principles (Strict Integer Paise)
1. **Integer Paise Representation**:
   - **All monetary values are stored and calculated strictly as integer paise** (`1 INR = 100 paise`).
   - Floating-point numbers are prohibited in database schemas, backend services, ledger calculations, and shared DTOs to eliminate IEEE-754 precision errors.
   - Examples:
     - ₹50.00 signup bonus = `5000` paise
     - ₹100.00 minimum withdrawal = `10000` paise
     - ₹249.50 transaction = `24950` paise
   - Formatters on client interfaces divide by 100 only at the view layer for rendering currency symbols (`₹`).
2. **Append-Only Double-Entry Accounting**:
   - User wallet balances are **never modified with direct `UPDATE` or `$inc`/`$set`**.
   - Ground truth balance is **always derived by database aggregation**:
     $$\text{Balance} = \sum \text{Credits} - \sum \text{Debits} \quad (\text{status} = \text{'CREDITED'})$$
   - `runningBalanceSnapshot` is stored as an **optional, non-authoritative read-hint** for audit logs, but is never used as the source of truth for authorization, payouts, or balance validation.
   - Every financial transaction creates balanced debit and credit entries with an atomic `idempotencyKey`.
   - Four system account classifications:
     - `USER_MAIN_WALLET`: Spendable and withdrawable earnings (paise).
     - `USER_BONUS_WALLET`: Promotional / onboarding balance requiring qualification (paise).
     - `COMPANY_COMMISSION_POOL`: Platform liability and payout reserves (paise).
     - `WITHDRAWAL_ESCROW`: Funds held during KYC / admin withdrawal reviews (paise).
3. **Ledger Statuses**:
   - `PENDING`: Initiated or awaiting verification.
   - `VERIFIED`: Passed fraud/postback checks, queued for credit.
   - `CREDITED`: Finalized, contributing to derived spendable balance.
   - `REJECTED`: Invalidated or cancelled (escrow released back to user if debited).

---

## 2. KYC Compliance & PII Encryption
1. **Aadhaar Data Minimization**:
   - **Never store full 12-digit Aadhaar numbers.**
   - Only `aadhaarLast4` (string, exactly 4 digits) is retained for user reference and verification records.
2. **PII Encryption at Rest**:
   - `panNumber`: Encrypted at rest using AES-256-GCM.
   - `bankAccount`: Encrypted at rest using AES-256-GCM.
   - `upiId`: Encrypted at rest using AES-256-GCM.
   - Masked variants (e.g., `XXXXXX1234` or `usr****@okhdfcbank`) are provided for client display.

---

## 3. MLM Binary Tree Topography
1. **Binary Placement**:
   - Each parent node has at most two children: `LEFT` and `RIGHT`.
   - Node attributes:
     - `sponsorId`: User who directly referred this member.
     - `parentId`: Direct node in the binary hierarchy immediately above this member.
     - `leg`: `LEFT` or `RIGHT`.
     - `materializedPath`: Comma-delimited ancestor sequence (e.g., `,rootId,upline1,parentId,`) allowing fast subtree queries and volume rollups.
     - `depth`: Hierarchical depth in the binary graph.
2. **Automatic Spillover**:
   - When a sponsor invites a member with a selected leg preference (`LEFT` or `RIGHT`), the system traverses down the chosen subtree to locate the first available vacant leaf position.

---

## 4. Commission Engine & Configuration (Fully Config-Driven)
All commission distribution parameters, pool allocations, and matching slabs are loaded from the `CommissionConfig` collection and are **never hardcoded**.

### 4.1. Level Income (Unilevel on Direct Hierarchy)
- Default config placeholder: **55% pool** across 8 upline generations:
  - Level 1: 25%
  - Level 2: 10%
  - Level 3: 5%
  - Level 4: 4%
  - Level 5: 3%
  - Level 6: 3%
  - Level 7: 3%
  - Level 8: 2%
  - *Sum of levels = 55%*
- Payout requirement: Upline sponsor must have `isActive: true`.

### 4.2. Binary Matching Income
- Default matching slabs (configurable in DB):
  - 50 : 50 units $\rightarrow$ 6%
  - 600 : 600 units $\rightarrow$ 6%
  - 2,000 : 2,000 units $\rightarrow$ 5%
  - 10,000 : 10,000 units $\rightarrow$ 5%
  - 30,000 : 30,000 units $\rightarrow$ 5%
  - 100,000 : 100,000 units $\rightarrow$ 4%
  - 300,000 : 300,000 units $\rightarrow$ 4%
  - 500,000 : 500,000 units $\rightarrow$ 5%
- Flushes the weaker leg volume, while the surplus volume on the stronger leg is carried forward.

### 4.3. Rank & Rewards Pool
- 8 Progressive Ranks: `Silver`, `Gold`, `Platinum`, `Diamond`, `Crown Diamond`, `Ambassador`, `Royal Ambassador`, `Champion`.
- Evaluated monthly via BullMQ background job based on active direct referrals and leg depth milestones.

---

## 5. OPEN QUESTIONS & UNRESOLVED AMBIGUITIES

> [!WARNING]
> The following items contain business ambiguities. Configurable database placeholders are used until explicit confirmation is provided.

### ❓ Open Question 1: Commission Pool Totals Discrepancy
- **Context**: The requirements specify "55% level income, 40% binary income, and 25% rank reward bucket". Summed together, this equals $55\% + 40\% + 25\% = 120\%$, which exceeds 100% of available revenue.
- Alternatively, some plans state:
  $$\text{Level } 55\% + \text{Binary } 20\% + \text{Reward } 25\% = 100\%$$
  while the individual binary matching slabs list percentages adding up to 40%.
- **Temporary Implementation Strategy**:
  - We store `poolBudgetPercentage` for each engine independently in `CommissionConfig`.
  - Default DB values are parameterized and isolated:
    - `levelIncome.poolBudgetPercentage = 55`
    - `binaryIncome.poolBudgetPercentage = 20` *(or 40 depending on config)*
    - `rankRewards.poolBudgetPercentage = 25`
  - All engines compute payouts based on their active configuration snapshot without assuming hardcoded 120% or 100%.

### ❓ Open Question 2: What Event Generates Binary Volume (PV / Point Volume)?
- **Context**: In network marketing applications, binary matching units (50:50, 600:600, etc.) are generated by specific platform actions. It is currently ambiguous which of the following creates volume units:
  1. Completion of partner tasks / onboarding challenges?
  2. Ad revenue sharing (e.g. ₹1 ad revenue = 1 point volume)?
  3. User subscription / plan activation?
  4. Daily active streak validation?
- **Temporary Implementation Strategy**:
  - We define an abstract `PointVolumeEvent` interface and default trigger: `CHALLENGE_COMPLETION` generates `10 PV` per completed mandatory challenge, and `AD_VIEW` generates `1 PV`. This can be re-routed to any product event via the config engine.

---

## 6. Mobile Application Stack & Technical Guidelines
1. **Expo & Navigation Versions**:
   - Uses the latest stable Expo SDK and latest stable React Navigation (React Navigation v7 / Expo Router / latest stable Expo).
2. **State & Data Fetching**:
   - `Zustand` for client auth, theme, and language state.
   - `@tanstack/react-query` for server state, cache invalidation, and optimistic updates.
3. **Localization**:
   - `i18next` + `react-i18next` supporting English (`en`) and Hindi (`hi`).
4. **Fintech Design System**:
   - Clean luxury aesthetic: Obsidian Dark (`#0A0D14`), Slate Surface (`#141923`), Emerald Green (`#10B981`), Amber Gold (`#F59E0B`), High-contrast typography.
   - Comprehensive feedback states: Custom skeleton loaders, zero-data empty states, and resilient error recovery views.
