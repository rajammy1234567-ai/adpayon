import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Modal } from '../components/common/Modal';
import { Sparkles, CheckCircle2, XCircle, ExternalLink, Image as ImageIcon, Eye } from 'lucide-react';

interface Submission {
  _id: string;
  offerId: { title: string; description?: string } | null;
  userId: { name: string; referralCode: string; mobile?: string } | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rewardPoints: number;
  usdEquivalent?: number;
  notes?: string;
  proofUrl?: string;
  proofFileId?: string;
  completionCode?: string;
  reviewNotes?: string;
  createdAt?: string;
}

export const OfferSubmissions: React.FC = () => {
  const [items, setItems] = useState<Submission[]>([]);
  const [status, setStatus] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Submission | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await api.listOfferSubmissions(status, page);
      if (!r.success || !Array.isArray(r.data?.items)) throw new Error('Invalid server response');
      setItems(r.data.items);
      setPages(r.data.pagination.totalPages || 1);
    } catch (e: any) {
      setError(e.message || 'Could not load offer submissions.');
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async () => {
    if (!selected || notes.trim().length < 5 || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.reviewOfferSubmission(selected._id, decision, notes.trim());
      setSelected(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Review failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 text-slate-200">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Task Hub Verification Queue</h1>
          <p className="text-xs text-slate-400 mt-1">
            Review submitted offer proofs. Approval transactionally credits reward points (1,000 PTS = $1.00 USD).
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-4 border border-rose-500/40 bg-rose-950/30 rounded-xl text-rose-300 flex justify-between items-center text-xs">
          <span>{error}</span>
          <button onClick={load} className="px-3 py-1 bg-rose-600 rounded-lg text-white font-semibold">Retry</button>
        </div>
      )}

      {/* Status Filter */}
      <div className="flex items-center gap-1 overflow-x-auto p-1 bg-obsidian-900 border border-obsidian-700 rounded-xl w-fit">
        {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((s) => (
          <button
            key={s}
            onClick={() => { setStatus(s); setPage(1); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
              status === s
                ? 'bg-rose-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-obsidian-800'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Loading Task Hub submissions...</div>
      ) : !items.length ? (
        <div className="p-8 text-center text-slate-500 bg-obsidian-900 border border-obsidian-800 rounded-xl text-sm">
          No offer submissions found for the selected status.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((s) => {
            const usdValue = (s.rewardPoints * 0.001).toFixed(2);
            return (
              <article
                key={s._id}
                className="bg-obsidian-900 rounded-xl border border-obsidian-700 p-5 space-y-4 hover:border-obsidian-600 transition"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <h2 className="font-bold text-white text-base">{s.offerId?.title || 'Offer'}</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      User: <strong className="text-slate-200">{s.userId?.name || 'User'}</strong>
                      {s.userId?.mobile ? ` (${s.userId.mobile})` : ''} · Ref: <span className="font-mono text-cyan-400">{s.userId?.referralCode}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                        s.status === 'APPROVED'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : s.status === 'REJECTED'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {s.status}
                    </span>
                    <div className="flex items-center gap-1 font-bold text-amber-300 text-xs bg-obsidian-950 px-3 py-1 rounded-lg border border-obsidian-700">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>{s.rewardPoints.toLocaleString()} PTS (${usdValue} USD)</span>
                    </div>
                  </div>
                </div>

                {/* Submission Notes */}
                {s.notes && (
                  <div className="bg-obsidian-950 p-3 rounded-lg border border-obsidian-800 text-xs">
                    <span className="text-slate-500 block uppercase font-bold text-[10px] mb-1">User Submission Notes</span>
                    <p className="text-slate-300 whitespace-pre-wrap break-words">{s.notes}</p>
                  </div>
                )}

                {/* Screenshot Proof */}
                {s.proofUrl && (
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Submitted Screenshot Proof</span>
                    <div className="relative inline-block group">
                      <img
                        src={s.proofUrl}
                        alt="Submitted proof screenshot"
                        className="max-h-48 rounded-lg border border-obsidian-700 object-contain bg-black/40 cursor-pointer hover:border-rose-500 transition"
                        onClick={() => setPreviewImage(s.proofUrl!)}
                      />
                      <button
                        type="button"
                        onClick={() => setPreviewImage(s.proofUrl!)}
                        className="absolute bottom-2 right-2 bg-obsidian-950/80 hover:bg-obsidian-900 text-white px-2 py-1 rounded text-[11px] flex items-center gap-1 border border-obsidian-700"
                      >
                        <Eye className="w-3 h-3" /> View Full
                      </button>
                    </div>
                  </div>
                )}

                {s.completionCode && (
                  <p className="text-xs text-slate-400">
                    Partner reference code: <span className="font-mono text-white">{s.completionCode}</span>
                  </p>
                )}

                {s.reviewNotes && (
                  <div className="bg-obsidian-950 p-3 rounded-lg border border-obsidian-800 text-xs">
                    <span className="text-slate-500 block uppercase font-bold text-[10px] mb-1">Admin Determination</span>
                    <p className={s.status === 'REJECTED' ? 'text-rose-400' : 'text-slate-300'}>{s.reviewNotes}</p>
                  </div>
                )}

                {s.createdAt && (
                  <p className="text-[11px] text-slate-500">
                    Submitted: {new Date(s.createdAt).toLocaleString()}
                  </p>
                )}

                {s.status === 'PENDING' && (
                  <div className="pt-2 flex gap-3">
                    <button
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 rounded-lg text-white font-bold text-xs shadow transition flex items-center gap-1.5"
                      onClick={() => {
                        setSelected(s);
                        setNotes('');
                        setDecision('APPROVED');
                      }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Review & Determine
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <div className="flex gap-4 items-center justify-center pt-4 text-xs">
        <button
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => p - 1)}
          className="px-3 py-1.5 rounded-lg border border-obsidian-700 bg-obsidian-800 disabled:opacity-40"
        >
          Previous
        </button>
        <span>Page {page} of {pages}</span>
        <button
          disabled={page >= pages || loading}
          onClick={() => setPage((p) => p + 1)}
          className="px-3 py-1.5 rounded-lg border border-obsidian-700 bg-obsidian-800 disabled:opacity-40"
        >
          Next
        </button>
      </div>

      {/* Review Modal */}
      <Modal
        isOpen={!!selected}
        onClose={() => { if (!busy) setSelected(null); }}
        title="Verify Task Hub Submission"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-300">
            Confirm completion using partner records or submitted screenshot evidence.
            Approval credits <strong className="text-amber-300">{selected?.rewardPoints.toLocaleString()} PTS (${((selected?.rewardPoints || 0) * 0.001).toFixed(2)} USD)</strong> once to the user's wallet ledger.
          </p>

          <label className="block">
            <span className="text-slate-400 font-bold block mb-1">Decision</span>
            <select
              aria-label="Review decision"
              className="w-full bg-obsidian-950 p-2.5 rounded-lg border border-obsidian-700 text-white font-semibold"
              value={decision}
              onChange={(e) => setDecision(e.target.value as any)}
            >
              <option value="APPROVED">Approve (Credit Reward)</option>
              <option value="REJECTED">Reject (Require Correction)</option>
            </select>
          </label>

          <label className="block">
            <span className="text-slate-400 font-bold block mb-1">
              {decision === 'REJECTED' ? 'Mandatory Rejection Reason (visible to user)' : 'Verification Notes (min 5 characters)'}
            </span>
            <textarea
              aria-label="Verification notes"
              className="w-full bg-obsidian-950 p-3 rounded-lg border border-obsidian-700 text-white"
              rows={4}
              maxLength={2000}
              placeholder={decision === 'REJECTED' ? 'Explain what was missing or incorrect so the user can resubmit...' : 'Verified via partner portal / uploaded proof...'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          {error && <p role="alert" className="text-rose-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setSelected(null)}
              className="px-4 py-2 rounded-lg border border-obsidian-700 text-slate-300 hover:bg-obsidian-800"
            >
              Cancel
            </button>
            <button
              disabled={busy || notes.trim().length < 5}
              className={`px-4 py-2 rounded-lg font-bold text-white shadow disabled:opacity-40 ${
                decision === 'APPROVED' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
              onClick={review}
            >
              {busy ? 'Saving...' : decision === 'APPROVED' ? 'Confirm Approval & Credit' : 'Confirm Rejection'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Image Preview Modal */}
      {previewImage && (
        <Modal
          isOpen={true}
          onClose={() => setPreviewImage(null)}
          title="Submitted Proof Image"
          maxWidth="2xl"
        >
          <div className="space-y-4">
            <div className="flex justify-center bg-black/60 p-4 rounded-xl">
              <img
                src={previewImage}
                alt="Proof Full View"
                className="max-h-[70vh] object-contain rounded-lg"
              />
            </div>
            <div className="flex justify-between items-center">
              <a
                href={previewImage}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-rose-400 hover:underline flex items-center gap-1"
              >
                Open in new tab <ExternalLink className="w-3 h-3" />
              </a>
              <button
                onClick={() => setPreviewImage(null)}
                className="px-4 py-1.5 rounded-lg bg-obsidian-800 text-xs font-semibold text-white border border-obsidian-700"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
export default OfferSubmissions;
