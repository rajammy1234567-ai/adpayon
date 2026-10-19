import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserCheck,
  Shield,
  Phone,
  Key,
  LogOut,
  CheckCircle2,
  Calendar,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const AdminProfile: React.FC = () => {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Administrator Identity & Permissions</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Verified operational profile, role-based authorization matrix, and active session controls.
        </p>
      </div>

      {/* Profile Card */}
      <div className="rounded-2xl border border-obsidian-700 bg-obsidian-900 p-6 md:p-8 space-y-6 glass-panel">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-obsidian-750">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 border border-emerald-500/40 flex items-center justify-center font-black text-2xl text-white shadow-xl shadow-emerald-950/80">
              {admin?.name?.charAt(0) || 'A'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">{admin?.name}</h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider">
                  {admin?.role}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{admin?.mobile}</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-rose-500/40 bg-rose-950/30 text-rose-300 text-xs font-semibold hover:bg-rose-950/50 transition self-start sm:self-auto"
          >
            <LogOut className="w-4 h-4" />
            <span>Terminate Session</span>
          </button>
        </div>

        {/* Credentials & Identification Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-obsidian-800/40 border border-obsidian-700 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Phone className="w-3.5 h-3.5 text-slate-500" />
              <span>Registered Mobile Number</span>
            </div>
            <p className="text-sm font-semibold text-white font-mono">{admin?.mobile}</p>
          </div>

          <div className="p-4 rounded-xl bg-obsidian-800/40 border border-obsidian-700 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Key className="w-3.5 h-3.5 text-slate-500" />
              <span>Admin Referral Tag</span>
            </div>
            <p className="text-sm font-semibold text-emerald-400 font-mono">{admin?.referralCode}</p>
          </div>
        </div>

        {/* Permissions Matrix */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Authorized Security Grants</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {(admin?.permissions || []).map((perm) => (
              <div
                key={perm}
                className="flex items-center gap-2 p-2.5 rounded-xl bg-obsidian-800/60 border border-obsidian-700 text-xs text-slate-300"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="font-mono text-[11px] truncate">{perm}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Session Security Details */}
        <div className="rounded-xl border border-obsidian-700 bg-obsidian-800/30 p-4 text-xs text-slate-300 flex items-start gap-3">
          <Lock className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
          <div className="space-y-1 leading-relaxed">
            <p className="font-semibold text-white">MFA Verified Session</p>
            <p className="text-slate-400">
              Session secured via 2FA OTP verification and cryptographic Argon2id password hashing. Tokens are
              short-lived and rotated on active API interactions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
