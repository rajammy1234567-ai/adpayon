import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Eye,
  Check,
  Copy,
  Sparkles,
} from 'lucide-react';
import { api } from '../services/api';
import { TaskCompletion, Pagination } from '../types';
import { DataTable, Column } from '../components/common/DataTable';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';

export const FraudReviewQueue: React.FC = () => {
  const [flaggedItems, setFlaggedItems] = useState<TaskCompletion[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);

  // Review Decision Modal State
  const [itemToReview, setItemToReview] = useState<TaskCompletion | null>(null);
  const [decision, setDecision] = useState<'VERIFIED' | 'REJECTED'>('VERIFIED');
  const [reviewNotes, setReviewNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const fetchFlaggedCompletions = async (page = 1) => {
    setIsLoading(true);
    try {
      const res = await api.listCompletions({ page, limit: 10, status: 'FLAGGED' });
      if (res.success) {
        setFlaggedItems(res.data.completions);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFlaggedCompletions(1);
  }, []);

  const handleOpenReview = (item: TaskCompletion) => {
    setItemToReview(item);
    setDecision('VERIFIED');
    setReviewNotes('');
    setRejectionReason('');
    setDecisionError(null);
  };

  const handleDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemToReview) return;

    if (reviewNotes.trim().length < 5) {
      setDecisionError('Admin review notes are mandatory and must be at least 5 characters');
      return;
    }

    setIsSubmitting(true);
    setDecisionError(null);

    try {
      await api.reviewCompletion(itemToReview.id, {
        status: decision,
        adminReviewNotes: reviewNotes.trim(),
        rejectionReason: decision === 'REJECTED' ? rejectionReason.trim() : undefined,
      });

      setItemToReview(null);
      await fetchFlaggedCompletions(pagination.page);
    } catch (err: any) {
      setDecisionError(err.message || 'Failed to record administrative determination');
    } finally {
      setIsSubmitting(false);
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
      header: 'Click ID',
      accessor: (row) => <span className="font-mono text-xs text-slate-300">{row.clickId}</span>,
    },
    {
      header: 'Points at Stake',
      accessor: (row) => (
        <span className="font-bold text-amber-300 text-xs">
          {row.rewardPoints.toLocaleString()} PTS
        </span>
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
      header: 'Actions',
      className: 'text-right',
      accessor: (row) => (
        <button
          onClick={() => handleOpenReview(row)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/20 text-rose-300 border border-rose-500/40 text-xs font-semibold hover:bg-rose-600/30 transition shadow-sm"
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Make Determination</span>
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">Fraud Review Queue</h1>
            <span className="px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-500/30 text-xs font-bold">
              {pagination.total} Flagged
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Manual administrative determination queue for abnormal completion patterns, timestamp skews, or dwell-time failures.
          </p>
        </div>
      </div>

      {/* Review Queue Table */}
      <DataTable
        columns={columns}
        data={flaggedItems}
        pagination={pagination}
        isLoading={isLoading}
        onPageChange={(page) => fetchFlaggedCompletions(page)}
        keyExtractor={(item) => item.id}
        emptyMessage="Fraud review queue is clear! No completions currently require manual determination."
      />

      {/* Determination Decision Modal */}
      {itemToReview && (
        <Modal
          isOpen={true}
          onClose={() => setItemToReview(null)}
          title="Administrative Fraud Review Determination"
          subtitle={`Click ID: ${itemToReview.clickId} • Points: ${itemToReview.rewardPoints} PTS`}
          maxWidth="lg"
        >
          <form onSubmit={handleDecisionSubmit} className="space-y-5">
            {decisionError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300">
                {decisionError}
              </div>
            )}

            <div className="p-4 rounded-xl bg-obsidian-950 border border-obsidian-700 space-y-2 text-xs">
              <span className="font-bold text-slate-300 uppercase tracking-wider block text-[10px]">
                Audit Evidence Payload
              </span>
              <pre className="font-mono text-[11px] text-slate-400 overflow-x-auto max-h-36">
                {JSON.stringify(itemToReview.evidence || { status: 'Flagged for suspicious engagement' }, null, 2)}
              </pre>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Determination Decision *
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDecision('VERIFIED')}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition ${
                    decision === 'VERIFIED'
                      ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500 shadow-emerald-950/50 shadow'
                      : 'bg-obsidian-800 text-slate-400 border-obsidian-700 hover:text-white'
                  }`}
                >
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span>Verify & Credit Points</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDecision('REJECTED')}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition ${
                    decision === 'REJECTED'
                      ? 'bg-red-600/20 text-red-300 border-red-500 shadow-red-950/50 shadow'
                      : 'bg-obsidian-800 text-slate-400 border-obsidian-700 hover:text-white'
                  }`}
                >
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span>Reject Completion</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Admin Review Notes & Rationale *
              </label>
              <textarea
                rows={3}
                required
                placeholder="State the verifiable reason for approving or rejecting this flagged completion..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition"
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Mandatory notes. Permanently archived in the compliance audit log.
              </p>
            </div>

            {decision === 'REJECTED' && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Earner Facing Rejection Reason
                </label>
                <input
                  type="text"
                  placeholder="e.g. Automated script detected / Insufficient elapsed engagement"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-obsidian-750">
              <button
                type="button"
                onClick={() => setItemToReview(null)}
                disabled={isSubmitting}
                className="rounded-xl border border-obsidian-600 bg-obsidian-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-obsidian-700 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-bold text-white transition ${
                  decision === 'VERIFIED'
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/60 shadow-lg'
                    : 'bg-red-600 hover:bg-red-500 shadow-red-950/60 shadow-lg'
                }`}
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Commit Determination</span>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
