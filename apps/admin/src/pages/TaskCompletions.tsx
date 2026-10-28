import React, { useEffect, useState } from 'react';
import {
  Activity,
  Search,
  Filter,
  Eye,
  Copy,
  Check,
  ShieldAlert,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { api } from '../services/api';
import { TaskCompletion, Pagination } from '../types';
import { DataTable, Column } from '../components/common/DataTable';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';

export const TaskCompletions: React.FC = () => {
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Evidence Inspection Modal & Review Actions
  const [selectedCompletion, setSelectedCompletion] = useState<TaskCompletion | null>(null);
  const [copiedClickId, setCopiedClickId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const fetchCompletions = async (page = 1) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.listCompletions({
        page,
        limit: 15,
        status: statusFilter,
        verificationMethod: methodFilter,
      });
      if (res.success) {
        setCompletions(res.data.completions);
        setPagination(res.data.pagination);
      } else {
        setErrorMessage('Failed to load task completions');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err?.message || 'Failed to load task completions');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCompletions(1);
  }, [statusFilter, methodFilter]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedClickId(id);
    setTimeout(() => setCopiedClickId(null), 2000);
  };

  const handleReview = async (status: 'VERIFIED' | 'REJECTED') => {
    if (!selectedCompletion) return;
    setIsReviewing(true);
    setReviewError(null);
    try {
      const res = await api.reviewCompletion(selectedCompletion.id, {
        status,
        adminReviewNotes: reviewNotes.trim() || (status === 'VERIFIED' ? 'Approved by admin' : 'Rejected by admin'),
        rejectionReason: status === 'REJECTED' ? reviewNotes.trim() || 'Submission rejected by administrator' : undefined,
      });
      if (res.success) {
        setSelectedCompletion(null);
        setReviewNotes('');
        await fetchCompletions(pagination.page);
      } else {
        setReviewError('Failed to record review determination');
      }
    } catch (err: any) {
      setReviewError(err.message || 'Error processing review action');
    } finally {
      setIsReviewing(false);
    }
  };

  const columns: Column<TaskCompletion>[] = [
    {
      header: 'Task & Campaign',
      accessor: (row) => {
        const taskTitle = typeof row.taskId === 'object' && row.taskId ? row.taskId.title : 'Task';
        const campaignName =
          typeof row.campaignId === 'object' && row.campaignId ? row.campaignId.name : 'Campaign';
        return (
          <div>
            <p className="font-semibold text-white tracking-tight">{taskTitle}</p>
            <p className="text-xs text-slate-400 mt-0.5">{campaignName}</p>
          </div>
        );
      },
    },
    {
      header: 'Earner Account',
      accessor: (row) => {
        const userName = typeof row.userId === 'object' && row.userId ? row.userId.name : 'Earner';
        const userMobile = typeof row.userId === 'object' && row.userId ? row.userId.mobile : '';
        return (
          <div>
            <p className="text-xs font-medium text-white">{userName}</p>
            <p className="text-[10px] text-slate-400 font-mono">{userMobile}</p>
          </div>
        );
      },
    },
    {
      header: 'Tracking Click ID',
      accessor: (row) => (
        <div className="flex items-center gap-1.5 font-mono text-xs text-slate-300">
          <span className="truncate max-w-[120px]">{row.clickId}</span>
          <button
            onClick={() => copyToClipboard(row.clickId, row.id)}
            title="Copy Click ID"
            className="p-1 hover:text-emerald-400 text-slate-500 transition"
          >
            {copiedClickId === row.id ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      ),
    },
    {
      header: 'Points',
      accessor: (row) => (
        <div className="flex items-center gap-1 font-bold text-amber-300 text-xs">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>{row.rewardPoints.toLocaleString()} PTS</span>
        </div>
      ),
    },
    {
      header: 'Verification Method',
      accessor: (row) => (
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-obsidian-800 text-cyan-400 border border-obsidian-700">
          {row.verificationMethod}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: (row) => <Badge status={row.status} size="sm" />,
    },
    {
      header: 'Completed At',
      accessor: (row) => (
        <span className="text-xs text-slate-400">
          {new Date(row.completedAt || row.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      header: 'Evidence / Action',
      className: 'text-right',
      accessor: (row) => (
        <button
          onClick={() => {
            setSelectedCompletion(row);
            setReviewNotes('');
            setReviewError(null);
          }}
          className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border transition ${
            row.status === 'PENDING_REVIEW'
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
              : 'text-emerald-400 hover:text-emerald-300 border-transparent hover:border-obsidian-700'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>{row.status === 'PENDING_REVIEW' ? 'Review Submission' : 'Inspect'}</span>
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Task Completion Stream</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Audit live earner completions, dwell-time verification evidence, and partner postback payloads.
          </p>
        </div>
      </div>

      {/* Visible Error Banner on Fetch Failure */}
      {errorMessage && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs text-rose-300">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => fetchCompletions(pagination.page)}
            className="px-3 py-1 text-xs font-semibold rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 transition shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Status Filter */}
        <div className="flex items-center gap-1 overflow-x-auto p-1 bg-obsidian-900 border border-obsidian-700 rounded-xl">
          {['ALL', 'PENDING_REVIEW', 'VERIFIED', 'FLAGGED', 'REJECTED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-obsidian-800'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Method Filter */}
        <div className="flex items-center gap-1 overflow-x-auto p-1 bg-obsidian-900 border border-obsidian-700 rounded-xl">
          {['ALL', 'FIRST_PARTY_ACTION', 'AUTHENTICATED_WEBHOOK', 'MANUAL_REVIEW'].map((m) => (
            <button
              key={m}
              onClick={() => setMethodFilter(m)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
                methodFilter === m
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-obsidian-800'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Completions Table */}
      <DataTable
        columns={columns}
        data={completions}
        pagination={pagination}
        isLoading={isLoading}
        onPageChange={(page) => fetchCompletions(page)}
        keyExtractor={(item) => item.id}
        emptyMessage="No completion records found matching criteria"
      />

      {/* Evidence Inspection Modal */}
      {selectedCompletion && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedCompletion(null)}
          title="Verification Evidence Inspector"
          subtitle={`Completion ID: ${selectedCompletion.id} • Click ID: ${selectedCompletion.clickId}`}
          maxWidth="xl"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-700">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Status</span>
                <div className="mt-1">
                  <Badge status={selectedCompletion.status} size="sm" />
                </div>
              </div>
              <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-700">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Method</span>
                <span className="text-cyan-400 font-mono mt-1 block">
                  {selectedCompletion.verificationMethod}
                </span>
              </div>
            </div>

            {selectedCompletion.adminReviewNotes && (
              <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-700 text-xs">
                <span className="text-slate-400 font-bold block mb-1">Admin Review Determination</span>
                <p className="text-slate-300">{selectedCompletion.adminReviewNotes}</p>
                {selectedCompletion.rejectionReason && (
                  <p className="text-rose-400 mt-1">Rejection: {selectedCompletion.rejectionReason}</p>
                )}
              </div>
            )}

            <div>
              <span className="text-xs font-bold text-white block mb-1.5">Evidence Payload Details</span>
              <pre className="p-4 rounded-xl bg-obsidian-950 border border-obsidian-700 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-60">
                {JSON.stringify(selectedCompletion.evidence || { status: 'Direct First-Party Verified Dwell Time' }, null, 2)}
              </pre>
            </div>

            {/* Review Decision Card for PENDING_REVIEW submissions */}
            {selectedCompletion.status === 'PENDING_REVIEW' && (
              <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Manual Review Determination
                  </h4>
                </div>
                <p className="text-xs text-slate-300">
                  Review the user feedback and evidence above. Approving will automatically credit{' '}
                  <strong className="text-amber-300">{selectedCompletion.rewardPoints} PTS</strong> to the user's double-entry wallet ledger.
                </p>

                {reviewError && (
                  <p className="text-xs text-rose-400 font-medium">{reviewError}</p>
                )}

                <input
                  type="text"
                  placeholder="Review notes or rejection reason (optional for approval)..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="w-full rounded-xl border border-obsidian-600 bg-obsidian-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
                />

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isReviewing}
                    onClick={() => handleReview('REJECTED')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 text-xs font-bold transition disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                  <button
                    type="button"
                    disabled={isReviewing}
                    onClick={() => handleReview('VERIFIED')}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition disabled:opacity-50"
                  >
                    {isReviewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    <span>Approve & Credit Reward</span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedCompletion(null)}
                className="rounded-xl border border-obsidian-600 bg-obsidian-800 px-4 py-2 text-xs font-semibold text-white hover:bg-obsidian-700 transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
