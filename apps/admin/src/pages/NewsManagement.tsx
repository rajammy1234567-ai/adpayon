import React, { useState, useEffect, useMemo } from 'react';
import {
  Newspaper,
  Plus,
  Search,
  ExternalLink,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api';
import { AdminNewsArticle } from '../types';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { ConfirmModal } from '../components/common/ConfirmModal';

export const NewsManagement: React.FC = () => {
  const [articles, setArticles] = useState<AdminNewsArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PUBLISHED' | 'DRAFT'>('ALL');

  // Form Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<AdminNewsArticle | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [source, setSource] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('announcement');
  const [priority, setPriority] = useState<number>(0);
  const [isPublished, setIsPublished] = useState(true);

  // Delete Confirm Modal State
  const [deletingArticle, setDeletingArticle] = useState<AdminNewsArticle | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadArticles = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.listNews();
      setArticles(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load curated news articles.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadArticles();
  }, []);

  const openCreateModal = () => {
    setEditingArticle(null);
    setTitle('');
    setSummary('');
    setSource('');
    setUrl('');
    setCategory('announcement');
    setPriority(0);
    setIsPublished(true);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (article: AdminNewsArticle) => {
    setEditingArticle(article);
    setTitle(article.title);
    setSummary(article.summary);
    setSource(article.source);
    setUrl(article.url);
    setCategory(article.category);
    setPriority(article.priority || 0);
    setIsPublished(article.isPublished);
    setFormError(null);
    setIsFormOpen(true);
  };

  const validateUrl = (testUrl: string): boolean => {
    try {
      const parsed = new URL(testUrl);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleSaveArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedTitle = title.trim();
    const trimmedSummary = summary.trim();
    const trimmedSource = source.trim();
    const trimmedUrl = url.trim();

    if (!trimmedTitle) {
      setFormError('Article title is required.');
      return;
    }
    if (trimmedTitle.length > 300) {
      setFormError('Title must not exceed 300 characters.');
      return;
    }
    if (!trimmedSummary) {
      setFormError('Article summary is required.');
      return;
    }
    if (trimmedSummary.length > 1000) {
      setFormError('Summary must not exceed 1000 characters.');
      return;
    }
    if (!trimmedSource) {
      setFormError('Source publication name is required.');
      return;
    }
    if (!trimmedUrl) {
      setFormError('Destination URL is required.');
      return;
    }
    if (!validateUrl(trimmedUrl)) {
      setFormError('URL must be a valid web link starting with http:// or https://');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingArticle) {
        await api.updateNews(editingArticle.id, {
          title: trimmedTitle,
          summary: trimmedSummary,
          source: trimmedSource,
          url: trimmedUrl,
          category,
          priority: Number(priority),
          isPublished,
        });
      } else {
        await api.createNews({
          title: trimmedTitle,
          summary: trimmedSummary,
          source: trimmedSource,
          url: trimmedUrl,
          category,
          priority: Number(priority),
          isPublished,
        });
      }

      setIsFormOpen(false);
      await loadArticles();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save news article.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTogglePublish = async (article: AdminNewsArticle) => {
    try {
      if (article.isPublished) {
        await api.unpublishNews(article.id);
      } else {
        await api.publishNews(article.id);
      }
      await loadArticles();
    } catch (err: any) {
      alert(err.message || 'Failed to update article publish state.');
    }
  };

  const handleDelete = async () => {
    if (!deletingArticle) return;
    try {
      setIsDeleting(true);
      await api.deleteNews(deletingArticle.id);
      setDeletingArticle(null);
      await loadArticles();
    } catch (err: any) {
      alert(err.message || 'Failed to delete news article.');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredArticles = useMemo(() => {
    return articles.filter((item) => {
      const matchesSearch =
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === 'PUBLISHED') return item.isPublished;
      if (statusFilter === 'DRAFT') return !item.isPublished;
      return true;
    });
  }, [articles, searchQuery, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-obsidian-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Newspaper className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Curated News Feed</h1>
              <p className="text-xs text-slate-400">
                Verified external news articles shown on user dashboard. Zero task points reward.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadArticles}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-obsidian-800 hover:bg-obsidian-750 text-slate-300 border border-obsidian-700 text-xs font-semibold transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg shadow-emerald-950/50 transition"
          >
            <Plus className="w-4 h-4" />
            New Article
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search by title, source, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-obsidian-900 border border-obsidian-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-obsidian-900 p-1 rounded-xl border border-obsidian-750">
          {(['ALL', 'PUBLISHED', 'DRAFT'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setStatusFilter(mode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                statusFilter === mode
                  ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {mode === 'ALL' ? 'All Articles' : mode === 'PUBLISHED' ? 'Published' : 'Drafts'}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 flex items-center gap-3 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
          <p className="text-xs">Loading news articles...</p>
        </div>
      ) : filteredArticles.length === 0 ? (
        <div className="py-20 border border-dashed border-obsidian-750 rounded-2xl text-center space-y-3">
          <Newspaper className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-300">No articles found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery
              ? 'No news articles match your current search criteria.'
              : 'No news articles have been created yet. Click "New Article" to add one.'}
          </p>
        </div>
      ) : (
        /* Articles List */
        <div className="grid grid-cols-1 gap-3">
          {filteredArticles.map((article) => (
            <div
              key={article.id}
              className="p-5 rounded-2xl bg-obsidian-900/90 border border-obsidian-750 hover:border-obsidian-650 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge status={article.isPublished ? 'PUBLISHED' : 'DRAFT'} size="sm" />
                  <span className="px-2 py-0.5 rounded-md bg-obsidian-800 text-[10px] text-slate-400 uppercase tracking-wider font-semibold border border-obsidian-700">
                    {article.category}
                  </span>
                  {article.priority > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-[10px] text-amber-400 font-semibold border border-amber-500/20">
                      Priority {article.priority}
                    </span>
                  )}
                  <span className="text-xs text-slate-500 font-medium">• {article.source}</span>
                </div>

                <h3 className="text-sm font-bold text-white tracking-tight line-clamp-1">
                  {article.title}
                </h3>
                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                  {article.summary}
                </p>

                <div className="pt-1">
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 hover:underline"
                  >
                    <span className="truncate max-w-md">{article.url}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0 self-end md:self-center pt-2 md:pt-0 border-t md:border-t-0 border-obsidian-800">
                <button
                  onClick={() => handleTogglePublish(article)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                    article.isPublished
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                      : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                  }`}
                  title={article.isPublished ? 'Unpublish article' : 'Publish article'}
                >
                  {article.isPublished ? (
                    <>
                      <XCircle className="w-3.5 h-3.5" />
                      Unpublish
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      Publish
                    </>
                  )}
                </button>

                <button
                  onClick={() => openEditModal(article)}
                  className="p-2 rounded-xl bg-obsidian-800 hover:bg-obsidian-750 text-slate-300 border border-obsidian-700 transition"
                  title="Edit article"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setDeletingArticle(article)}
                  className="p-2 rounded-xl bg-rose-950/30 hover:bg-rose-950/50 text-rose-400 border border-rose-500/20 transition"
                  title="Delete article"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal Form */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingArticle ? 'Edit News Article' : 'New Curated Article'}
        subtitle="Manage verified financial/ecosystem news links displayed in the mobile home feed."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveArticle} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Article Headline / Title <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={300}
              placeholder="e.g. RBI Updates Regulatory Guidelines for Digital Payment Security"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 bg-obsidian-800 border border-obsidian-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-slate-500 mt-0.5 block text-right">
              {title.length}/300
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Summary / Excerpt <span className="text-rose-400">*</span>
            </label>
            <textarea
              required
              rows={3}
              maxLength={1000}
              placeholder="Provide a concise 1-2 sentence overview of the article..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full px-3.5 py-2 bg-obsidian-800 border border-obsidian-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
            />
            <span className="text-[10px] text-slate-500 mt-0.5 block text-right">
              {summary.length}/1000
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Source Publication <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={100}
                placeholder="e.g. The Economic Times, PIB, NPCI"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-3.5 py-2 bg-obsidian-800 border border-obsidian-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2 bg-obsidian-800 border border-obsidian-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="announcement">Platform Announcement</option>
                <option value="financial-literacy">Financial Literacy</option>
                <option value="security">Digital Security & UPI</option>
                <option value="market-insights">Market Insights</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Destination External URL <span className="text-rose-400">*</span>
            </label>
            <input
              type="url"
              required
              placeholder="https://economictimes.indiatimes.com/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-3.5 py-2 bg-obsidian-800 border border-obsidian-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Must be a secure web destination starting with https:// or http://. Opens externally in user browser.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Priority Rank (0 - 100)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full px-3.5 py-2 bg-obsidian-800 border border-obsidian-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-slate-500">Higher numbers appear higher on user feed.</span>
            </div>

            <div className="flex items-center gap-3 self-center pt-3">
              <input
                type="checkbox"
                id="isPublishedCheck"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 bg-obsidian-800 border-obsidian-700"
              />
              <label htmlFor="isPublishedCheck" className="text-xs font-semibold text-slate-200 cursor-pointer">
                Publish Immediately
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-obsidian-750">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-obsidian-800 hover:bg-obsidian-750 text-slate-300 text-xs font-semibold border border-obsidian-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950/50 transition disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editingArticle ? 'Save Changes' : 'Create Article'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingArticle)}
        onClose={() => setDeletingArticle(null)}
        onConfirm={handleDelete}
        title="Delete News Article"
        message={`Are you sure you want to permanently delete "${deletingArticle?.title}"? This cannot be undone.`}
        confirmLabel="Delete Article"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
};

