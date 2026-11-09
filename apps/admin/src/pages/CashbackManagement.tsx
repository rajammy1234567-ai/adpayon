import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Plus, Check, X, Eye, Loader2, Store, FileText, ExternalLink } from 'lucide-react';

export const CashbackManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'CLAIMS' | 'MERCHANTS'>('CLAIMS');

  // Merchants State
  const [merchants, setMerchants] = useState<any[]>([]);
  const [merchantsLoading, setMerchantsLoading] = useState(false);
  const [merchantModalOpen, setMerchantModalOpen] = useState(false);
  const [mName, setMName] = useState('');
  const [mLogo, setMLogo] = useState('');
  const [mDesc, setMDesc] = useState('');
  const [mDest, setMDest] = useState('');
  const [mTerms, setMTerms] = useState('');
  const [mBadge, setMBadge] = useState('');
  const [mSaving, setMSaving] = useState(false);

  // Claims State
  const [claims, setClaims] = useState<any[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimStatusFilter, setClaimStatusFilter] = useState('PENDING');
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);

  // Decision Modal
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<any>(null);
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [approvedPoints, setApprovedPoints] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const fetchMerchants = async () => {
    try {
      setMerchantsLoading(true);
      const res = await api.listMerchants();
      setMerchants(res.data || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setMerchantsLoading(false);
    }
  };

  const fetchClaims = async () => {
    try {
      setClaimsLoading(true);
      const res = await api.listCashbackClaims(claimStatusFilter);
      setClaims(res.data || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setClaimsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'MERCHANTS') fetchMerchants();
    else fetchClaims();
  }, [activeTab, claimStatusFilter]);

  const handleCreateMerchant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setMSaving(true);
      await api.createMerchant({
        name: mName,
        logoUrl: mLogo,
        description: mDesc,
        destinationUrl: mDest,
        cashbackTerms: mTerms,
        featuredBadge: mBadge || undefined,
        isActive: true,
      });
      setMerchantModalOpen(false);
      setMName('');
      setMLogo('');
      setMDesc('');
      setMDest('');
      setMTerms('');
      setMBadge('');
      fetchMerchants();
    } catch (err: any) {
      alert(err.message || 'Failed to create merchant');
    } finally {
      setMSaving(false);
    }
  };

  const handleOpenReview = (claim: any, type: 'APPROVE' | 'REJECT') => {
    setSelectedClaim(claim);
    setDecision(type);
    setApprovedPoints(claim.claimedPoints?.toString() || '0');
    setRejectionReason('');
    setAdminNotes('');
    setReviewModalOpen(true);
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClaim) return;
    try {
      setReviewing(true);
      await api.reviewCashbackClaim(selectedClaim.id, {
        decision,
        approvedPoints: decision === 'APPROVE' ? Number(approvedPoints) : undefined,
        rejectionReason: decision === 'REJECT' ? rejectionReason : undefined,
        adminNotes: adminNotes || undefined,
      });
      setReviewModalOpen(false);
      fetchClaims();
    } catch (err: any) {
      alert(err.message || 'Review submission failed');
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Store className="w-6 h-6 text-emerald-400" /> Shopping & Cashback Operations
          </h1>
          <p className="text-sm text-slate-400">
            Verify retail purchases with invoice proof. Clicking affiliate links does not create balance; rewards are credited only on approval.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-obsidian-900 border border-obsidian-700/60 rounded-lg p-1 flex">
            <button
              onClick={() => setActiveTab('CLAIMS')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${activeTab === 'CLAIMS' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Verification Queue
            </button>
            <button
              onClick={() => setActiveTab('MERCHANTS')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${activeTab === 'MERCHANTS' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Partner Stores
            </button>
          </div>
          {activeTab === 'MERCHANTS' && (
            <button
              onClick={() => setMerchantModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg"
            >
              <Plus className="w-4 h-4" /> Add Store
            </button>
          )}
        </div>
      </div>

      {activeTab === 'CLAIMS' ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map((st) => (
              <button
                key={st}
                onClick={() => setClaimStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                  claimStatusFilter === st
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                    : 'bg-obsidian-900 border-obsidian-800 text-slate-400 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {claimsLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            </div>
          ) : claims.length === 0 ? (
            <div className="bg-obsidian-900 border border-obsidian-700/60 rounded-xl p-12 text-center text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No cashback claims found in this queue.</p>
            </div>
          ) : (
            <div className="bg-obsidian-900 border border-obsidian-700/60 rounded-xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-obsidian-950 text-xs font-semibold uppercase text-slate-400 border-b border-obsidian-800">
                    <tr>
                      <th className="px-4 py-3">Store & Order ID</th>
                      <th className="px-4 py-3">Submitter</th>
                      <th className="px-4 py-3">Order Amount</th>
                      <th className="px-4 py-3">Reward Points</th>
                      <th className="px-4 py-3">Proof Invoice</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-obsidian-800">
                    {claims.map((c) => (
                      <tr key={c.id} className="hover:bg-obsidian-850/50">
                        <td className="px-4 py-3">
                          <span className="font-bold text-white block">{c.merchantName}</span>
                          <span className="text-xs text-slate-400">Order #{c.orderId}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-white block">{c.userName}</span>
                          <span className="text-xs text-slate-400">{c.userMobile}</span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-200">
                          ${Number(c.orderAmount).toFixed(2)} {c.currency}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-amber-300">{c.claimedPoints.toLocaleString()} PTS</span>
                          <span className="text-xs text-slate-400 block">(${(c.claimedPoints / 1000).toFixed(2)} USD)</span>
                        </td>
                        <td className="px-4 py-3">
                          {c.proofUrl ? (
                            <button
                              onClick={() => setSelectedProofUrl(c.proofUrl)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-obsidian-800 hover:bg-obsidian-700 text-xs text-emerald-400 rounded-md font-medium"
                            >
                              <Eye className="w-3.5 h-3.5" /> View Receipt
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500">No image</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold uppercase ${
                              c.status === 'APPROVED'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : c.status === 'REJECTED'
                                ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                                : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {c.status === 'PENDING' ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenReview(c, 'APPROVE')}
                                className="p-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded transition"
                                title="Approve & Credit"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleOpenReview(c, 'REJECT')}
                                className="p-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded transition"
                                title="Reject"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">Processed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {merchantsLoading ? (
            <div className="col-span-full flex items-center justify-center p-12">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            </div>
          ) : merchants.map((m) => (
            <div key={m.id} className="bg-obsidian-900 border border-obsidian-700/60 rounded-xl p-4 shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <img src={m.logoUrl} alt={m.name} className="w-12 h-12 rounded-lg object-contain bg-obsidian-950 p-1" />
                  <div>
                    <h3 className="font-bold text-white text-base">{m.name}</h3>
                    {m.featuredBadge && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold uppercase">
                        {m.featuredBadge}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-300 mt-2">{m.description}</p>
                <div className="mt-3 bg-obsidian-950/60 p-2.5 rounded-lg border border-obsidian-800 text-xs">
                  <span className="text-slate-400 block font-medium">Terms:</span>
                  <span className="text-amber-300 font-semibold">{m.cashbackTerms}</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-obsidian-800 flex items-center justify-between">
                <a
                  href={m.destinationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Visit Store
                </a>
                <span className={`text-[11px] font-bold uppercase ${m.isActive ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {m.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Proof Viewer Modal */}
      {selectedProofUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setSelectedProofUrl(null)}>
          <div className="bg-obsidian-900 border border-obsidian-700 rounded-2xl max-w-2xl w-full p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-obsidian-800 pb-2">
              <h3 className="font-bold text-white text-sm">Invoice / Receipt Proof Screenshot</h3>
              <button onClick={() => setSelectedProofUrl(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto flex items-center justify-center bg-obsidian-950 rounded-lg p-2">
              <img src={selectedProofUrl} alt="Receipt proof" className="max-w-full max-h-[65vh] object-contain rounded" />
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewModalOpen && selectedClaim && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-obsidian-900 border border-obsidian-700 rounded-2xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-xl font-bold text-white">
              {decision === 'APPROVE' ? 'Approve Cashback Claim' : 'Reject Cashback Claim'}
            </h2>
            <form onSubmit={handleSubmitReview} className="space-y-3">
              <div>
                <span className="text-xs text-slate-400 block">Merchant: {selectedClaim.merchantName}</span>
                <span className="text-xs text-slate-400 block">Order #{selectedClaim.orderId} (${selectedClaim.orderAmount})</span>
              </div>

              {decision === 'APPROVE' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Approved Points to Credit</label>
                  <input
                    type="number"
                    required
                    value={approvedPoints}
                    onChange={(e) => setApprovedPoints(e.target.value)}
                    className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white text-sm"
                  />
                  <span className="text-xs text-amber-300 mt-1 block">
                    = ${(Number(approvedPoints) / 1000).toFixed(3)} USD credited to user ledger
                  </span>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Mandatory Rejection Reason</label>
                  <textarea
                    required
                    rows={3}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="e.g. Invoice screenshot blurry or order ID mismatch."
                    className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Internal Admin Notes (Optional)</label>
                <input
                  type="text"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-obsidian-800">
                <button
                  type="button"
                  onClick={() => setReviewModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviewing}
                  className={`px-4 py-2 text-white text-sm font-semibold rounded-lg flex items-center gap-2 ${
                    decision === 'APPROVE' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
                  }`}
                >
                  {reviewing && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm {decision}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Merchant Modal */}
      {merchantModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-obsidian-900 border border-obsidian-700 rounded-2xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-xl font-bold text-white">Add Partner Merchant</h2>
            <form onSubmit={handleCreateMerchant} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Merchant Name</label>
                <input
                  type="text"
                  required
                  value={mName}
                  onChange={(e) => setMName(e.target.value)}
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white text-sm"
                  placeholder="e.g. Amazon India"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Logo URL</label>
                <input
                  type="url"
                  required
                  value={mLogo}
                  onChange={(e) => setMLogo(e.target.value)}
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Affiliate Destination URL</label>
                <input
                  type="url"
                  required
                  value={mDest}
                  onChange={(e) => setMDest(e.target.value)}
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Actual Cashback Terms</label>
                <input
                  type="text"
                  required
                  value={mTerms}
                  onChange={(e) => setMTerms(e.target.value)}
                  placeholder="e.g. Up to 4.5% on Fashion, 2% on Electronics"
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                <input
                  type="text"
                  value={mDesc}
                  onChange={(e) => setMDesc(e.target.value)}
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Badge (Optional)</label>
                <input
                  type="text"
                  value={mBadge}
                  onChange={(e) => setMBadge(e.target.value)}
                  placeholder="e.g. FEATURED or TOP CASHBACK"
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-obsidian-800">
                <button
                  type="button"
                  onClick={() => setMerchantModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={mSaving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg flex items-center gap-2"
                >
                  {mSaving && <Loader2 className="w-4 h-4 animate-spin" />} Save Store
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

