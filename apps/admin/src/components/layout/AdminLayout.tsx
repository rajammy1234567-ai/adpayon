import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Layers,
  CheckSquare,
  Activity,
  ShieldAlert,
  FileText,
  UserCheck,
  LogOut,
  Menu,
  X,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { isSandboxMode } from '../../services/api';

export const AdminLayout: React.FC = () => {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { to: '/campaigns', label: 'Campaigns', icon: <Layers className="w-5 h-5" /> },
    { to: '/tasks', label: 'Tasks', icon: <CheckSquare className="w-5 h-5" /> },
    { to: '/completions', label: 'Completion Monitor', icon: <Activity className="w-5 h-5" /> },
    {
      to: '/fraud-queue',
      label: 'Fraud Review Queue',
      icon: <ShieldAlert className="w-5 h-5" />,
      highlight: true,
    },
    { to: '/audit-logs', label: 'Audit Logs', icon: <FileText className="w-5 h-5" /> },
    { to: '/profile', label: 'Admin Profile', icon: <UserCheck className="w-5 h-5" /> },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-obsidian-950 font-sans text-slate-100">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex flex-col w-64 bg-obsidian-900 border-r border-obsidian-700 select-none">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-6 h-18 border-b border-obsidian-700 bg-obsidian-900/90">
          <div
            className={`flex items-center justify-center w-9 h-9 rounded-xl text-white shadow-lg font-black text-lg ${
              isSandboxMode
                ? 'bg-gradient-to-tr from-amber-600 to-orange-400 shadow-amber-950/60'
                : 'bg-gradient-to-tr from-emerald-600 to-teal-400 shadow-emerald-950/60'
            }`}
          >
            A
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-extrabold tracking-wider text-white">ADPAYON</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase border ${
                  isSandboxMode
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {isSandboxMode ? 'SANDBOX' : 'OPS'}
              </span>
            </div>
            <p className={`text-[10px] tracking-tight ${isSandboxMode ? 'text-amber-400/90 font-medium' : 'text-slate-400'}`}>
              {isSandboxMode ? 'Sandbox Dashboard (Port 5001)' : 'Administrative Operations'}
            </p>
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-1.5">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Platform Management
          </div>

          {navItems.map((item) => {
            const isActive =
              item.to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.to);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/30 shadow-inner'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-obsidian-800'
                }`}
              >
                <span className={isActive ? 'text-emerald-400' : 'text-slate-400'}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {item.highlight && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                )}
              </NavLink>
            );
          })}
        </div>

        {/* Admin Footer Badge */}
        <div className="p-4 border-t border-obsidian-700 bg-obsidian-900/70">
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-obsidian-800/80 border border-obsidian-700">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-emerald-950 border border-emerald-500/40 flex items-center justify-center font-bold text-xs text-emerald-400 shrink-0">
                {admin?.name?.charAt(0) || 'A'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">{admin?.name || 'Administrator'}</p>
                <p className="text-[10px] text-emerald-400 font-mono truncate">{admin?.mobile || 'Admin Session'}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Terminate Admin Session"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-obsidian-700 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Operational Header */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-obsidian-700 bg-obsidian-900/80 backdrop-blur z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-300 hover:bg-obsidian-800"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {isSandboxMode && (
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 text-xs font-bold text-amber-300 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>SANDBOX MODE (PORT 5001)</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="flex h-2 w-2 relative">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    isSandboxMode ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isSandboxMode ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                />
              </span>
              <span className="font-semibold text-slate-300">Cluster:</span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                  isSandboxMode
                    ? 'bg-amber-950/40 text-amber-300 border-amber-500/40'
                    : 'bg-obsidian-800 text-emerald-400 border-obsidian-700'
                }`}
              >
                {isSandboxMode ? 'adpayon_sandbox' : 'adpayon_dev / adpayon_test'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-lg bg-obsidian-800/80 border border-obsidian-700 text-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-400">Model:</span>
              <span className="text-amber-300 font-semibold">Promotional Non-Cash Points</span>
            </div>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-obsidian-600 bg-obsidian-800 text-xs font-semibold text-slate-300 hover:bg-rose-950/30 hover:border-rose-500/40 hover:text-rose-300 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-b border-obsidian-700 bg-obsidian-900 p-4 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-obsidian-800"
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        )}

        {/* Page Content Outlet */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-obsidian-950">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
