import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, AlertCircle, ShieldCheck, Sparkles, Clock, FlaskConical } from 'lucide-react';
import { api, ApiError } from '../services/api';
import { Campaign, TaskCategory, VerificationMethod } from '../types';

export const CreateEditTask: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const [searchParams] = useSearchParams();
  const initialCampaignId = searchParams.get('campaignId') || '';
  const navigate = useNavigate();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState(initialCampaignId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskCategory>('IN_APP_ACTION');
  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod>('FIRST_PARTY_ACTION');
  const [rewardPoints, setRewardPoints] = useState<number>(250);
  const [totalCap, setTotalCap] = useState<number>(1000);
  const [dailyCapPerUser, setDailyCapPerUser] = useState<number>(1);
  const [dwellTimeSeconds, setDwellTimeSeconds] = useState<number>(30);
  const [minAncestryDepth, setMinAncestryDepth] = useState<number>(0);
  const [kycRequired, setKycRequired] = useState<boolean>(false);
  const [externalActionUrl, setExternalActionUrl] = useState('');
  const [instructions, setInstructions] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const selectedCampaign = campaigns.find((c) => c.id === campaignId);
  const isSandboxCampaign = !!selectedCampaign?.isSandbox;

  const fillSandboxDefaults = () => {
    setTitle('[SANDBOX] Explore ADPAYON Features');
    setDescription('Explore ADPAYON platform features in the physical Android sandbox environment.');
    setInstructions(
      '1. Open the ADPAYON application.\n2. Navigate through the available tabs and features.\n3. Remain active for at least 30 seconds.\n4. Complete the task to verify non-withdrawable promotional points (10 PTS).'
    );
    setCategory('IN_APP_ACTION');
    setVerificationMethod('FIRST_PARTY_ACTION');
    setRewardPoints(10);
    setDwellTimeSeconds(30);
    setTotalCap(10);
    setDailyCapPerUser(1);
    setMinAncestryDepth(0);
    setKycRequired(false);
    setExternalActionUrl('');
  };

  useEffect(() => {
    async function loadInitialData() {
      setIsLoading(true);
      try {
        // Load campaigns for dropdown selector
        const campaignsRes = await api.listCampaigns({ limit: 100 });
        if (campaignsRes.success) {
          setCampaigns(campaignsRes.data.campaigns);
          if (!campaignId && campaignsRes.data.campaigns.length > 0) {
            setCampaignId(campaignsRes.data.campaigns[0].id);
          }
        }

        // Load task details if editing
        if (isEdit && id) {
          const taskRes = await api.getTask(id!);
          if (taskRes.success && taskRes.data.task) {
            const t = taskRes.data.task;
            setCampaignId(t.campaignId);
            setTitle(t.title);
            setDescription(t.description || '');
            setCategory(t.category);
            setVerificationMethod(t.verificationMethod);
            setRewardPoints(t.rewardPoints);
            setTotalCap(t.totalCap);
            setDailyCapPerUser(t.dailyCapPerUser);
            setDwellTimeSeconds(t.dwellTimeSeconds);
            setMinAncestryDepth(t.targeting?.minAncestryDepth || 0);
            setKycRequired(!!t.targeting?.kycRequired);
            setExternalActionUrl(t.externalActionUrl || '');
            setInstructions(t.instructions || '');
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load task setup data');
      } finally {
        setIsLoading(false);
      }
    }
    loadInitialData();
  }, [id, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsSaving(true);

    // Resolve description: explicit description -> earner instructions -> title
    const resolvedDescription = description.trim() || instructions.trim() || title.trim();

    const payload = {
      campaignId,
      title: title.trim(),
      description: resolvedDescription,
      category,
      verificationMethod,
      rewardPoints,
      totalCap,
      dailyCapPerUser,
      dwellTimeSeconds,
      targeting: {
        minAncestryDepth: minAncestryDepth > 0 ? minAncestryDepth : undefined,
        kycRequired,
      },
      externalActionUrl: externalActionUrl.trim() || undefined,
      instructions: instructions.trim() || undefined,
    };

    try {
      if (isEdit && id) {
        await api.updateTask(id!, payload);
      } else {
        await api.createTask(payload);
      }
      navigate('/tasks');
    } catch (err: any) {
      setError(err.message || 'Failed to save task configuration');
      if (err instanceof ApiError && err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      } else if (err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
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
      <div className="flex items-center gap-4">
        <Link
          to="/tasks"
          className="p-2 rounded-xl bg-obsidian-800 border border-obsidian-700 text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {isEdit ? 'Edit Task Specification' : 'Create New Earner Task'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure reward points, caps, dwell time verification thresholds, and audience targeting rules.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold block">{error}</span>
            {Object.keys(fieldErrors).length > 0 && (
              <ul className="list-disc list-inside space-y-0.5 text-rose-400/90 pl-1">
                {Object.entries(fieldErrors).map(([field, msg]) => (
                  <li key={field}>
                    <strong className="capitalize">{field}</strong>: {msg}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-2xl border border-obsidian-700 bg-obsidian-900 p-6 md:p-8 space-y-6 glass-panel">
        {isSandboxCampaign && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs text-amber-300 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <FlaskConical className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <strong className="text-amber-200 block text-sm">Sandbox Internal QA Task</strong>
                <span className="text-slate-300">
                  This task belongs to a sandbox campaign. It awards non-withdrawable promotional points (PTS), requires first-party dwell-time verification, and prohibits external partner tracking webhooks.
                </span>
              </div>
            </div>
            {!isEdit && (
              <button
                type="button"
                onClick={fillSandboxDefaults}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold text-xs transition whitespace-nowrap"
              >
                Fill QA Defaults
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Parent Advertiser Campaign *
            </label>
            <select
              required
              value={campaignId}
              onChange={(e) => {
                setCampaignId(e.target.value);
                clearFieldError('campaignId');
              }}
              disabled={isEdit}
              className={`w-full rounded-xl border ${
                fieldErrors.campaignId ? 'border-rose-500' : 'border-obsidian-600'
              } bg-obsidian-800/80 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none transition disabled:opacity-50`}
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.isSandbox ? `[SANDBOX] ${c.name} — ${c.advertiserName} (${c.status})` : `${c.name} — ${c.advertiserName} (${c.status})`}
                </option>
              ))}
            </select>
            {fieldErrors.campaignId && <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.campaignId}</p>}
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Task Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Install Swiggy Instamart App & Browse Grocery Categories"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                clearFieldError('title');
              }}
              className={`w-full rounded-xl border ${
                fieldErrors.title ? 'border-rose-500' : 'border-obsidian-600'
              } bg-obsidian-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition`}
            />
            {fieldErrors.title && <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.title}</p>}
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Task Summary / Short Description (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Brief summary displayed on task cards (defaults to earner instructions if omitted)..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                clearFieldError('description');
              }}
              className={`w-full rounded-xl border ${
                fieldErrors.description ? 'border-rose-500' : 'border-obsidian-600'
              } bg-obsidian-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition`}
            />
            {fieldErrors.description && <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.description}</p>}
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Earner Instructions *
            </label>
            <textarea
              rows={3}
              required
              placeholder="Step-by-step instructions displayed to earners in the mobile app feed..."
              value={instructions}
              onChange={(e) => {
                setInstructions(e.target.value);
                clearFieldError('instructions');
              }}
              className={`w-full rounded-xl border ${
                fieldErrors.instructions ? 'border-rose-500' : 'border-obsidian-600'
              } bg-obsidian-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition`}
            />
            {fieldErrors.instructions && <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.instructions}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Task Category
            </label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as TaskCategory);
                clearFieldError('category');
              }}
              className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none transition"
            >
              <option value="IN_APP_ACTION">IN_APP_ACTION (In-App Action)</option>
              <option value="PARTNER_WEBHOOK" disabled={isSandboxCampaign}>
                PARTNER_WEBHOOK {isSandboxCampaign ? '(Disabled in Sandbox)' : '(Server-to-Server Postback)'}
              </option>
              <option value="SURVEY">SURVEY (Market Research Questionnaire)</option>
              <option value="MANUAL_VERIFY">MANUAL_VERIFY (Administrative Inspection)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Verification Engine Method
            </label>
            <select
              value={verificationMethod}
              onChange={(e) => {
                setVerificationMethod(e.target.value as VerificationMethod);
                clearFieldError('verificationMethod');
              }}
              className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none transition"
            >
              <option value="FIRST_PARTY_ACTION">FIRST_PARTY_ACTION (Dwell-Time Enforced)</option>
              <option value="AUTHENTICATED_WEBHOOK" disabled={isSandboxCampaign}>
                AUTHENTICATED_WEBHOOK {isSandboxCampaign ? '(Disabled in Sandbox)' : '(Signed HMAC Postback)'}
              </option>
              <option value="MANUAL_REVIEW">MANUAL_REVIEW (Human Auditor Decision)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Promotional Reward Points *
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-amber-400">
                <Sparkles className="w-4 h-4" />
              </span>
              <input
                type="number"
                required
                min={1}
                value={rewardPoints}
                onChange={(e) => {
                  setRewardPoints(parseInt(e.target.value, 10) || 1);
                  clearFieldError('rewardPoints');
                }}
                className={`w-full rounded-xl border ${
                  fieldErrors.rewardPoints ? 'border-rose-500' : 'border-obsidian-600'
                } bg-obsidian-800/80 pl-9 pr-4 py-2.5 text-sm font-bold text-amber-300 focus:border-emerald-500 focus:outline-none transition`}
              />
            </div>
            {fieldErrors.rewardPoints && <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.rewardPoints}</p>}
            <p className="mt-1 text-[10px] text-slate-400 font-medium">
              Promotional Points (PTS). Non-withdrawable promotional credit.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Minimum Dwell Time (Seconds) *
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                <Clock className="w-4 h-4" />
              </span>
              <input
                type="number"
                required
                min={0}
                value={dwellTimeSeconds}
                onChange={(e) => {
                  setDwellTimeSeconds(parseInt(e.target.value, 10) || 0);
                  clearFieldError('dwellTimeSeconds');
                }}
                className={`w-full rounded-xl border ${
                  fieldErrors.dwellTimeSeconds ? 'border-rose-500' : 'border-obsidian-600'
                } bg-obsidian-800/80 pl-9 pr-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none transition`}
              />
            </div>
            {fieldErrors.dwellTimeSeconds && <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.dwellTimeSeconds}</p>}
            <p className="mt-1 text-[10px] text-slate-400">
              Anti-speedrun threshold: completions under this elapsed time are rejected automatically.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Total Global Completion Cap *
            </label>
            <input
              type="number"
              required
              min={1}
              value={totalCap}
              onChange={(e) => {
                setTotalCap(parseInt(e.target.value, 10) || 1);
                clearFieldError('totalCap');
              }}
              className={`w-full rounded-xl border ${
                fieldErrors.totalCap ? 'border-rose-500' : 'border-obsidian-600'
              } bg-obsidian-800/80 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none transition font-semibold`}
            />
            {fieldErrors.totalCap && <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.totalCap}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Daily Limit Per User *
            </label>
            <input
              type="number"
              required
              min={1}
              value={dailyCapPerUser}
              onChange={(e) => {
                setDailyCapPerUser(parseInt(e.target.value, 10) || 1);
                clearFieldError('dailyCapPerUser');
              }}
              className={`w-full rounded-xl border ${
                fieldErrors.dailyCapPerUser ? 'border-rose-500' : 'border-obsidian-600'
              } bg-obsidian-800/80 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none transition font-semibold`}
            />
            {fieldErrors.dailyCapPerUser && <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.dailyCapPerUser}</p>}
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Partner Action / Tracking URL (Optional)
            </label>
            <input
              type="url"
              placeholder={
                isSandboxCampaign
                  ? 'External URLs are strictly prohibited for sandbox tasks'
                  : 'https://track.advertiser.com/click?offer_id=123 (Leave blank for in-app tasks)'
              }
              disabled={isSandboxCampaign}
              readOnly={isSandboxCampaign}
              value={isSandboxCampaign ? '' : externalActionUrl}
              onChange={(e) => {
                setExternalActionUrl(e.target.value);
                clearFieldError('externalActionUrl');
              }}
              className={`w-full rounded-xl border ${
                fieldErrors.externalActionUrl ? 'border-rose-500' : 'border-obsidian-600'
              } bg-obsidian-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition ${
                isSandboxCampaign ? 'opacity-50 cursor-not-allowed bg-obsidian-900' : ''
              }`}
            />
            {fieldErrors.externalActionUrl && <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.externalActionUrl}</p>}
            {isSandboxCampaign && (
              <p className="mt-1 text-[10px] text-amber-400 font-mono">
                External advertiser webhooks are strictly prohibited for sandbox QA tasks.
              </p>
            )}
          </div>
        </div>

        {/* Audience Targeting Matrix Section */}
        <div className="pt-4 border-t border-obsidian-750">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
            Earner Audience Targeting Criteria
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-obsidian-700 bg-obsidian-800/40 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-white">KYC Verification Requirement</p>
                <p className="text-[11px] text-slate-400">Only earners with VERIFIED KYC status can start this task.</p>
              </div>
              <input
                type="checkbox"
                checked={kycRequired}
                onChange={(e) => setKycRequired(e.target.checked)}
                className="w-4 h-4 rounded border-obsidian-600 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-obsidian-900"
              />
            </div>

            <div className="p-4 rounded-xl border border-obsidian-700 bg-obsidian-800/40">
              <label className="block text-xs font-semibold text-white mb-1">
                Minimum Referral Ancestry Depth
              </label>
              <input
                type="number"
                min={0}
                value={minAncestryDepth}
                onChange={(e) => setMinAncestryDepth(parseInt(e.target.value, 10) || 0)}
                placeholder="0 = all earners eligible"
                className="w-full rounded-lg border border-obsidian-600 bg-obsidian-900 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Restricts task to users at or below specified unilevel tree depth (0 = open to direct & team).
              </p>
            </div>
          </div>
        </div>

        {/* Invariant Note */}
        <div className="rounded-xl border border-obsidian-700 bg-obsidian-800/50 p-4 text-xs text-slate-300 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
          <div className="leading-relaxed">
            <strong>Draft Lifecycle Safety:</strong> Newly created tasks remain in <strong>DRAFT</strong> status until
            explicitly published by an administrator. Tasks will not appear in the mobile app feed while in DRAFT.
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-obsidian-750">
          <Link
            to="/tasks"
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
            <span>{isEdit ? 'Save Task' : 'Create Task in Draft'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
