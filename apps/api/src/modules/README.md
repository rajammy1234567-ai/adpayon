# ADPAYON API Module Architecture

This directory houses domain-driven modules for the ADPAYON backend modular monolith:

- `auth/`: User registration, OTP issuance & validation, Argon2id hashing, and JWT refresh token family rotation.
- `users/`: User profile management, status changes, device binding.
- `rewards/`: Verified earning streams (affiliate offers, ad views, check-in streaks, quizzes).
- `ledger/`: Mathematical double-entry ledger engine, append-only entries, balance aggregation.
- `withdrawals/`: Bank/UPI withdrawal requests, escrow deduction, gateway dispatch.
- `referrals/`: Unilevel genealogy tracking, referral code verification, feature-flagged commission calculation.
- `admin/`: Back-office review queues, manual KYC audits, manual withdrawal approvals.
