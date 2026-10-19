import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, AlertCircle, ShieldCheck, FlaskConical } from 'lucide-react';
import { api, isSandboxMode } from '../services/api';
import { CampaignStatus } from '../types';

export const CreateEditCampaign: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [isSandbox, setIsSandbox] = useState<boolean>(!isEdit && isSandboxMode);
  const [name, setName] = useState('');
  const [advertiserName, setAdvertiserName] = useState('');
  const [description, setDescription] = useState('');
  const [budgetRupees, setBudgetRupees] = useState<number>(!isEdit && isSandboxMode ? 0 : 10000);
  const [authorizedAgreementRef, setAuthorizedAgreementRef] = useState(!isEdit && isSandboxMode ? 'SANDBOX_INTERNAL_QA' : '');
  const [status, setStatus] = useState<CampaignStatus>('DRAFT');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit && id) {
      async function loadCampaign() {
        setIsLoading(true);
        try {
          const res = await api.getCampaign(id!);
          if (res.success && res.data.campaign) {
            const c = res.data.campaign;
            setName(c.name);
            setAdvertiserName(c.advertiserName);
            setDescription(c.description || '');
            setIsSandbox(!!c.isSandbox);
            setBudgetRupees(c.isSandbox ? 0 : c.advertiserBudgetPaise / 100);
            setAuthorizedAgreementRef(c.authorizedAgreementRef);
            setStatus(c.status);
            if (c.startDate) setStartDate(c.startDate.split('T')[0]);
            if (c.endDate) setEndDate(c.endDate.split('T')[0]);
          }
        } catch (err: any) {
          setError(err.message || 'Failed to load campaign');
        } finally {
          setIsLoading(false);
        }
      }
      loadCampaign();
    }
  }, [id, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    const budgetPaise = isSandbox ? 0 : Math.round(budgetRupees * 100);
    const resolvedAgreementRef = isSandbox
      ? (authorizedAgreementRef.trim() || 'SANDBOX_INTERNAL_QA')
      : authorizedAgreementRef.trim();

    try {
      if (isEdit && id) {
        await api.updateCampaign(id!, {
          name,
          advertiserName,
          description,
          advertiserBudgetPaise: budgetPaise,
          authorizedAgreementRef: resolvedAgreementRef,
          status,
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
        });
      } else {
        await api.createCampaign({
          name,
          advertiserName,
          description,
          advertiserBudgetPaise: budgetPaise,
          authorizedAgreementRef: resolvedAgreementRef,
          isSandbox,
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
        });
      }
      navigate('/campaigns');
    } catch (err: any) {
      setError(err.message || 'Failed to save campaign');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/campaigns"
          className="p-2 rounded-xl bg-obsidian-800 border border-obsidian-700 text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {isEdit ? 'Edit Advertiser Campaign' : 'Create Advertiser Campaign'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {isEdit
              ? 'Update campaign parameters, budget metadata, and lifecycle status.'
              : 'All new campaigns are created in DRAFT state by default.'}
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Form Card */}
      <form onSubmit={handleSubmit} className="rounded-2xl border border-obsidian-700 bg-obsidian-900 p-6 md:p-8 space-y-6 glass-panel">
        {isSandboxMode && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs text-amber-300 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <FlaskConical className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <strong className="text-amber-200 block text-sm">Sandbox QA Campaign Mode</strong>
                <span className="text-slate-300">
                  {isSandbox
                    ? 'Internal synthetic campaign for physical Android testing. Budget is locked at ₹0 paise (no fake funding). Real commercial contract is not required.'
                    : 'Normal commercial campaign mode.'}
                </span>
              </div>
            </div>
            {!isEdit && (
              <label className="flex items-center gap-2 cursor-pointer shrink-0">
                <span className="text-xs font-semibold text-amber-400">Sandbox QA:</span>
                <input
                  type="checkbox"
                  checked={isSandbox}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsSandbox(checked);
                    if (checked) {
                      setBudgetRupees(0);
                      if (!authorizedAgreementRef) setAuthorizedAgreementRef('SANDBOX_INTERNAL_QA');
                    } else {
                      setBudgetRupees(10000);
                      if (authorizedAgreementRef === 'SANDBOX_INTERNAL_QA') setAuthorizedAgreementRef('');
                    }
                  }}
                  className="w-4 h-4 rounded border-amber-600 text-amber-500 focus:ring-amber-500"
                />
              </label>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Campaign Name *
            </label>
            <input
              type="text"
              required
              placeholder={isSandbox ? 'e.g. [SANDBOX] QA Feature Exploration Campaign' : 'e.g. Swiggy Instamart Festive Acquisition'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              {isSandbox ? 'Synthetic Advertiser Identity *' : 'Advertiser Legal Entity *'}
            </label>
            <input
              type="text"
              required
              placeholder={isSandbox ? 'e.g. ADPAYON QA Synthetic Labs' : 'e.g. Bundl Technologies Pvt Ltd'}
              value={advertiserName}
              onChange={(e) => setAdvertiserName(e.target.value)}
              className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition"
            />
            {isSandbox && (
              <p className="mt-1 text-[10px] text-amber-400 font-mono">
                Clearly labeled synthetic advertiser identity for sandbox internal testing.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Authorized Agreement Reference *
            </label>
            <input
              type="text"
              required={!isSandbox}
              placeholder={isSandbox ? 'e.g. SANDBOX_INTERNAL_QA' : 'e.g. AGR-SWG-2026-Q4-01'}
              value={authorizedAgreementRef}
              onChange={(e) => setAuthorizedAgreementRef(e.target.value)}
              className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm font-mono text-emerald-400 placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              {isSandbox
                ? 'Internal synthetic agreement reference. No commercial advertiser contract required.'
                : 'Mandatory signed agreement reference. Campaign cannot be activated without verified agreement.'}
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Campaign Description & Internal Notes
            </label>
            <textarea
              rows={3}
              placeholder="Operational objectives, partner contacts, or target performance metrics..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Advertiser Budget (INR) *
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm font-semibold">
                ₹
              </span>
              <input
                type="number"
                required
                min={0}
                step={100}
                disabled={isSandbox}
                readOnly={isSandbox}
                value={isSandbox ? 0 : budgetRupees}
                onChange={(e) => setBudgetRupees(parseFloat(e.target.value) || 0)}
                className={`w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 pl-8 pr-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none transition font-semibold ${
                  isSandbox ? 'opacity-60 cursor-not-allowed bg-obsidian-900' : ''
                }`}
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-400 font-mono">
              {isSandbox
                ? 'Strictly ₹0 (0 paise) for sandbox QA campaigns. No fake advertiser funding.'
                : `Stored as ${Math.round(budgetRupees * 100).toLocaleString()} paise in monetary accounting ledger.`}
            </p>
          </div>

          {isEdit && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Lifecycle Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as CampaignStatus)}
                className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none transition"
              >
                <option value="DRAFT">DRAFT (Unpublished / Not live)</option>
                <option value="ACTIVE">ACTIVE (Authorized & Eligible for Tasks)</option>
                <option value="PAUSED">PAUSED (Temporarily suspended)</option>
                <option value="COMPLETED">COMPLETED (Concluded)</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Start Date (Optional)
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              End Date (Optional)
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none transition"
            />
          </div>
        </div>

        {/* Safety Disclaimer Banner */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/30 p-4 text-xs text-emerald-300 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
          <div className="leading-relaxed">
            <strong>Publication Safety Invariant:</strong> Tasks associated with this campaign cannot be published to
            earners unless this campaign is verified and in <strong>ACTIVE</strong> status.
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-obsidian-750">
          <Link
            to="/campaigns"
            className="rounded-xl border border-obsidian-600 bg-obsidian-800 px-5 py-2.5 text-xs font-semibold text-slate-300 hover:bg-obsidian-700 transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-950/60 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-50 transition"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{isEdit ? 'Save Changes' : 'Create Campaign'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
