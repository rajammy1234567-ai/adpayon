import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { Modal } from '../components/common/Modal';
export const RedemptionManagement = () => {
  const [enabled, setEnabled] = useState(false), [rate, setRate] = useState(''), [instructions, setInstructions] = useState('');
  const [items, setItems] = useState<any[]>([]), [status, setStatus] = useState('REQUESTED'), [page, setPage] = useState(1), [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [selected, setSelected] = useState<any>(null), [decision, setDecision] = useState('PROCESSING'), [notes, setNotes] = useState(''), [reference, setReference] = useState(''), [paidConfirmed, setPaidConfirmed] = useState(false);
  const loadPolicy = useCallback(async () => { const r = await api.getRedemptionPolicy(); setEnabled(r.data.usdEnabled); setRate(r.data.paisePerUsd ? (r.data.paisePerUsd / 100).toFixed(2) : ''); setInstructions(r.data.usdInstructions || ''); }, []);
  const loadQueue = useCallback(async () => { const r = await api.listPayoutRequests(status, page); if (!Array.isArray(r.data?.withdrawals)) throw new Error('Invalid withdrawal response'); setItems(r.data.withdrawals); setPages(r.data.pagination.pages); }, [status, page]);
  useEffect(() => { setLoading(true); setError(''); Promise.all([loadPolicy(), loadQueue()]).catch(e => setError(e.message)).finally(() => setLoading(false)); }, [loadPolicy, loadQueue]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (rate && !/^\d+(\.\d{1,2})?$/.test(rate)) throw new Error('Enter INR per USD with at most two decimals.');
      await api.saveRedemptionPolicy({ usdEnabled: enabled, paisePerUsd: rate ? Math.round(Number(rate) * 100) : null, usdInstructions: instructions });
      await loadPolicy(); setMessage('Redemption policy saved. Existing withdrawal requests keep their recorded payout amounts.');
    } catch (e: any) { setError(e.message || 'Could not save policy.'); } finally { setBusy(false); }
  };
  const review = async () => {
    if (!selected || (decision === 'PAID' && !paidConfirmed)) return;
    setBusy(true); setError('');
    try { await api.reviewPayoutRequest(selected.id, { status: decision, adminReviewNotes: notes, payoutReference: reference || undefined }); setSelected(null); await loadQueue(); setMessage('Payout review saved.'); }
    catch (e: any) { setError(e.message || 'Review failed.'); } finally { setBusy(false); }
  };
  const input = 'w-full bg-obsidian-950 rounded-lg border border-obsidian-700 p-3 text-white';
  return <div className="text-slate-200 space-y-5"><h1 className="text-2xl font-bold text-white">Redemption & Payouts</h1>
    <p>1,000 verified redeemable points = ₹100. Legacy promotional points are preserved separately. Payments are made outside this portal and recorded here; this page does not send money.</p>
    {error && <p role="alert" className="text-red-400">{error}</p>}{message && <p role="status" className="text-emerald-400">{message}</p>}
    {loading ? <p>Loading...</p> : <><form onSubmit={save} className="bg-obsidian-900 p-5 rounded-xl space-y-4"><h2 className="font-bold">USD redemption settings</h2><label className="flex gap-3"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Enable manually settled USD payouts</label><label className="block">INR value of 1 USD<input aria-label="INR per USD" className={input} inputMode="decimal" placeholder="Set your payout conversion rate" value={rate} onChange={e => setRate(e.target.value)} /></label><label className="block">USD payment method & recipient instructions<textarea className={input} rows={3} maxLength={1000} placeholder="Describe the actual supported USD payout method and the recipient details users must provide." value={instructions} onChange={e => setInstructions(e.target.value)} /></label><p className="text-sm">This is your explicit payout rate, not a fetched market rate. USD remains unavailable until you configure the rate and actual payment instructions. Quotes round down to cents; fee is ₹0.</p><button disabled={busy} className="bg-red-600 px-4 py-3 rounded-lg text-white">Save Settings</button></form>
      <h2 className="font-bold text-xl">Withdrawal queue</h2><select aria-label="Withdrawal status" className={input} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>{['REQUESTED', 'PROCESSING', 'PAID', 'REJECTED'].map(s => <option key={s}>{s}</option>)}</select>
      {!items.length && <p>No withdrawal requests found.</p>}{items.map(w => <article key={w.id} className="bg-obsidian-900 border border-obsidian-700 rounded-xl p-5 space-y-2"><h3 className="font-bold">{w.user?.name || 'User'} · {w.currency || 'INR'} {((w.payoutMinor ?? w.amountPaise) / 100).toFixed(2)}</h3><p>Wallet debit: ₹{(w.amountPaise / 100).toFixed(2)} · {w.payoutMode} · {w.status}</p><p className="whitespace-pre-wrap break-words">{Object.entries(w.beneficiaryDetails || {}).filter(([, v]) => !!v).map(([k, v]) => `${k}: ${v}`).join('\n')}</p>{w.payoutReference && <p>Payment reference: {w.payoutReference}</p>}{['REQUESTED', 'PROCESSING'].includes(w.status) && <button className="bg-red-600 px-4 py-2 rounded-lg" onClick={() => { setSelected(w); setNotes(''); setReference(''); setDecision('PROCESSING'); setPaidConfirmed(false); }}>Review payout</button>}</article>)}
      <div className="flex gap-4"><button disabled={page <= 1} onClick={() => setPage(p => p-1)}>Previous</button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => setPage(p => p+1)}>Next</button></div></>}
    <Modal title="Record payout review" isOpen={!!selected} onClose={() => { if (!busy) setSelected(null); }}><div className="space-y-4 text-slate-200"><select aria-label="Payout decision" className={input} value={decision} onChange={e => setDecision(e.target.value)}><option value="PROCESSING">Processing (keep funds reserved)</option><option value="PAID">Record actual payment made</option><option value="REJECTED">Reject and release funds</option></select><textarea aria-label="Payout review notes" className={input} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Review notes (minimum 5 characters)" />{decision === 'PAID' && <><input aria-label="Actual payment reference" className={input} value={reference} onChange={e => setReference(e.target.value)} placeholder="Actual bank/provider payment reference" /><label className="flex gap-2"><input type="checkbox" checked={paidConfirmed} onChange={e => setPaidConfirmed(e.target.checked)} />I verified that the recipient was paid the recorded amount and currency.</label></>}{error && <p role="alert" className="text-red-400">{error}</p>}<button disabled={busy || notes.trim().length < 5 || (decision === 'PAID' && (!paidConfirmed || reference.trim().length < 5))} className="bg-red-600 p-3 rounded-lg disabled:opacity-40" onClick={review}>Save review</button></div></Modal>
  </div>;
};
