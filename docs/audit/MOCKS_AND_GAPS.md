# ADPAYON — Monorepo Mocks, Gaps & Architectural Technical Debt

**Audit Date:** October 2026  
**Auditor:** Technical Lead & Release Engineering  

This audit document identifies all mock fixtures, disconnected user interfaces, client-side fake cash crediting, missing backend models, and policy compliance gaps that must be resolved for genuine production readiness.

---

## 1. High-Priority Gaps & Client-Side Mock Discoveries

### GAP-01: Disconnected Mobile Wallet & Mock Ledger
* **Current State:** [`apps/mobile/src/screens/wallet/WalletScreen.tsx`](file:///c:/Users/hi/OneDrive/Documents/Desktop/adpayon/adpayon/apps/mobile/src/screens/wallet/WalletScreen.tsx) and [`useWalletStore`](file:///c:/Users/hi/OneDrive/Documents/Desktop/adpayon/adpayon/apps/mobile/src/store/walletStore.ts) import `MOCK_WALLET_SUMMARY` and `MOCK_TRANSACTIONS` from `mockData.ts`. When a user requests a withdrawal, `WalletScreen` executes a local `setTimeout()` and appends a local synthetic object to Zustand state without contacting the backend API.
* **Risk:** The mobile wallet displays arbitrary mock balances, and users cannot view real point balances or request authoritative withdrawals.
* **Resolution Required:**
  1. Implement server-authoritative Ledger & Wallet endpoints in `apps/api`:
     * `GET /api/wallet/summary`
     * `GET /api/wallet/transactions`
     * `POST /api/wallet/withdraw`
  2. Implement an immutable double-entry ledger collection in MongoDB (`wallet_ledger_entries`).
  3. Connect mobile `useWalletStore` to real backend endpoints.

---

### GAP-02: Client-Side Simulated Cash Awards (Gamification & Utility)
* **Current State:**
  * **Daily Streak Screen** ([`DailyStreakScreen.tsx`](file:///c:/Users/hi/OneDrive/Documents/Desktop/adpayon/adpayon/apps/mobile/src/screens/gamification/DailyStreakScreen.tsx)): Calls client-side `claimReward(700, 'ENGAGEMENT', ...)` and alerts "+₹7.00 added to your spendable ledger balance".
  * **Scratch Card Screen** ([`ScratchEarnScreen.tsx`](file:///c:/Users/hi/OneDrive/Documents/Desktop/adpayon/adpayon/apps/mobile/src/screens/gamification/ScratchEarnScreen.tsx)): Allows users to scratch random cards and immediately awards unverified paise client-side without backend authorization.
  * **Mobile Recharge Screen** ([`MobileRechargeScreen.tsx`](file:///c:/Users/hi/OneDrive/Documents/Desktop/adpayon/adpayon/apps/mobile/src/screens/utility/MobileRechargeScreen.tsx)): Displays mock telecom plans and simulates instant recharge using `setTimeout` and local balance deduction.
  * **Shopping Cashback Screen** ([`ShoppingCashbackScreen.tsx`](file:///c:/Users/hi/OneDrive/Documents/Desktop/adpayon/adpayon/apps/mobile/src/screens/utility/ShoppingCashbackScreen.tsx)): Displays a prompt "Simulate Mock Purchase Cashback (+₹45.00)" and adds 4500 paise client-side.
* **Risk:** Severe Google Play policy violation (misleading financial claims, deceptive app functionality, unbacked cash generation).
* **Resolution Required:**
  1. Remove or disable simulated direct cash injections. Rewards must originate exclusively from verified advertiser task completion (`TaskCompletion`) or verified contract affiliate conversions.
  2. Utility screens (Recharge, Shopping Cashback) must clearly display "Coming Soon / In Partnership Integration" badges until real aggregator APIs (e.g. BBPS or affiliate networks) are plugged in with real contracts, or be removed from release build to avoid Google Play rejection.

---

### GAP-03: KYC Verification Mocked Locally
* **Current State:** [`apps/mobile/src/screens/profile/KycUploadScreen.tsx`](file:///c:/Users/hi/OneDrive/Documents/Desktop/adpayon/adpayon/apps/mobile/src/screens/profile/KycUploadScreen.tsx) runs Zod schema validation, then waits 900ms via `setTimeout()` and marks the user's local profile `isKycVerified: true` and `kycDetails.status: 'VERIFIED'`. No data is transmitted to the backend, and no admin review or Penny-drop verification occurs.
* **Risk:** Anyone can bypass KYC restrictions simply by submitting dummy data.
* **Resolution Required:**
  1. Add `POST /api/users/kyc` endpoint in `apps/api` to securely save masked PAN, Aadhaar last-4, bank account, and IFSC in user document under `status: 'PENDING'`.
  2. Provide administrative KYC review or automated compliance state.

---

### GAP-04: Missing Google Play Account & Data Deletion
* **Current State:** [`ProfileSettingsScreen.tsx`](file:///c:/Users/hi/OneDrive/Documents/Desktop/adpayon/adpayon/apps/mobile/src/screens/profile/ProfileSettingsScreen.tsx) has only a "Sign Out" button. Privacy & Terms are handled by local `Alert.alert()` dialogues.
* **Risk:** Immediate rejection by Google Play Review under the **User Data — Account Deletion Requirement** (effective since Dec 2023, apps allowing account creation must provide both in-app and web-based account deletion).
* **Resolution Required:**
  1. Implement `POST /api/users/delete-account` in backend to mark user `status: 'DELETED'`, revoke all JWT refresh tokens, anonymize personal identification numbers, and log security compliance audit.
  2. Add "Delete Account & Associated Data" button in `ProfileSettingsScreen.tsx` with confirmation modal.
  3. Prepare public web deletion URL documentation for Play Store listing.

---

### GAP-05: Missing Admin Modules in Frontend UI
* **Current State:** While the Admin Dashboard has robust Campaign, Task, Completion, and Fraud Queue pages, several modules requested for full enterprise operations are currently missing from the navigation menu:
  * **User Management:** No page to list, search, view ancestry, inspect KYC status, or ban/suspend users.
  * **Withdrawal & Payout Review:** No dedicated queue for reviewing earner cash withdrawal requests.
* **Resolution Required:**
  1. Add User Management page ([`Users.tsx`](file:///c:/Users/hi/OneDrive/Documents/Desktop/adpayon/adpayon/apps/admin/src/pages/Users.tsx)) with search, role, KYC filter, and suspension action.
  2. Add Withdrawal Management page ([`Withdrawals.tsx`](file:///c:/Users/hi/OneDrive/Documents/Desktop/adpayon/adpayon/apps/admin/src/pages/Withdrawals.tsx)) to approve or reject earner withdrawal requests.
  3. Add corresponding backend endpoints in `adminTaskRouter` or `adminUserRouter`.

---

## 2. Inventory of Genuine vs Mock Functionality

| Feature Area | Current Implementation Status | Gap Classification |
| :--- | :--- | :--- |
| **Admin 2FA Authentication** | **Genuine** (Argon2id + JWT + HMAC OTP + AdminAuditLog) | Complete |
| **Campaign Management** | **Genuine** (DB-backed, CRUD, Budget tracking, Secrets reveal) | Complete |
| **Task Engine (Article/Video/App)** | **Genuine** (Dwell-time intervals, watchdog sessions, quizzes, caps) | Complete |
| **Task Completion Verification** | **Genuine** (ACID transactions, mutex locks, duplicate protection) | Complete |
| **Fraud Review Queue** | **Genuine** (DB-backed submissions, review notes, status transitions) | Complete |
| **Referral Tree & Genealogy** | **Genuine** (Materialized path, unilevel downline calculations) | Complete |
| **User Task Feed & Discovery** | **Genuine** (Server query, eligibility filtering, assignment lock) | Complete |
| **User Wallet & Ledger** | **Mock** (Zustand in-memory only, no DB ledger model) | **Critical Fix Needed** |
| **Withdrawal Request Flow** | **Mock** (Local setTimeout, synthetic tx ID) | **Critical Fix Needed** |
| **KYC Submission Flow** | **Mock** (Local setTimeout, client-only verified state) | **High Fix Needed** |
| **Account Deletion Flow** | **Missing** (No UI, no endpoint) | **Play Store Blocker** |
| **Mobile Recharge / Shopping** | **Simulated / Mock** (No real aggregator integration) | **Policy Risk — Needs Cleanup** |
