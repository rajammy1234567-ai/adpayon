# ADPAYON — Privacy Policy & Account Deletion Implementation Audit

**Standard:** Google Play Account Deletion Policy & Indian Digital Personal Data Protection Act (DPDP 2023)
**Package:** `com.adpayon.app`
**Audit Date:** October 2026

---

## 1. Google Play Mandatory Account Deletion Compliance

Google Play requires that if an application allows users to create an account, it **MUST** provide:
1. An **in-app path** to delete the account and associated data.
2. A **web-based resource / URL** where users can request account and data deletion without reinstalling the app.

### A. In-App Deletion Verification

* **UI Location:** [`apps/mobile/src/screens/profile/ProfileSettingsScreen.tsx`](file:///c:/Users/hi/OneDrive/Documents/Desktop/adpayon/adpayon/apps/mobile/src/screens/profile/ProfileSettingsScreen.tsx)
* **Button Label:** `"Delete Account & Personal Data"` (Rendered beneath the Sign Out button)
* **User Experience:**
  1. User clicks `"Delete Account & Personal Data"`.
  2. Native confirmation dialogue explains that the action permanently revokes all sessions, anonymizes PII, and schedules data for purging.
  3. On confirmation (`"Delete Permanently"`), the mobile app dispatches `POST /api/users/delete-account` with `{ confirmation: "DELETE_MY_ACCOUNT" }`.
  4. Local state is wiped (`logout()` and `exitDemoMode()`), and the user is redirected to the splash onboarding screen.

### B. Backend Deletion & Anonymization Engine

* **Endpoint:** `POST /api/users/delete-account`
* **Controller:** [`apps/api/src/controllers/wallet.controller.ts`](file:///c:/Users/hi/OneDrive/Documents/Desktop/adpayon/adpayon/apps/api/src/controllers/wallet.controller.ts)
* **Execution Flow:**
  1. Authorizes JWT session and extracts authenticated `userId`.
  2. Queries `AuthSession` collection and invalidates all active tokens (`isValid = false, revokedAt = now`).
  3. Unsets personal identifier phone numbers and email (`user.mobile = undefined`, `user.email = undefined`).
  4. Scrambles name to anonymized hash (`user.name = "Deleted User (<randomSuffix>)"`).
  5. Transitions user status to `'SUSPENDED'` to prevent future logins or token issuance.
  6. Preserves immutable double-entry ledger records for tax and financial auditing while completely decoupling user identity.

---

## 2. Public Web Resource for Account Deletion (Play Console Declaration)

* **Public Web URL for Play Console Entry:**
  `https://adpayon.com/privacy/delete-account`
  *(For staging testing: `https://adpayon-client-api.onrender.com/api/privacy/delete-account`)*

* **Web Deletion Request Handling Process:**
  1. User enters registered mobile number and requests OTP.
  2. OTP is verified via standard auth pipeline.
  3. User confirms deletion prompt.
  4. Server invokes the identical `deleteUserAccount` routine.
  5. User receives final confirmation notice.

---

## 3. Privacy Policy Requirements & Hosting

* **Public Privacy Policy URL for Play Console Entry:**
  `https://adpayon.com/privacy-policy`

* **Required Clauses Included:**
  * Specific mention of educational reading & partner research campaigns.
  * Explicit disclosure that rewards are promotional incentives, not bank deposits.
  * Description of AES-256 encrypted storage for KYC documents.
  * Contact information of the Data Grievance Officer in India (Name, Email, Address).
