# ADPAYON — Monorepo Feature Inventory & Technical Architecture

**Audit Date:** October 2026  
**Target Environments:**
* **Production Cluster:** MongoDB Atlas `adpayon_production` / Cloud Edge
* **Client-Staging:** `https://adpayon-client-api.onrender.com/api` / MongoDB Atlas `adpayon_client_staging`
* **Local Sandbox/Development:** Ports 5000 (API), 5173 (Admin), 8081 (Mobile Web/Metro)

---

## 1. Monorepo Workspaces & Package Topology

| Workspace / Package | Tech Stack | Runtime / Role | Port / Target | Status |
| :--- | :--- | :--- | :--- | :--- |
| **`apps/api`** (`@adpayon/api`) | Node.js, Express, TypeScript, Mongoose | Core Backend API, Webhooks, Task Engine, Auth & Security | Port `5000` (Dev) / Render Cloud | **Production Active** |
| **`apps/admin`** (`@adpayon/admin`) | React 19, Vite 6, TailwindCSS, Lucide | Back-office Operations Center, Campaign & Task Management | Port `5173` (Vite Proxy $\rightarrow$ Staging) | **Production Active** |
| **`apps/mobile`** (`@adpayon/mobile`) | React Native 0.76, Expo SDK 52, React Navigation 7, Zustand | Cross-platform earner app (Android APK/AAB candidate) | Port `8081` (Metro Web / Android) | **Production Candidate** |
| **`packages/shared`** (`@adpayon/shared`) | TypeScript library | Shared domain types, Zod schemas, integer paise math utilities | Shared build dependency | **Active** |

---

## 2. API Endpoints & Service Modules (`apps/api`)

### A. Authentication & Session Services
* `POST /api/auth/register` — User registration with Indian mobile normalization, Argon2id hashing, sponsor tree attachment.
* `POST /api/auth/otp/send` — 6-digit CSPRNG OTP challenge generation with rate limiting & SMS provider dispatch.
* `POST /api/auth/otp/verify` — OTP timing-safe challenge verification; creates unverified/active user session.
* `POST /api/auth/login` — Mobile/Email + password credential check; issues JWT family (`accessToken` 15m, `refreshToken` 7d).
* `POST /api/auth/refresh` — Single-use refresh token family rotation; detects token replay and revokes compromised families.
* `POST /api/auth/logout` — Revokes active session and invalidates refresh token.
* `POST /api/auth/client-staging/demo-enroll` — Staging-only in-app reviewer identity creator with automatic OTP return.
* `GET /api/auth/me` — Authenticated earner profile (`requireAuth`).
* `GET /api/dev/otp/:mobile` — Loopback development endpoint for local OTP debugging (`NODE_ENV === 'development'`).

### B. Administrative Operations & 2FA (`adminAuthRouter` & `adminTaskRouter`)
* `POST /api/admin/auth/login` — Admin credential verification; validates `role === 'ADMIN'`; initiates mandatory 2FA challenge.
* `POST /api/admin/auth/mfa-verify` — Admin 2FA verification; verifies HMAC-SHA256 OTP challenge; creates administrative session.
* `POST /api/admin/auth/logout` — Terminates admin session and revokes tokens.
* `GET /api/admin/auth/me` — Fetches verified administrative profile.
* `GET /api/admin/metrics` — Dashboard KPI aggregator (active campaigns, task completions, fraud review volume, points).
* `POST /api/admin/campaigns` — Create advertising/educational campaign with budget and webhook secrets.
* `GET /api/admin/campaigns` — Paginated list of campaigns with status and date filters.
* `GET /api/admin/campaigns/:id` — Detailed campaign inspection.
* `PATCH /api/admin/campaigns/:id` — Update campaign budget, status, or date boundaries.
* `POST /api/admin/campaigns/:id/reveal-secret` — Controlled reveal of webhook HMAC secret with audit logging.
* `POST /api/admin/tasks` — Create task draft specification (Article, Video, App Feedback, Partner Webhook).
* `GET /api/admin/tasks` — Paginated task list with campaign and status filters.
* `GET /api/admin/tasks/:id` — Detailed task configuration inspect.
* `PATCH /api/admin/tasks/:id` — Edit task specification (restricted when active).
* `POST /api/admin/tasks/:id/publish` — Validate configuration and publish task to earner feeds.
* `POST /api/admin/tasks/:id/pause` — Temporarily suspend task participation.
* `POST /api/admin/tasks/:id/expire` — Force early expiration of task.
* `GET /api/admin/tasks/completions` — Monitor completions, telemetry evidence, and review queues.
* `POST /api/admin/tasks/completions/:id/review` — Approve (`VERIFIED`) or reject (`REJECTED`) manual review submissions.
* `GET /api/admin/audit-logs` — Append-only immutable administrative audit log stream.

### C. Earner Task Engine (`userTaskRouter`)
* `GET /api/tasks/feed` — Fetches active, unexpired, cap-eligible tasks targeted to earner's ancestry/KYC level.
* `POST /api/tasks/:id/start` — Claims task slot, acquires assignment lock, issues unique `clickId` token.
* `POST /api/tasks/:id/heartbeat` — Periodic foreground telemetry sync during active task execution.
* `POST /api/tasks/:id/verify-action` — Validates foreground intervals, monotonic dwell time, and completes first-party tasks.
* `GET /api/tasks/history` — Paginated list of user's past completions and verification statuses.
* `GET /api/tasks/summary` — Aggregate points and completion counters.
* `GET /api/tasks/:id/status` — Current assignment/attempt status for a specific task.
* `POST /api/tasks/:id/store-visit` — Telemetry recorder for Google Play store intent launches.
* `POST /api/tasks/:id/app-feedback/submit` — Validates App testing feedback, records evidence, awards promotional points.
* `POST /api/tasks/:id/video-session/start` — Initializes video playback watchdog session.
* `POST /api/tasks/:id/video-session/progress` — Ingests monotonic video progress intervals; prevents seeking.
* `GET /api/tasks/:id/video-session/:sessionId` — Queries video watchdog progress and quiz unlock status.
* `POST /api/tasks/:id/video-session/quiz` — Evaluates comprehension quiz answer; unlocks reward.
* `POST /api/tasks/:id/video-session/verify` — Atomically credits video learning reward.
* `POST /api/tasks/:id/article-session/start` — Initializes article reading dwell watchdog session.
* `POST /api/tasks/:id/article-session/progress` — Ingests scroll depth and reading time intervals.
* `GET /api/tasks/:id/article-session/:sessionId` — Queries article reading progress.
* `POST /api/tasks/:id/article-session/quiz` — Evaluates article comprehension quiz answer.
* `POST /api/tasks/:id/article-session/verify` — Atomically credits article reading reward.

### D. Referral & Genealogy Engine (`referralRouter`)
* `GET /api/referrals/summary` — Summary of directs count, team volume, referral codes, and sponsor.
* `GET /api/referrals/directs` — Paginated list of Level 1 direct referrals.
* `GET /api/referrals/tree` — Tree children hierarchy query for interactive team viewer.
* `GET /api/referrals/downline` — Complete unilevel downline aggregation.

### E. Partner Webhooks (`webhookTaskRouter`)
* `POST /api/webhooks/campaigns/:campaignId/install-conversion` — Authenticated S2S conversion webhook for affiliate partners.
* `POST /api/webhooks/tasks/postback/:campaignId` — General HMAC-SHA256 partner postback webhook.

---

## 3. Database Models & Schema Topology (`MongoDB / Mongoose`)

| Model | Collection | Primary Responsibility & Security Controls |
| :--- | :--- | :--- |
| **`User`** | `users` | Phone number normalization (`+91`), Argon2id password hash (`select: false`), role enforcement, referral genealogy path (`materializedPath`), KYC status metadata. |
| **`AuthSession`** | `auth_sessions` | Active JWT refresh tokens, device info, client IP, revocation status. |
| **`AuthSecurityEvent`** | `auth_security_events` | Immutable security audit log for login failures, OTP attempts, role escalation alerts. |
| **`OTPChallenge`** | `otp_challenges` | HMAC-SHA256 hashed OTPs, 5-minute TTL index, max 5 attempts counter, replay prevention. |
| **`Campaign`** | `campaigns` | Advertiser entity, total budget in integer paise, status machine (`DRAFT`, `ACTIVE`, `PAUSED`, `COMPLETED`), webhook secret. |
| **`Task`** | `tasks` | Task specification, category, dwell time requirements, global completion caps, daily user caps, article/video/app configs, version tracking. |
| **`TaskAssignment`** | `task_assignments` | Active task attempts, unique `clickId` token, time-to-live expiry, dwell-time intervals tracking. |
| **`TaskCompletion`** | `task_completions` | Completed attempts record, promotional reward points, verification method, status (`VERIFIED`, `REJECTED`, `FLAGGED`). |
| **`TaskEvent`** | `task_events` | Immutable ledger of task lifecycle transitions and attempts. |
| **`VerificationEvidence`** | `verification_evidence` | Raw telemetry payloads, quiz answers, feedback responses, webhook signatures. |
| **`ArticleReadingSession`** | `article_reading_sessions` | Watchdog session tracking monotonic scroll percentage and foreground reading seconds. |
| **`VideoPlaybackSession`** | `video_playback_sessions` | Watchdog session tracking continuous media playback intervals and anti-seeking verification. |
| **`AdminAuditLog`** | `admin_audit_logs` | Append-only administrative compliance trail documenting every campaign, task, and review action. |

---

## 4. Admin Dashboard Module Inventory (`apps/admin`)

1. **Executive Operations Console (`/`)** — Real-time metrics overview, active campaigns, total verified completions, platform health.
2. **Campaign Management (`/campaigns`)** — List, filter by status, create campaign (`/campaigns/new`), edit budget, reveal webhook secrets.
3. **Task Management (`/tasks`)** — Tabular listing with status badges (`DRAFT`, `PUBLISHED`, `PAUSED`, `EXPIRED`), pause/resume/expire actions.
4. **Task Specification Studio (`/tasks/new`, `/tasks/:id/edit`)** — Multi-category builder for Article, Video, App Feedback tasks with built-in Interactive Mobile Experience Simulator.
5. **Task Completion Monitor (`/completions`)** — Real-time feed of earner completions across all verification methods.
6. **Fraud Review Queue (`/fraud-queue`)** — Manual submission review, evidence inspector, approved/reject action with required review notes.
7. **Compliance Audit Logs (`/audit-logs`)** — Comprehensive audit log browser with action filtering and target entity lookup.
8. **Admin Profile & Security (`/profile`)** — Admin profile details, session parameters, 2FA status, clean logout.

---

## 5. Mobile Application Screen Inventory (`apps/mobile`)

| Screen Component | File Path | Route / Stack | Functionality |
| :--- | :--- | :--- | :--- |
| `SplashScreen` | `auth/SplashScreen.tsx` | Root (Initial) | Session rehydration, token validation, cold start router |
| `IntroScreen` | `auth/IntroScreen.tsx` | Auth Stack | Value proposition carousel, language selector, login entrypoint |
| `OTPLoginScreen` | `auth/OTPLoginScreen.tsx` | Auth Stack | Phone/Password login, Client Demo tab, error banners |
| `SignupScreen` | `auth/SignupScreen.tsx` | Auth Stack | New earner registration, referral code validation |
| `OTPVerifyScreen` | `auth/OTPVerifyScreen.tsx` | Auth Stack | 6-digit OTP verification for account activation |
| `ForgotPasswordScreen` | `auth/ForgotPasswordScreen.tsx` | Auth Stack | Password recovery challenge initiation |
| `DashboardScreen` | `dashboard/DashboardScreen.tsx` | MainTabs (`Home`) | Main dashboard, spendable balance, quick stats, daily streak entry |
| `EarnHubScreen` | `earn/EarnHubScreen.tsx` | MainTabs (`Earn`) | Task feed, category filters, task history, points balance |
| `ArticleReadTaskScreen`| `earn/ArticleReadTaskScreen.tsx`| Authenticated Stack | In-app article reader, scroll tracker, comprehension quiz |
| `VideoWatchTaskScreen` | `earn/VideoWatchTaskScreen.tsx` | Authenticated Stack | Video player watchdog, playback timer, comprehension quiz |
| `AppInstallTaskScreen` | `earn/AppInstallTaskScreen.tsx` | Authenticated Stack | Store link launcher, step instructions, UX feedback questionnaire |
| `WalletScreen` | `wallet/WalletScreen.tsx` | MainTabs (`Wallet`)| Balance breakdown, transaction history, withdrawal request modal |
| `MyTeamScreen` | `team/MyTeamScreen.tsx` | MainTabs (`Team`) | Referral network tree, direct invites list, commission stats |
| `ProfileSettingsScreen`| `profile/ProfileSettingsScreen.tsx`| MainTabs (`Profile`)| Profile details, language switcher, dark mode toggle, terms, logout |
| `KycUploadScreen` | `profile/KycUploadScreen.tsx` | Authenticated Stack | PAN, Aadhaar (last 4), bank account & UPI details upload |
| `ReferralInviteScreen` | `referral/ReferralInviteScreen.tsx`| Authenticated Stack| Referral link generator, social share intent |
| `DailyStreakScreen` | `gamification/DailyStreakScreen.tsx`| Authenticated Stack| 7-day attendance checkin challenge |
| `RankRewardsScreen` | `gamification/RankRewardsScreen.tsx`| Authenticated Stack| Rank tier progress and milestones |
| `ScratchEarnScreen` | `gamification/ScratchEarnScreen.tsx`| Authenticated Stack| Interactive scratch card bonus UI |
| `ChallengeListScreen` | `onboarding/ChallengeListScreen.tsx`| Authenticated Stack| Onboarding starter challenges to unlock dashboard |
| `QuizLeaderboardScreen`| `quiz/QuizLeaderboardScreen.tsx` | Authenticated Stack| Daily knowledge quiz ranking |
| `MobileRechargeScreen` | `utility/MobileRechargeScreen.tsx` | Authenticated Stack| Telecom utility recharge catalog |
| `ShoppingCashbackScreen`| `utility/ShoppingCashbackScreen.tsx`| Authenticated Stack| E-commerce brand affiliate directory |
