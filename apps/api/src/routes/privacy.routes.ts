import { Router, Request, Response } from 'express';

export const privacyRouter = Router();

const PRIVACY_POLICY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy — AdPayOn</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --border: #1f2937;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --primary: #3b82f6;
      --accent: #10b981;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
      margin: 0;
      padding: 40px 20px;
    }
    .container {
      max-width: 860px;
      margin: 0 auto;
      background: var(--card-bg);
      padding: 40px;
      border-radius: 12px;
      border: 1px solid var(--border);
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    }
    h1 {
      color: #fff;
      font-size: 2.2rem;
      margin-top: 0;
      border-bottom: 2px solid var(--border);
      padding-bottom: 16px;
    }
    h2 {
      color: var(--primary);
      font-size: 1.4rem;
      margin-top: 32px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
    }
    p, li {
      color: var(--text-muted);
      font-size: 1rem;
    }
    strong {
      color: #fff;
    }
    .badge {
      display: inline-block;
      background: rgba(59, 130, 246, 0.2);
      color: var(--primary);
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 20px;
    }
    .alert-box {
      background: rgba(16, 185, 129, 0.1);
      border-left: 4px solid var(--accent);
      padding: 16px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }
    a {
      color: var(--primary);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge">Google Play Developer Policy Compliant</div>
    <h1>Privacy Policy for AdPayOn</h1>
    <p><strong>Effective Date:</strong> October 23, 2026 | <strong>Last Updated:</strong> October 2026</p>

    <div class="alert-box">
      <strong>Transparency Commitment:</strong> AdPayOn ("we", "our", or "us") provides an educational learning, task discovery, and reward platform. We respect your privacy, enforce data minimization, and adhere strictly to Google Play Data Safety, applicable financial regulations, and digital personal data protection standards.
    </div>

    <h2>1. Information We Collect</h2>
    <p>We collect only the minimum personal information strictly necessary to deliver platform features, prevent fraud, and comply with legal requirements:</p>
    <ul>
      <li><strong>Account Credentials:</strong> Mobile phone number (+91 format) used for one-time password (OTP) verification and authentication.</li>
      <li><strong>Task Telemetry & Activity Data:</strong> Time spent reading educational articles, video playback session completion events, comprehension quiz answers, and user feedback submissions.</li>
      <li><strong>Device & Network Data:</strong> IP address, device operating system version, and client user-agent strictly for account security, rate-limiting, and fraud prevention. <em>We do NOT harvest device contacts, media galleries, location GPS, or scan installed application packages.</em></li>
      <li><strong>KYC & Banking Information (Withdrawal Earners Only):</strong> When you request a payout of earned rewards, we collect your Full Name, Government Identity Document (PAN / Aadhaar) for KYC identity validation, and your verified Bank Account Number / IFSC code or UPI ID to execute the bank payout.</li>
    </ul>

    <h2>2. How We Use Your Information</h2>
    <ul>
      <li><strong>Authentication:</strong> Cryptographic verification of phone numbers via SMS OTP.</li>
      <li><strong>Reward Verification:</strong> Evaluating genuine engagement with tasks before crediting promotional reward points to your immutable ledger balance.</li>
      <li><strong>Fraud Prevention & Integrity:</strong> Detecting multi-accounting, automated bots, playback emulation, and suspicious withdrawal patterns.</li>
      <li><strong>Financial Compliance:</strong> Fulfilling mandatory Know-Your-Customer (KYC) requirements, tax reporting, and anti-money laundering (PMLA) obligations.</li>
    </ul>

    <h2>3. Data Sharing & Third-Party Service Providers</h2>
    <p>We do NOT sell, rent, or trade your personal information to third-party data brokers or marketing firms. Data is disclosed only to trusted infrastructure providers strictly under confidential processing agreements:</p>
    <ul>
      <li><strong>Cloud Hosting & Database:</strong> Render Inc. (API hosting) and MongoDB Atlas (encrypted database storage).</li>
      <li><strong>SMS Gateways:</strong> Authorized telecom aggregators for transmitting one-time login OTPs.</li>
      <li><strong>Banking & Payout Partners:</strong> RBI-licensed banking partners and payment aggregators (e.g., Razorpay / Cashfree) strictly to disburse approved wallet withdrawals directly to your account.</li>
    </ul>

    <h2>4. Data Retention & Mandatory Account Deletion</h2>
    <p>In full compliance with Google Play's Account Deletion Policy:</p>
    <ul>
      <li><strong>In-App Deletion:</strong> You can delete your account and all associated personal data instantly from within the AdPayOn mobile application via <strong>Profile Settings &rarr; Delete Account & Personal Data</strong>.</li>
      <li><strong>Public Web Deletion:</strong> If you have uninstalled the app or lost access, you can submit a deletion request via our public portal at <a href="/privacy/delete-account">https://adpayon.com/privacy/delete-account</a>.</li>
      <li><strong>Erasure Process:</strong> Upon deletion, your login tokens are immediately revoked, your user status is flagged <code>DELETED</code>, and your personal identifiers (phone number, name, device fingerprints) are scrubbed and anonymized.</li>
      <li><strong>Statutory Retention:</strong> In compliance with Indian financial compliance regulations (PMLA 2002), completed financial withdrawal ledger transactions are retained in a secure, read-only audit archive for the statutory retention period (up to 5 years).</li>
    </ul>

    <h2>5. Security & Encryption</h2>
    <p>All data transmitted between the AdPayOn mobile app, Admin Dashboard, and backend servers is encrypted in transit using industry-standard Transport Layer Security (TLS 1.3 / HTTPS). Sensitive database fields and authentication tokens are cryptographically salted and hashed.</p>

    <h2>6. Contact Us & Grievance Officer</h2>
    <p>If you have any questions, concerns, or requests regarding this Privacy Policy or your personal data, please contact our Grievance Officer:</p>
    <p>
      <strong>Grievance Officer:</strong> Compliance & Data Protection Team<br>
      <strong>Email:</strong> privacy@adpayon.com<br>
      <strong>Web Portal:</strong> <a href="/privacy/delete-account">https://adpayon.com/privacy/delete-account</a>
    </p>
  </div>
</body>
</html>`;

const ACCOUNT_DELETION_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account & Data Deletion Request — AdPayOn</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --border: #1f2937;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --primary: #ef4444;
      --accent: #3b82f6;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
      margin: 0;
      padding: 40px 20px;
    }
    .container {
      max-width: 720px;
      margin: 0 auto;
      background: var(--card-bg);
      padding: 40px;
      border-radius: 12px;
      border: 1px solid var(--border);
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    }
    h1 {
      color: #fff;
      font-size: 2rem;
      margin-top: 0;
      border-bottom: 2px solid var(--border);
      padding-bottom: 16px;
    }
    p, li {
      color: var(--text-muted);
      font-size: 1rem;
    }
    strong {
      color: #fff;
    }
    .badge {
      display: inline-block;
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 20px;
    }
    .alert-box {
      background: rgba(239, 68, 68, 0.1);
      border-left: 4px solid var(--primary);
      padding: 16px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      font-weight: 600;
      margin-bottom: 8px;
      color: #fff;
    }
    input[type="text"], input[type="tel"], textarea {
      width: 100%;
      padding: 12px;
      background: #1f2937;
      border: 1px solid #374151;
      border-radius: 8px;
      color: #fff;
      font-size: 1rem;
      box-sizing: border-box;
    }
    input:focus, textarea:focus {
      outline: none;
      border-color: var(--accent);
    }
    button {
      background: var(--primary);
      color: #fff;
      border: none;
      padding: 14px 28px;
      font-size: 1rem;
      font-weight: 700;
      border-radius: 8px;
      cursor: pointer;
      width: 100%;
      transition: background 0.2s;
    }
    button:hover {
      background: #dc2626;
    }
    a {
      color: var(--accent);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge">Google Play Requirement — Public Deletion URL</div>
    <h1>Request Account & Data Deletion</h1>

    <div class="alert-box">
      <strong>Important Warning:</strong> Requesting account deletion will immediately terminate your AdPayOn session, forfeit any unredeemed points or pending task submissions, and purge your personal profile data.
    </div>

    <p>In accordance with Google Play's User Data policy and applicable data privacy regulations, AdPayOn allows all users to request complete deletion of their account and associated data without requiring the app to be installed.</p>

    <h3>Types of Data Deleted:</h3>
    <ul>
      <li>User Account Profile (Registered phone number, name, authentication credentials)</li>
      <li>Active and historical session tokens (immediate revocation)</li>
      <li>Task interaction history, quiz attempts, and user feedback text</li>
      <li>Unprocessed KYC document files and personal banking credentials</li>
    </ul>

    <h3>Data Retained for Legal Compliance:</h3>
    <ul>
      <li>Financial ledger transaction history for completed monetary withdrawals is retained for up to 5 years strictly to fulfill mandatory Prevention of Money Laundering Act (PMLA 2002) and tax compliance regulations. Retained records are kept in encrypted, access-restricted cold storage and never used for marketing.</li>
    </ul>

    <h2>Submit Web Deletion Request</h2>
    <form action="/api/users/delete-account-public" method="POST">
      <div class="form-group">
        <label for="mobile">Registered Mobile Number (+91 format):</label>
        <input type="tel" id="mobile" name="mobile" placeholder="+91XXXXXXXXXX" required>
      </div>
      <div class="form-group">
        <label for="reason">Reason for Account Deletion (Optional):</label>
        <textarea id="reason" name="reason" rows="3" placeholder="Let us know why you are leaving..."></textarea>
      </div>
      <div class="form-group">
        <label>
          <input type="checkbox" required> I understand that this action is permanent and cannot be undone.
        </label>
      </div>
      <button type="submit">Permanently Delete My Account & Data</button>
    </form>

    <p style="margin-top: 30px; text-align: center; font-size: 0.9rem;">
      Need assistance? Contact our Data Privacy Officer at <a href="mailto:privacy@adpayon.com">privacy@adpayon.com</a>.<br>
      Read our full <a href="/privacy">Privacy Policy</a>.
    </p>
  </div>
</body>
</html>`;

privacyRouter.get(['/privacy', '/privacy-policy', '/api/privacy'], (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(PRIVACY_POLICY_HTML);
});

privacyRouter.get(['/privacy/delete-account', '/api/privacy/delete-account'], (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(ACCOUNT_DELETION_HTML);
});
