import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Layers,
  CheckSquare,
  Award,
  ShieldAlert,
  PlusCircle,
  ExternalLink,
  DollarSign,
  TrendingUp,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { api } from '../services/api';
import { PlatformMetrics } from '../types';
import { StatCard } from '../components/common/StatCard';

export const Dashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getMetrics();
      if (res.success) {
        setMetrics(res.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch platform metrics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const formatPaiseToRupees = (paise: number) => {
    return (paise / 100).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Welcome & Quick Refresh */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Executive Operations Console</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time status of advertiser campaigns, task execution, and fraud detection queues.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchMetrics}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-obsidian-700 bg-obsidian-800 px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-obsidian-700 hover:text-white transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Metrics</span>
          </button>
          <Link
            to="/campaigns/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-950/60 hover:from-emerald-500 hover:to-teal-400 transition"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>New Campaign</span>
          </Link>
        </div>
      </div>

      {/* Financial & Points Disclaimer Alert */}
      <div className="rounded-xl border border-obsidian-700 bg-obsidian-900/60 p-4 flex items-start gap-3 glass-panel">
        <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed">
          <span className="font-bold text-amber-300 uppercase tracking-wider">Accounting Separation Notice:</span>{' '}
          Advertiser budgets are accounted in INR (Paise) as commercial metadata. User rewards are issued strictly in{' '}
          <strong className="text-white">promotional, non-withdrawable Points (PTS)</strong>. Points carry no implied
          cash conversion rate and cannot be withdrawn.
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Active Campaigns"
          value={metrics ? `${metrics.campaigns.active} / ${metrics.campaigns.total}` : '...'}
          subtitle={`${metrics?.campaigns.draft || 0} in Draft • ${metrics?.campaigns.paused || 0} Paused`}
          icon={<Layers className="w-5 h-5" />}
          accent="emerald"
        />

        <StatCard
          title="Published Tasks"
          value={metrics ? `${metrics.tasks.published} / ${metrics.tasks.total}` : '...'}
          subtitle={`${metrics?.tasks.draft || 0} Draft • ${metrics?.tasks.paused || 0} Paused`}
          icon={<CheckSquare className="w-5 h-5" />}
          accent="cyan"
        />

        <StatCard
          title="Verified Completions"
          value={metrics ? metrics.completions.verified.toLocaleString() : '...'}
          subtitle={`${metrics?.completions.rejected || 0} Rejected • ${metrics?.completions.flagged || 0} Flagged`}
          icon={<Award className="w-5 h-5" />}
          accent="gold"
          badge={metrics?.completions.flagged ? `${metrics.completions.flagged} Under Review` : undefined}
        />

        <StatCard
          title="Promotional Points Issued"
          value={metrics ? `${metrics.financial.totalRewardPointsAwarded.toLocaleString()} PTS` : '...'}
          subtitle="Promotional non-cash rewards"
          icon={<TrendingUp className="w-5 h-5" />}
          accent="emerald"
        />
      </div>

      {/* Advertiser Commercial Accounting Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-obsidian-700 bg-obsidian-900 p-6 glass-panel">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white tracking-wide uppercase">Commercial Budget Accounting</h2>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-5 space-y-4">
            <div>
              <p className="text-xs text-slate-400">Total Contracted Advertiser Budget</p>
              <p className="text-2xl font-black text-white mt-1">
                {metrics ? formatPaiseToRupees(metrics.financial.totalBudgetPaise) : '...'}
              </p>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                {metrics?.financial.totalBudgetPaise.toLocaleString()} paise (commercial metadata)
              </p>
            </div>
            <div className="pt-3 border-t border-obsidian-750">
              <p className="text-xs text-slate-400">Total Spent / Attributed Budget</p>
              <p className="text-xl font-bold text-emerald-400 mt-1">
                {metrics ? formatPaiseToRupees(metrics.financial.totalSpentPaise) : '...'}
              </p>
            </div>
          </div>
        </div>

        {/* Operational Attention Queue */}
        <div className="lg:col-span-2 rounded-2xl border border-obsidian-700 bg-obsidian-900 p-6 glass-panel flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white tracking-wide uppercase">Fraud Detection & Review Queue</h2>
              <span className="flex items-center gap-1.5 text-xs text-rose-400 font-semibold">
                <ShieldAlert className="w-4 h-4" />
                Active Monitor
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              Completions flagged for abnormal dwell times, duplicate signatures, or partner anomalies require manual
              administrative determination before points are confirmed.
            </p>
            <div className="mt-4 flex items-center gap-6">
              <div>
                <span className="text-2xl font-extrabold text-rose-400">
                  {metrics?.completions.flagged || 0}
                </span>
                <span className="ml-2 text-xs text-slate-400">Pending Review</span>
              </div>
              <div className="h-8 w-px bg-obsidian-700" />
              <div>
                <span className="text-2xl font-extrabold text-slate-200">
                  {metrics?.completions.rejected || 0}
                </span>
                <span className="ml-2 text-xs text-slate-400">Total Rejections</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-obsidian-750 flex items-center justify-between">
            <span className="text-xs text-slate-400">Decision audit trail recorded for all manual reviews.</span>
            <Link
              to="/fraud-queue"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 transition"
            >
              <span>Open Review Queue</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
