# ADPAYON — Google Play Data Safety Declaration Mapping

**Application Identifier:** `com.adpayon.app`
**Compliance Authority:** Google Play User Data Policy & India Digital Personal Data Protection (DPDP) Act
**Document Status:** Final Audit Verified

Every question in the Google Play Console **Data Safety Section** must match the authoritative mapping detailed below.

---

## 1. Overview Questionnaire Responses

1. **Does your app collect or share any of the required user data types?**
   * **Answer:** `YES`
2. **Is all of the user data collected by your app encrypted in transit?**
   * **Answer:** `YES` (Enforced via HTTPS / TLS 1.3 on all API endpoints).
3. **Do you provide a way for users to request that their data be deleted?**
   * **Answer:** `YES` (Via in-app button in Profile Settings and public web URL).

---

## 2. Detailed Data Category Declarations

### Category A: Personal Info

| Data Type | Collected? | Shared? | Purpose | Ephemeral? | Required or Optional? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Name** | `YES` | `NO` | App functionality, Account management | `NO` | Required for earner account creation. |
| **Email Address** | `YES` | `NO` | Account recovery, Communications | `NO` | Optional for earners, mandatory for advertisers/admin. |
| **Phone Number** | `YES` | `NO` | Primary Account Authentication (OTP), Fraud prevention | `NO` | Required for earner authentication. |
| **User IDs** | `YES` | `NO` | App functionality, Ledger reconciliation | `NO` | Required (MongoDB ObjectId). |

---

### Category B: Financial Info

| Data Type | Collected? | Shared? | Purpose | Ephemeral? | Required or Optional? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **User Payment Info (UPI ID / Bank Account Details)** | `YES` | `NO` | Fraud prevention, Compliance & Payout distribution | `NO` | Optional (Required only when requesting withdrawals). Encrypted at rest. |
| **Purchase & Earnings History** | `YES` | `NO` | App functionality, Immutable double-entry ledger | `NO` | Required for point calculations. |

---

### Category C: Device or Other Identifiers

| Data Type | Collected? | Shared? | Purpose | Ephemeral? | Required or Optional? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Device or other IDs (Click ID, IP Address)** | `YES` | `NO` | Fraud prevention, Sybil defense, Rate limiting | `YES / Periodic cleanup` | Required for task deduplication and click tracking. |

---

### Category D: App Activity

| Data Type | Collected? | Shared? | Purpose | Ephemeral? | Required or Optional? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **App Interactions (Dwell time, Scroll depth, Quiz answers)** | `YES` | `NO` | Task verification, Fraud prevention | `NO` | Required to prove genuine human engagement on educational tasks. |

---

## 3. Data Collection Summary Table for Console Entry

```
[X] Data is encrypted in transit (TLS 1.3)
[X] Users can create an account and delete their account and data
[X] App does not sell user data to data brokers or third parties
[X] App adheres to Google Play Family Policy (Targets adults 18+)
```
