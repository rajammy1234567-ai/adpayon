import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { Modal } from '../components/common/Modal';
import { Sparkles, CheckCircle2, XCircle, Clock } from 'lucide-react';

export const RedemptionManagement: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [rate, setRate] = useState('');
  const [instructions, setInstructions] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [decision, setDecision] = useState('PROCESSING');
  const [notes, setNotes] = useState('');
  const [reference, setReference] = useState('');
  const [paidConfirmed, setPaidConfirmed] = useState(false);

  const loadPolicy = useCallback(async () => {
    try {
      const r = await api.getRedemptionPolicy();
      setEnabled(r.data.usdEnabled);
      setRate(r.data.paisePerUsd ? (r.data.paisePerUsd / 100).toFixed(2) : '');
      setInstructions(r.data.usdInstructions || '');
    } catch {
      // Ignored
    }
  }, []);

  const loadQueue = useCallback(async () => {
    const r = await api.listPayoutRequests(status, page);
    if (!Array.isArray(r.data?.withdrawals)) throw new Error('Invalid withdrawal response');
    setItems(r.data.withdrawals);
    setPages(r.data.pagination.pages || 1);
  }, [status, page]);

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([loadPolicy(), loadQueue()])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [loadPolicy, loadQueue]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (rate && !/^\d+(\.\d{1,2})?$/.test(rate)) throw new Error('Enter INR per USD with at most two decimals.');
      await api.saveRedemptionPolicy({
        usdEnabled: enabled,
        paisePerUsd: rate ? Math.round(Number(rate) * 100) : null,
        usdInstructions: instructions,
      });
      await loadPolicy();
      setMessage('Redemption policy updated.');
    } catch (e: any) {
      setError(e.message || 'Could not save policy.');
    } finally {
      setBusy(false);
    }
  };

  const review = async () => {
    if (!selected || (decision === 'PAID' && !paidConfirmed)) return;
    if (decision === 'REJECTED' && notes.trim().length < 5) {
      setError('Rejection reason (at least 5 characters) is required when rejecting.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.reviewPayoutRequest(selected.id, {
        status: decision,
        adminReviewNotes: notes,
        payoutReference: reference || undefined,
      });
      setSelected(null);
      await loadQueue();
      setMessage('Payout determination recorded. Reserved funds updated.');
    } catch (e: any) {
      setError(e.message || 'Review failed.');
    } finally {
      setBusy(false);
    }
  };

  const inputClass = 'w-full bg-obsidian-950 rounded-lg border border-obsidian-700 p-2.5 text-white text-xs';

  return (
    <div className="text-slate-200 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Redemption & Payout Operations</h1>
        <p className="text-xs text-slate-400 mt-1">
          1,000 points = USD $1.00 (min 5,000 pts = $5.00). Payments are executed outside this portal and logged here with payment reference / tx hash.
        </p>
      </div>

      {error && <p role="alert" className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl text-rose-300 text-xs">{error}</p>}
      {message && <p role="status" className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs">{message}</p>}

      {loading ? (
        <p className="text-xs text-slate-400">Loading payout queue...</p>
      ) : (
        <>
          <div className="flex items-center gap-1 overflow-x-auto p-1 bg-obsidian-900 border border-obsidian-700 rounded-xl w-fit">
            {['ALL', 'REQUESTED', 'PROCESSING', 'PAID', 'REJECTED'].map((s) => (
              <button
                key={s}
                onClick={() => { setStatus(s); setPage(1); }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
                  status === s ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white hover:bg-obsidian-800'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {!items.length ? (
            <div className="p-8 text-center text-slate-500 bg-obsidian-900 border border-obsidian-800 rounded-xl text-xs">
              No withdrawal requests found matching status.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((w) => {
                const points = w.pointsAmount || Math.floor((w.amountPaise || 0) / 10);
                const usd = w.usdAmount || Number((points * 0.001).toFixed(2));
                const b = w.beneficiaryDetails || {};

                return (
                  <article key={w.id} className="bg-obsidian-900 border border-obsidian-700 rounded-xl p-5 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-white text-sm">
                          {w.user?.name || 'User'} {w.user?.mobile ? `(${w.user.mobile})` : ''}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5 font-mono">
                          Method: <strong className="text-cyan-400">{w.payoutMode}</strong> · Status:{' '}
                          <span
                            className={`font-bold ${
                              w.status === 'PAID'
                                ? 'text-emerald-400'
                                : w.status === 'REJECTED'
                                ? 'text-rose-400'
                                : 'text-amber-300'
                            }`}
                          >
                            {w.status}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1 font-bold text-amber-300 text-xs bg-obsidian-950 px-3 py-1 rounded-lg border border-obsidian-700">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>{points.toLocaleString()} PTS (${usd.toFixed(2)} USD)</span>
                      </div>
                    </div>

                    {/* Beneficiary Details Breakdown */}
                    <div className="bg-obsidian-950 p-3 rounded-lg border border-obsidian-800 text-xs space-y-1">
                      {w.payoutMode === 'USDT_WALLET' ? (
                        <>
                          <p><strong className="text-slate-400">Network:</strong> <span className="font-mono text-cyan-300">{b.network || 'BEP20'}</span></p>
                          <p><strong className="text-slate-400">USDT Address:</strong> <span className="font-mono text-white select-all">{b.usdtAddress}</span></p>
                        </>
                      ) : (
                        <>
                          <p><strong className="text-slate-400">Account Holder:</strong> <span className="text-white">{b.accountHolderName}</span></p>
                          <p><strong className="text-slate-400">Account Number:</strong> <span className="font-mono text-white select-all">{b.accountNumber}</span></p>
                          <p><strong className="text-slate-400">IFSC Code:</strong> <span className="font-mono text-cyan-300">{b.ifscCode}</span></p>
                          {b.bankName && <p><strong className="text-slate-400">Bank:</strong> <span className="text-slate-300">{b.bankName}</span></p>}
                        </>
                      )}
                    </div>

                    {w.payoutReference && (
                      <p className="text-xs text-slate-300">
                        Payment Reference / Tx: <span className="font-mono text-emerald-400 select-all">{w.payoutReference}</span>
                      </p>
                    )}

                    {w.adminReviewNotes && (
                      <p className="text-xs text-slate-400">
                        Review notes: <span className={w.status === 'REJECTED' ? 'text-rose-400' : 'text-slate-300'}>{w.adminReviewNotes}</span>
                      </p>
                    )}

                    {['REQUESTED', 'UNDER_REVIEW', 'PROCESSING'].includes(w.status) && (
                      <div className="pt-1">
                        <button
                          className="bg-rose-600 hover:bg-rose-700 px-4 py-1.5 rounded-lg text-white font-bold text-xs shadow transition"
                          onClick={() => {
                            setSelected(w);
                            setNotes('');
                            setReference('');
                            setDecision('PAID');
                            setPaidConfirmed(false);
                          }}
                        >
                          Review & Settle
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          <div className="flex gap-4 items-center justify-center pt-2 text-xs">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-obsidian-700 bg-obsidian-800 disabled:opacity-40"
            >
              Previous
            </button>
            <span>Page {page} of {pages}</span>
            <button
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-obsidian-700 bg-obsidian-800 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </>
      )}

      {/* Review Modal */}
      <Modal
        title="Record Payout Determination"
        isOpen={!!selected}
        onClose={() => { if (!busy) setSelected(null); }}
      >
        <div className="space-y-4 text-slate-200 text-xs">
          <p className="text-slate-300">
            Payer action for <strong className="text-white">{selected?.user?.name}</strong>: Amount is{' '}
            <strong className="text-amber-300">
              {(selected?.pointsAmount || Math.floor((selected?.amountPaise || 0) / 10)).toLocaleString()} PTS ($
              {(selected?.usdAmount || ((selected?.pointsAmount || 0) * 0.001)).toFixed(2)} USD)
            </strong>.
          </p>

          <label className="block">
            <span className="text-slate-400 font-bold block mb-1">Determination</span>
            <select
              aria-label="Payout decision"
              className={inputClass}
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
            >
              <option value="PAID">Mark PAID (Record Payment Reference / Tx Hash)</option>
              <option value="PROCESSING">Keep PROCESSING (Hold Reserved)</option>
              <option value="REJECTED">REJECT (Release Hold Back to Available Points)</option>
            </select>
          </label>

          <label className="block">
            <span className="text-slate-400 font-bold block mb-1">
              {decision === 'REJECTED' ? 'Mandatory Rejection Reason' : 'Admin Review Notes'}
            </span>
            <textarea
              aria-label="Payout review notes"
              className={inputClass}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={decision === 'REJECTED' ? 'Explain why payout was rejected (hold will be restored to available points)...' : 'Review notes (min 5 characters)'}
            />
          </label>

          {decision === 'PAID' && (
            <div className="space-y-2">
              <label className="block">
                <span className="text-slate-400 font-bold block mb-1">Payment Reference / Transaction Hash (min 5 chars)</span>
                <input
                  aria-label="Actual payment reference"
                  className={inputClass}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. 0x8a9f... (USDT tx hash) or Bank UTR 4291823910"
                />
              </label>

              <label className="flex items-center gap-2 pt-1 text-slate-300">
                <input
                  type="checkbox"
                  checked={paidConfirmed}
                  onChange={(e) => setPaidConfirmed(e.target.checked)}
                />
                <span>I confirm that the recipient has been paid the exact recorded amount.</span>
              </label>
            </div>
          )}

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
              disabled={
                busy ||
                notes.trim().length < 5 ||
                (decision === 'PAID' && (!paidConfirmed || reference.trim().length < 5))
              }
              className={`px-4 py-2 rounded-lg font-bold text-white shadow disabled:opacity-40 ${
                decision === 'PAID' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
              onClick={review}
            >
              {busy ? 'Saving...' : decision === 'PAID' ? 'Confirm Payment Made' : 'Confirm Rejection'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
export default RedemptionManagement;
