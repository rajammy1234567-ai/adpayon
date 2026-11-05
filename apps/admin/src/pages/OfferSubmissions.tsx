import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Modal } from '../components/common/Modal';
interface Submission { _id: string; offerId: { title: string } | null; userId: { name: string; referralCode: string } | null; status: string; rewardPoints: number; notes?: string; proofUrl?: string; completionCode?: string; reviewNotes?: string }
export const OfferSubmissions = () => {
  const [items, setItems] = useState<Submission[]>([]);
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Submission | null>(null);
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const r = await api.listOfferSubmissions(status, page); if (!r.success || !Array.isArray(r.data?.items)) throw new Error('Invalid server response'); setItems(r.data.items); setPages(r.data.pagination.totalPages); }
    catch (e: any) { setError(e.message || 'Could not load submissions.'); }
    finally { setLoading(false); }
  }, [status, page]);
  useEffect(() => { load(); }, [load]);
  const review = async () => {
    if (!selected || notes.trim().length < 5 || busy) return;
    setBusy(true); setError('');
    try { await api.reviewOfferSubmission(selected._id, decision, notes.trim()); setSelected(null); await load(); }
    catch (e: any) { setError(e.message || 'Review failed.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5 text-slate-200"><h1 className="text-2xl font-bold text-white">Offer verification</h1><p>Verify the actual partner action before approving. Approval credits the saved reward once; opening or sharing a link earns nothing.</p>
    {error && <div role="alert" className="p-4 border border-red-500 rounded-lg">{error} <button onClick={load}>Retry</button></div>}
    <select aria-label="Submission status" className="bg-obsidian-900 p-3 rounded-lg" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>{['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map(s => <option key={s}>{s}</option>)}</select>
    {loading ? <p>Loading submissions...</p> : !items.length ? <p>No submissions found.</p> : <div className="space-y-3">{items.map(s => <article key={s._id} className="bg-obsidian-900 rounded-xl border border-obsidian-700 p-5 space-y-3"><h2 className="font-bold text-white">{s.offerId?.title || 'Deleted offer'}</h2><p>{s.userId?.name || 'Unavailable user'} · {s.userId?.referralCode} · {s.status}</p><p>{s.rewardPoints.toLocaleString()} points = ₹{(s.rewardPoints / 10).toFixed(2)}</p><p className="whitespace-pre-wrap break-words">{s.notes}</p>{s.proofUrl && /^https?:\/\//i.test(s.proofUrl) && <a className="text-red-400" href={s.proofUrl} target="_blank" rel="noopener noreferrer">Open submitted proof ↗</a>}{s.completionCode && <p>Partner reference: {s.completionCode}</p>}{s.reviewNotes && <p>Review: {s.reviewNotes}</p>}{s.status === 'PENDING' && <button className="block px-4 py-2 bg-red-600 rounded-lg text-white" onClick={() => { setSelected(s); setNotes(''); setDecision('APPROVED'); }}>Review completion</button>}</article>)}</div>}
    <div className="flex gap-4 items-center"><button disabled={page <= 1 || loading} onClick={() => setPage(p => p-1)}>Previous</button><span>Page {page} / {pages}</span><button disabled={page >= pages || loading} onClick={() => setPage(p => p+1)}>Next</button></div>
    <Modal isOpen={!!selected} onClose={() => { if (!busy) setSelected(null); }} title="Verify offer completion"><div className="space-y-4"><p className="text-slate-200">Confirm completion using partner records or valid evidence. This action affects real staging balances.</p><select aria-label="Review decision" className="bg-obsidian-950 p-3 text-white" value={decision} onChange={e => setDecision(e.target.value as any)}><option value="APPROVED">Approve verified action</option><option value="REJECTED">Reject</option></select><textarea aria-label="Verification notes" className="w-full bg-obsidian-950 p-3 text-white" rows={4} maxLength={2000} placeholder="How was this verified? Required, at least 5 characters." value={notes} onChange={e => setNotes(e.target.value)} />{error && <p role="alert" className="text-red-400">{error}</p>}<button disabled={busy || notes.trim().length < 5} className="bg-red-600 p-3 rounded-lg text-white disabled:opacity-40" onClick={review}>{busy ? 'Saving...' : 'Confirm decision'}</button></div></Modal>
  </div>;
};
