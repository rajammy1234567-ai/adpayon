import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Gift,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle,
  PauseCircle,
  Loader2,
  AlertCircle,
  RefreshCw,
  Eye,
  Calendar,
  ExternalLink,
  Coins,
  Sparkles,
} from 'lucide-react';
import { api } from '../services/api';
import { Offer, OfferStatus, Category } from '../types';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { ConfirmModal } from '../components/common/ConfirmModal';

export const OffersManagement: React.FC = () => {
  const navigate = useNavigate();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pagination, setPagination] = useState<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | OfferStatus>('ALL');

  // Preview Modal
  const [previewOffer, setPreviewOffer] = useState<Offer | null>(null);

  // Delete Confirm Modal
  const [deletingOffer, setDeletingOffer] = useState<Offer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = async (targetPage: number = pagination.page) => {
    try {
      setIsLoading(true);
      setError(null);
      const [offersRes, catRes] = await Promise.all([
        api.listOffers({
          page: targetPage,
          limit: pagination.limit,
        }),
        api.listCategories(),
      ]);

      if (!offersRes || !offersRes.success || !offersRes.data || !Array.isArray(offersRes.data.items)) {
        throw new Error('Unexpected response format while loading offers from server.');
      }
      if (!catRes || !catRes.success || !Array.isArray(catRes.data)) {
        throw new Error('Unexpected response format while loading categories from server.');
      }

      setOffers(offersRes.data.items);
      if (offersRes.data.pagination) {
        setPagination(offersRes.data.pagination);
      }
      setCategories(catRes.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load offers and categories.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(1);
  }, []);

  const handleToggleStatus = async (offer: Offer, newStatus: OfferStatus) => {
    try {
      await api.updateOffer(offer.id, { status: newStatus });
      await loadData();
    } catch (err: any) {
      alert(`Failed to update offer status: ${err.message}`);
    }
  };

  const handleDelete = async () => {
    if (!deletingOffer) return;
    try {
      setIsDeleting(true);
      await api.deleteOffer(deletingOffer.id);
      setDeletingOffer(null);
      await loadData();
    } catch (err: any) {
      alert(`Failed to delete offer: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredOffers = useMemo(() => {
    return offers.filter((o) => {
      const matchesSearch =
        o.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat =
        selectedCategory === 'ALL' || o.categoryId === selectedCategory;

      const matchesStatus =
        statusFilter === 'ALL' || o.status === statusFilter;

      return matchesSearch && matchesCat && matchesStatus;
    });
  }, [offers, searchQuery, selectedCategory, statusFilter]);

  const getStatusBadge = (s: OfferStatus) => {
    return <Badge status={s} />;
  };

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) {
      map.set(c.id, c.name);
    }
    return map;
  }, [categories]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-wide flex items-center gap-2">
            <Gift className="w-6 h-6 text-red-500" />
            Offers & Earn Management
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure partner offers, instructions, FAQ, reward points, and signed shareable attribution links.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData(pagination.page)}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-obsidian-800 text-slate-300 hover:text-white border border-obsidian-700 transition"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => navigate('/offers/new')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold transition shadow-lg shadow-red-900/30"
          >
            <Plus className="w-4 h-4" />
            Create Offer
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-obsidian-900 p-4 rounded-xl border border-obsidian-700">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search offers by title or slug..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500"
          />
        </div>

        <div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-red-500"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-red-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
            <option value="PAUSED">Paused</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
          <button
            onClick={() => loadData(pagination.page)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/30 hover:bg-red-600/50 text-red-200 text-xs font-semibold transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Offers Table */}
      <div className="bg-obsidian-900 border border-obsidian-700 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-obsidian-800/80 text-xs uppercase text-slate-400 border-b border-obsidian-700">
              <tr>
                <th className="px-6 py-4">Order</th>
                <th className="px-6 py-4">Offer / Category</th>
                <th className="px-6 py-4">Reward</th>
                <th className="px-6 py-4">Completion Type</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Completions</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-obsidian-800">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-red-500 mx-auto mb-2" />
                    <span className="text-xs text-slate-400">Loading offers...</span>
                  </td>
                </tr>
              ) : filteredOffers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-400">
                    <Gift className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-300">No partner offers found</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      {searchQuery || selectedCategory !== 'ALL' || statusFilter !== 'ALL'
                        ? 'No offers match your current filter criteria. Try clearing search or category filter.'
                        : 'No partner offers have been created in this environment yet. Get started by creating your first offer.'}
                    </p>
                    {!searchQuery && selectedCategory === 'ALL' && statusFilter === 'ALL' && (
                      <button
                        onClick={() => navigate('/offers/new')}
                        className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition shadow-md shadow-red-900/30"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Create First Offer
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredOffers.map((offer) => {
                  const usdValue = (offer.rewardPoints * 0.001).toFixed(3);
                  return (
                    <tr key={offer.id} className="hover:bg-obsidian-800/50 transition">
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">
                        #{offer.displayOrder ?? 0}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-white">{offer.title}</div>
                        <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                          <span className="px-2 py-0.5 rounded bg-obsidian-800 border border-obsidian-700 text-slate-300 text-[11px]">
                            {categoryMap.get(offer.categoryId) || 'Uncategorized'}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500">/{offer.slug}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-xs">
                          <Coins className="w-4 h-4" />
                          <span>{offer.rewardPoints.toLocaleString()} pts</span>
                        </div>
                        <div className="text-[11px] text-emerald-400 font-medium">
                          ≈ ${usdValue} USD
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-400">
                        {offer.completionConditions?.actionType || 'CUSTOM'}
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(offer.status)}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-obsidian-800 text-slate-300">
                          {offer.completionsCount ?? 0}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            title="Live Preview"
                            onClick={() => setPreviewOffer(offer)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-obsidian-800 transition"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {offer.status === 'PUBLISHED' ? (
                            <button
                              title="Pause offer"
                              onClick={() => handleToggleStatus(offer, 'PAUSED')}
                              className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-400/10 transition"
                            >
                              <PauseCircle className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              title="Publish offer"
                              onClick={() => handleToggleStatus(offer, 'PUBLISHED')}
                              className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-400/10 transition"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            title="Edit offer"
                            onClick={() => navigate(`/offers/${offer.id}/edit`)}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-obsidian-700 transition"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            title="Delete offer"
                            onClick={() => setDeletingOffer(offer)}
                            className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {pagination.total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-3.5 border-t border-obsidian-800 text-xs text-slate-400 bg-obsidian-900/60">
            <div>
              Showing <strong className="text-white">{filteredOffers.length}</strong> of{' '}
              <strong className="text-white">{pagination.total}</strong> total offer(s)
            </div>
            {pagination.totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  disabled={pagination.page <= 1 || isLoading}
                  onClick={() => loadData(pagination.page - 1)}
                  className="px-3 py-1 rounded-lg bg-obsidian-800 border border-obsidian-700 hover:text-white disabled:opacity-40 transition"
                >
                  Previous
                </button>
                <span className="font-mono text-slate-300">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  disabled={pagination.page >= pagination.totalPages || isLoading}
                  onClick={() => loadData(pagination.page + 1)}
                  className="px-3 py-1 rounded-lg bg-obsidian-800 border border-obsidian-700 hover:text-white disabled:opacity-40 transition"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live Preview Modal */}
      {previewOffer && (
        <Modal
          isOpen={!!previewOffer}
          onClose={() => setPreviewOffer(null)}
          title={`Offer Preview: ${previewOffer.title}`}
        >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {/* Banner preview if present */}
            {previewOffer.bannerUrl && (
              <div className="rounded-xl overflow-hidden border border-obsidian-700 bg-obsidian-950 max-h-48">
                <img
                  src={previewOffer.bannerUrl}
                  alt={previewOffer.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-semibold">
                  {categoryMap.get(previewOffer.categoryId) || 'Offer'}
                </span>
                <div className="flex items-center gap-1.5 text-amber-400 font-bold text-sm">
                  <Coins className="w-4 h-4" />
                  <span>{previewOffer.rewardPoints.toLocaleString()} Points</span>
                  <span className="text-emerald-400 text-xs font-normal">
                    (${(previewOffer.rewardPoints * 0.001).toFixed(3)} USD)
                  </span>
                </div>
              </div>
              <h2 className="text-xl font-bold text-white mt-2">{previewOffer.title}</h2>
              <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                {previewOffer.description}
              </p>
            </div>

            {/* Instructions (clean rendering) */}
            {previewOffer.instructions && previewOffer.instructions.length > 0 && (
              <div className="bg-obsidian-950 p-4 rounded-xl border border-obsidian-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Step-by-Step Instructions
                </h3>
                <ol className="space-y-2 list-decimal list-inside text-sm text-slate-300">
                  {previewOffer.instructions.map((step, idx) => (
                    <li key={idx} className="leading-snug">
                      <span className="text-slate-200">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Training Links (omitted if empty) */}
            {previewOffer.trainingLinks && previewOffer.trainingLinks.length > 0 && (
              <div className="bg-obsidian-950 p-4 rounded-xl border border-obsidian-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Helpful Training Links
                </h3>
                <div className="space-y-2">
                  {previewOffer.trainingLinks.map((tl, idx) => (
                    <a
                      key={idx}
                      href={tl.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2.5 rounded-lg bg-obsidian-900 border border-obsidian-800 hover:border-red-500/40 transition text-sm text-white"
                    >
                      <div>
                        <div className="font-semibold text-slate-200">{tl.title}</div>
                        {tl.description && (
                          <div className="text-xs text-slate-400 mt-0.5">{tl.description}</div>
                        )}
                      </div>
                      <ExternalLink className="w-4 h-4 text-slate-400" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* FAQs (omitted if empty) */}
            {previewOffer.faqs && previewOffer.faqs.length > 0 && (
              <div className="bg-obsidian-950 p-4 rounded-xl border border-obsidian-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Frequently Asked Questions
                </h3>
                <div className="space-y-2">
                  {previewOffer.faqs.map((faq, idx) => (
                    <div key={idx} className="p-3 rounded-lg bg-obsidian-900 border border-obsidian-800">
                      <div className="text-sm font-semibold text-slate-200">{faq.question}</div>
                      <div className="text-xs text-slate-400 mt-1 leading-relaxed">{faq.answer}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Additional Notes (omitted if empty) */}
            {previewOffer.additionalNotes && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                <span className="font-semibold">Important Notes: </span>
                {previewOffer.additionalNotes}
              </div>
            )}

            {/* Share / Attribution notice */}
            <div className="p-3 rounded-lg bg-obsidian-950 border border-obsidian-800 text-xs text-slate-400">
              <span className="font-semibold text-white">Referral Attribution: </span>
              Users sharing this offer receive a signed link (`?ref=...&sig=...`). Sharing or clicking alone does not credit rewards; rewards are credited only upon verified completion.
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingOffer}
        onClose={() => setDeletingOffer(null)}
        onConfirm={handleDelete}
        title="Delete Offer"
        message={`Are you sure you want to delete "${deletingOffer?.title}"? This will permanently remove the offer from the mobile catalog.`}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete Offer'}
        variant="danger"
      />
    </div>
  );
};
export default OffersManagement;
