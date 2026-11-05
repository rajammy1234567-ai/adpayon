# ADPAYON — API Endpoint Matrix & Protocol Audit

**Audit Date:** October 2026  
**Backend:** `apps/api` (Express 4 + TypeScript)  
**Security Standard:** Strict JWT Access (15m, Memory only) + Refresh Token Family (7d, HttpOnly/Secure) + Strict Role-Based Middleware (`requireAuth`, `requireAdmin`).

---

## 1. Authentication & Security Endpoints (`authRouter`)

| HTTP Method | Route | Auth Required | Rate Limiting | Request Schema | Response Format | Status / Implementation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | None (Public) | `authRateLimiter` (30/15m) | `{ name, mobile, password, sponsorReferralCode? }` | `{ success, data: { userId, mobile, status } }` | **Implemented & Verified** |
| `POST` | `/api/auth/otp/send` | None (Public) | `otpRateLimiter` (5/15m) | `{ mobile, purpose }` | `{ success, data: { mobile } }` | **Implemented & Verified** |
| `POST` | `/api/auth/otp/verify` | None (Public) | `otpRateLimiter` (5/15m) | `{ mobile, otp, purpose }` | `{ success, data: { tokens, user } }` | **Implemented & Verified** |
| `POST` | `/api/auth/login` | None (Public) | `authRateLimiter` (30/15m) | `{ mobile \| loginId, password }` | `{ success, data: { tokens, user } }` | **Implemented & Verified** |
| `POST` | `/api/auth/refresh` | None (Single flight) | Normal | `{ refreshToken }` | `{ success, data: { tokens: { accessToken, refreshToken } } }` | **Implemented & Verified** |
| `POST` | `/api/auth/logout` | `requireAuth` | Normal | `{ refreshToken? }` | `{ success: true }` | **Implemented & Verified** |
| `POST` | `/api/auth/client-staging/demo-enroll` | Staging Only | `authRateLimiter` | None | `{ success, data: { userId, mobile, testOtp, status } }` | **Implemented & Verified** |
| `GET` | `/api/auth/me` | `requireAuth` | Normal | None | `{ success, data: { user: BackendUser } }` | **Implemented & Verified** |
| `GET` | `/api/dev/otp/:mobile` | Dev Loopback Only | Normal | None | `{ success, data: { mobile, otp } }` | **Implemented & Verified** |

---

## 2. Administrative Operations & 2FA (`adminAuthRouter` & `adminTaskRouter`)

| HTTP Method | Route | Auth Required | Rate Limiting | Request Schema | Response Format | Status / Implementation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/admin/auth/login` | None (Public) | `authRateLimiter` | `{ mobile, password }` | `{ success, data: { mfaRequired: true, mfaSessionToken, maskedMobile } }` | **Implemented & Verified** |
| `POST` | `/api/admin/auth/mfa-verify`| MFA Challenge Token | `authRateLimiter` | `{ mfaSessionToken, otp }` | `{ success, data: { accessToken, refreshToken, admin } }` | **Implemented & Verified** |
| `POST` | `/api/admin/auth/logout` | `requireAdmin` | Normal | `{ refreshToken }` | `{ success: true }` | **Implemented & Verified** |
| `GET` | `/api/admin/auth/me` | `requireAdmin` | Normal | None | `{ success, data: { admin: AdminUser } }` | **Implemented & Verified** |
| `GET` | `/api/admin/metrics` | `requireAdmin` | Normal | None | `{ success, data: PlatformMetrics }` | **Implemented & Verified** |
| `POST` | `/api/admin/campaigns` | `requireAdmin` | Normal | `{ name, advertiserName, advertiserBudgetPaise, ... }` | `{ success, data: { campaign: Campaign } }` | **Implemented & Verified** |
| `GET` | `/api/admin/campaigns` | `requireAdmin` | Normal | Query: `?page=&limit=&status=` | `{ success, data: { campaigns, pagination } }` | **Implemented & Verified** |
| `GET` | `/api/admin/campaigns/:id` | `requireAdmin` | Normal | None | `{ success, data: { campaign: Campaign } }` | **Implemented & Verified** |
| `PATCH` | `/api/admin/campaigns/:id`| `requireAdmin` | Normal | `{ name?, advertiserBudgetPaise?, status?, ... }` | `{ success, data: { campaign: Campaign } }` | **Implemented & Verified** |
| `POST` | `/api/admin/campaigns/:id/reveal-secret` | `requireAdmin` | Normal | None | `{ success, data: { webhookSecret } }` | **Implemented & Verified** |
| `POST` | `/api/admin/tasks` | `requireAdmin` | Normal | Task configuration payload (Article/Video/App) | `{ success, data: { task: Task } }` | **Implemented & Verified** |
| `GET` | `/api/admin/tasks` | `requireAdmin` | Normal | Query: `?page=&limit=&status=&campaignId=` | `{ success, data: { tasks, pagination } }` | **Implemented & Verified** |
| `GET` | `/api/admin/tasks/:id` | `requireAdmin` | Normal | None | `{ success, data: { task: Task } }` | **Implemented & Verified** |
| `PATCH` | `/api/admin/tasks/:id` | `requireAdmin` | Normal | Partial Task updates | `{ success, data: { task: Task } }` | **Implemented & Verified** |
| `POST` | `/api/admin/tasks/:id/publish` | `requireAdmin` | Normal | None | `{ success, data: { task: Task } }` | **Implemented & Verified** |
| `POST` | `/api/admin/tasks/:id/pause` | `requireAdmin` | Normal | None | `{ success, data: { task: Task } }` | **Implemented & Verified** |
| `POST` | `/api/admin/tasks/:id/expire` | `requireAdmin` | Normal | None | `{ success, data: { task: Task } }` | **Implemented & Verified** |
| `GET` | `/api/admin/tasks/completions` | `requireAdmin` | Normal | Query: `?page=&limit=&status=&verificationMethod=` | `{ success, data: { completions, pagination } }` | **Implemented & Verified** |
| `POST` | `/api/admin/tasks/completions/:id/review` | `requireAdmin` | Normal | `{ status: 'VERIFIED' \| 'REJECTED', adminReviewNotes }` | `{ success, data: { completion } }` | **Implemented & Verified** |
| `GET` | `/api/admin/audit-logs` | `requireAdmin` | Normal | Query: `?page=&limit=&action=&targetEntity=` | `{ success, data: { logs, pagination } }` | **Implemented & Verified** |

---

## 3. Earner Tasks & Watchdog Sessions (`userTaskRouter`)

| HTTP Method | Route | Auth Required | Rate Limiting | Request Schema | Response Format | Status / Implementation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/tasks/feed` | `requireAuth` | Normal | None | `{ success, data: { tasks: TaskFeedItem[] } }` | **Implemented & Verified** |
| `POST` | `/api/tasks/:id/start` | `requireAuth` | Mutex Locked | None | `{ success, data: { assignment: TaskAssignmentResponse } }` | **Implemented & Verified** |
| `POST` | `/api/tasks/:id/heartbeat` | `requireAuth` | Normal | `{ intervals: EngagementInterval[] }` | `{ success: true, data: { accumulatedSeconds } }` | **Implemented & Verified** |
| `POST` | `/api/tasks/:id/verify-action` | `requireAuth` | Mutex Locked | `{ intervals?: EngagementInterval[] }` | `{ success, data: { completion: { id, rewardPoints } } }` | **Implemented & Verified** |
| `GET` | `/api/tasks/history` | `requireAuth` | Normal | Query: `?page=&limit=` | `{ success, data: { completions, pagination, summary } }` | **Implemented & Verified** |
| `GET` | `/api/tasks/summary` | `requireAuth` | Normal | None | `{ success, data: { totalCompleted, totalRewardPoints } }` | **Implemented & Verified** |
| `GET` | `/api/tasks/:id/status` | `requireAuth` | Normal | None | `{ success, data: { hasAssignment, status, task? } }` | **Implemented & Verified** |
| `POST` | `/api/tasks/:id/store-visit` | `requireAuth` | Normal | None | `{ success: true, data: { visited: true } }` | **Implemented & Verified** |
| `POST` | `/api/tasks/:id/app-feedback/submit` | `requireAuth` | Mutex Locked | `{ feedback, rating?, answer? }` | `{ success, data: { status, rewardPoints, completionId } }` | **Implemented & Verified** |
| `POST` | `/api/tasks/:id/video-session/start` | `requireAuth` | Normal | None | `{ success, data: { sessionId, videoUrl, requiredSeconds } }` | **Implemented & Verified** |
| `POST` | `/api/tasks/:id/video-session/progress` | `requireAuth` | Normal | `{ sessionId, currentPlaybackSeconds, intervals }` | `{ success, data: { validatedSeconds, isQuizUnlocked } }` | **Implemented & Verified** |
| `GET` | `/api/tasks/:id/video-session/:sessionId` | `requireAuth` | Normal | None | `{ success, data: VideoSessionData }` | **Implemented & Verified** |
| `POST` | `/api/tasks/:id/video-session/quiz` | `requireAuth` | Normal | `{ sessionId, selectedOptionIndex }` | `{ success, data: { isCorrect, isCompleted } }` | **Implemented & Verified** |
| `POST` | `/api/tasks/:id/video-session/verify` | `requireAuth` | Mutex Locked | `{ sessionId }` | `{ success, data: { status, rewardPoints, completionId } }` | **Implemented & Verified** |
| `POST` | `/api/tasks/:id/article-session/start` | `requireAuth` | Normal | None | `{ success, data: { sessionId, minDuration, minScroll } }` | **Implemented & Verified** |
| `POST` | `/api/tasks/:id/article-session/progress` | `requireAuth` | Normal | `{ sessionId, readingTimeSeconds, scrollPercentage }` | `{ success, data: { validatedSeconds, maxScrollPercentage, isQuizUnlocked } }` | **Implemented & Verified** |
| `GET` | `/api/tasks/:id/article-session/:sessionId` | `requireAuth` | Normal | None | `{ success, data: ArticleSessionData }` | **Implemented & Verified** |
| `POST` | `/api/tasks/:id/article-session/quiz` | `requireAuth` | Normal | `{ sessionId, selectedOptionIndex }` | `{ success, data: { isCorrect, isCompleted } }` | **Implemented & Verified** |
| `POST` | `/api/tasks/:id/article-session/verify` | `requireAuth` | Mutex Locked | `{ sessionId }` | `{ success, data: { status, rewardPoints, completionId } }` | **Implemented & Verified** |

---

## 4. Referral & Downline Services (`referralRouter`)

| HTTP Method | Route | Auth Required | Rate Limiting | Request Schema | Response Format | Status / Implementation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/referrals/summary` | `requireAuth` | Normal | None | `{ success, data: ReferralSummaryResponse }` | **Implemented & Verified** |
| `GET` | `/api/referrals/directs` | `requireAuth` | Normal | Query: `?page=&limit=` | `{ success, data: { items, pagination } }` | **Implemented & Verified** |
| `GET` | `/api/referrals/tree` | `requireAuth` | Normal | Query: `?nodeId=` | `{ success, data: { nodeId, children } }` | **Implemented & Verified** |
| `GET` | `/api/referrals/downline` | `requireAuth` | Normal | Query: `?depth=` | `{ success, data: { totalDownline, levels } }` | **Implemented & Verified** |

---

## 5. Third-Party S2S Postbacks (`webhookTaskRouter`)

| HTTP Method | Route | Auth Required | Rate Limiting | Security Check | Response Format | Status / Implementation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/webhooks/campaigns/:campaignId/install-conversion` | S2S Webhook | IP / DDOS | `X-AdPayOn-Signature` (HMAC-SHA256) | `{ success: true, data: { conversionId } }` | **Implemented & Verified** |
| `POST` | `/api/webhooks/tasks/postback/:campaignId` | S2S Webhook | IP / DDOS | `X-Signature` or query token | `{ success: true }` | **Implemented & Verified** |

---

## 6. Identified Missing Endpoints (Gaps to Implement)

| Desired Capability | Missing Route | Target Consumers | Planned Module |
| :--- | :--- | :--- | :--- |
| **User Wallet Balance** | `GET /api/wallet/summary` | Mobile `WalletScreen` | `rewards/` or `wallet/` |
| **Ledger Transactions** | `GET /api/wallet/transactions` | Mobile `WalletScreen` | `ledger/` |
| **Withdrawal Request** | `POST /api/wallet/withdraw` | Mobile `WalletScreen` | `withdrawals/` |
| **KYC Document Submit** | `POST /api/users/kyc` | Mobile `KycUploadScreen` | `users/` |
| **Admin User Manager** | `GET /api/admin/users`, `PATCH /api/admin/users/:id` | Admin Dashboard | `admin/` |
| **Admin Withdrawals** | `GET /api/admin/withdrawals`, `POST /:id/review` | Admin Dashboard | `admin/` |
| **Account Deletion** | `POST /api/users/delete-account` | Mobile Profile & Play Policy | `users/` |
