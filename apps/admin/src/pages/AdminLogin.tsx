import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, Phone, KeyRound, ArrowRight, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isSandboxMode } from '../services/api';

export const AdminLogin: React.FC = () => {
  const { login, verifyMfa } = useAuth();
  const navigate = useNavigate();

  // Step 1: Credentials | Step 2: MFA
  const [step, setStep] = useState<'CREDENTIALS' | 'MFA'>('CREDENTIALS');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [mfaSessionToken, setMfaSessionToken] = useState('');
  const [maskedMobile, setMaskedMobile] = useState('');
  const [stagingTestOtp, setStagingTestOtp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setError(null);
    setIsLoading(true);

    try {
      const data = await login(mobile.trim(), password, { timeoutMs: 15000 });
      if (data && data.mfaRequired) {
        setMfaSessionToken(data.mfaSessionToken);
        setMaskedMobile(data.maskedMobile);
        if (data.testOtp) {
          setStagingTestOtp(data.testOtp);
        } else {
          setStagingTestOtp(null);
        }
        setStep('MFA');
      } else {
        setError('Unexpected authentication response. Please verify credentials and try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate administrator credentials. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setError(null);
    setIsLoading(true);

    try {
      await verifyMfa(mfaSessionToken, otp.trim(), { timeoutMs: 15000 });
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Invalid or expired 2FA verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-obsidian-950 p-4 font-sans text-slate-100">
      {/* Background radial glow */}
      <div
        className={`absolute inset-0 pointer-events-none ${
          isSandboxMode
            ? 'bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(245,158,11,0.15),rgba(255,255,255,0))]'
            : 'bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.15),rgba(255,255,255,0))]'
        }`}
      />

      <div className="relative w-full max-w-md rounded-2xl border border-obsidian-700 bg-obsidian-900/90 p-8 shadow-2xl backdrop-blur-xl glass-panel-elevated">
        {/* Sandbox Indicator Banner */}
        {isSandboxMode && (
          <div className="mb-6 flex items-center justify-center gap-2 rounded-xl bg-amber-500/15 border border-amber-500/40 py-2 px-3 text-xs font-bold text-amber-300 shadow-sm animate-pulse">
            <Shield className="w-4 h-4 text-amber-400" />
            <span>SANDBOX DASHBOARD (API: 127.0.0.1:5001)</span>
          </div>
        )}

        {/* Brand Banner */}
        <div className="text-center">
          <div
            className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-xl font-black text-2xl ${
              isSandboxMode
                ? 'bg-gradient-to-tr from-amber-600 to-orange-400 shadow-amber-950/80'
                : 'bg-gradient-to-tr from-emerald-600 to-teal-400 shadow-emerald-950/80'
            }`}
          >
            A
          </div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-white">
            {isSandboxMode ? 'ADPAYON SANDBOX OPERATIONS' : 'ADPAYON OPERATIONS'}
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            {step === 'CREDENTIALS'
              ? isSandboxMode
                ? 'Authorized Sandbox Administrative Command Center'
                : 'Authorized Administrative Command Center'
              : 'Two-Factor Authentication Challenge'}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3.5 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {step === 'CREDENTIALS' ? (
          <form onSubmit={handleCredentialsSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Admin Mobile Phone
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="+91 98765 43210"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Admin Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/60 hover:from-emerald-500 hover:to-teal-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 transition"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Proceed to 2FA</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleMfaSubmit} className="mt-6 space-y-4">
            <div className="rounded-xl border border-obsidian-700 bg-obsidian-800/60 p-3.5 text-xs text-slate-300 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Verification code dispatched to <strong className="text-white">{maskedMobile}</strong>
              </span>
            </div>

            {stagingTestOtp && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-300">Staging test OTP — no SMS sent:</span>
                  <span className="font-mono text-base font-bold text-amber-400">{stagingTestOtp}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOtp(stagingTestOtp);
                    setError(null);
                  }}
                  className="w-full rounded-lg bg-amber-500/25 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/35 transition"
                >
                  ⚡ Auto-fill 2FA Code
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                6-Digit MFA Verification Code
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 pl-9 pr-4 py-2.5 text-lg font-mono tracking-widest text-emerald-400 placeholder-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep('CREDENTIALS');
                  setError(null);
                }}
                disabled={isLoading}
                className="w-1/3 rounded-xl border border-obsidian-600 bg-obsidian-800 py-2.5 text-xs font-medium text-slate-300 hover:bg-obsidian-700 transition"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isLoading || otp.length !== 6}
                className="w-2/3 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/60 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-50 transition"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Authorizing...</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    <span>Authorize Session</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Security Disclaimers */}
        <div className="mt-8 border-t border-obsidian-700 pt-4 text-center text-[10px] text-slate-500 space-y-1">
          <p>Strict administrative access controls enforced. All actions recorded.</p>
          <p>Unauthorized access attempts will trigger automatic IP security alerts.</p>
        </div>
      </div>
    </div>
  );
};
