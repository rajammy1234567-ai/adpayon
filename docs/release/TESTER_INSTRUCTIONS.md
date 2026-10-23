# ADPAYON — Google Play Console Tester & Reviewer Instructions

**Target Application:** `com.adpayon.app`
**Environment Under Review:** Google Play Closed Testing & Staging Environment
**Audience:** Google Play App Review Team & Authorized QA Testers

---

## 1. Credentials for App Reviewers

To allow Google Play Reviewers full access to all authenticated and financial features of the app without needing a physical Indian SIM card for SMS delivery, the following static review credentials are provided:

* **Mobile Number:** `+919876543210`
* **Account Password:** `StagingAdmin!2026Secure` *(or Earner password `TestEarner123!Secure`)*
* **Static Verification Code (Review OTP):** `778899` *(or dynamically retrieved via lookupStagingReviewerOtp)*
* **Alternative Demo Access:** The app includes a **"Explore in Preview / Demo Mode"** button on the onboarding splash screen, allowing instant guest exploration of all task types and wallet flows without registration.

---

## 2. Step-by-Step Feature Walkthrough for Testers

### Step 1: Launch & Task Discovery
1. Open the AdPayOn app.
2. Select **"Explore in Demo Mode"** or log in using the reviewer account.
3. On the **Discovery Feed**, review available partner tasks:
   * **Article Reading Task:** "Understanding UPI Two-Factor Safety"
   * **Video Learning Task:** "Digital Literacy & Cybersecurity Essentials"
   * **App Feedback Task:** "Explore Partner Application"

### Step 2: Article Reading & Comprehension Verification
1. Tap the **"Understanding UPI Two-Factor Safety"** task.
2. Scroll through the guide. Notice the active dwell-time indicator at the top.
3. Once the 5-second reading requirement is satisfied and scroll depth reaches 50%, the **Comprehension Quiz** unlocks.
4. Answer the multiple-choice question:
   * *Question:* "When is your UPI PIN required on your smartphone?"
   * *Correct Option:* "Only when sending money or checking bank balance".
5. Tap **"Submit & Claim Reward"**.
6. The points (+150 PTS / ₹1.50) are server-verified and credited immediately to your wallet.

### Step 3: Wallet & Ledger Transparency
1. Navigate to the **Wallet** tab in the bottom bar.
2. Observe the **Available Balance**, **Escrow Balance**, and **Lifetime Earnings**.
3. Scroll down to review the **Transaction Ledger**. Notice each credit includes an immutable reference and timestamp.

### Step 4: Withdrawal Request & Minimum Defense
1. Tap **"Request Withdrawal"**.
2. If KYC is not verified, tap **"Verify KYC Now"**, enter a mock PAN (`ABCDE1234F`), Aadhaar last 4 (`5678`), and UPI ID (`tester@upi`).
3. Re-open withdrawal modal, enter an amount (e.g. ₹50), select **UPI**, and tap **"Confirm Withdrawal"**.
4. The amount is transferred to **Held in Escrow** pending administrative disbursement.

### Step 5: Google Play Mandated Account Deletion
1. Navigate to the **Profile** tab.
2. Scroll to the bottom and tap **"Delete Account & Personal Data"**.
3. Tap **"Delete Permanently"** in the native confirmation prompt.
4. The app signs you out, revokes all tokens, and anonymizes your profile.
