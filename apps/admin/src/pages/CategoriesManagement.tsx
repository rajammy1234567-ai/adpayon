import React, { useState, useEffect, useMemo } from 'react';
import {
  Tag,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle,
  PauseCircle,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api';
import { Category, CategoryStatus } from '../types';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { ConfirmModal } from '../components/common/ConfirmModal';

export const CategoriesManagement: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | CategoryStatus>('ALL');

  // Form Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [displayOrder, setDisplayOrder] = useState<number>(0);
  const [status, setStatus] = useState<CategoryStatus>('PUBLISHED');

  // Delete Confirm Modal State
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadCategories = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.listCategories();
      if (!res || !res.success || !Array.isArray(res.data)) {
        throw new Error('Unexpected response format while loading categories from server.');
      }
      setCategories(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load categories.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const openCreateModal = () => {
    setEditingCategory(null);
    setName('');
    setSlug('');
    setDescription('');
    setIcon('');
    setBannerUrl('');
    setDisplayOrder(categories.length);
    setStatus('PUBLISHED');
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (cat: Category) => {
    setEditingCategory(cat);
    setName(cat.name);
    setSlug(cat.slug);
    setDescription(cat.description || '');
    setIcon(cat.icon || '');
    setBannerUrl(cat.bannerUrl || '');
    setDisplayOrder(cat.displayOrder ?? 0);
    setStatus(cat.status);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!editingCategory) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)+/g, '')
      );
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Category name is required.');
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError(null);

      const payload = {
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
        icon: icon.trim() || undefined,
        bannerUrl: bannerUrl.trim() || undefined,
        displayOrder: Number(displayOrder) || 0,
        status,
      };

      if (editingCategory) {
        await api.updateCategory(editingCategory.id, payload);
      } else {
        await api.createCategory(payload);
      }

      setIsFormOpen(false);
      await loadCategories();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save category.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (cat: Category, newStatus: CategoryStatus) => {
    try {
      await api.updateCategory(cat.id, { status: newStatus });
      await loadCategories();
    } catch (err: any) {
      alert(`Failed to update category status: ${err.message}`);
    }
  };

  const handleDelete = async () => {
    if (!deletingCategory) return;
    try {
      setIsDeleting(true);
      await api.deleteCategory(deletingCategory.id);
      setDeletingCategory(null);
      await loadCategories();
    } catch (err: any) {
      alert(`Failed to delete category: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredCategories = useMemo(() => {
    return categories.filter((cat) => {
      const matchesSearch =
        cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cat.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (cat.description && cat.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus = statusFilter === 'ALL' || cat.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [categories, searchQuery, statusFilter]);

  const getStatusBadge = (s: CategoryStatus) => {
    return <Badge status={s} />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-wide flex items-center gap-2">
            <Tag className="w-6 h-6 text-red-500" />
            Categories Management
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Organize offers, services, and tasks into navigable categories for mobile and web users.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadCategories}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-obsidian-800 text-slate-300 hover:text-white border border-obsidian-700 transition"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold transition shadow-lg shadow-red-900/30"
          >
            <Plus className="w-4 h-4" />
            Add Category
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-obsidian-900 p-4 rounded-xl border border-obsidian-700">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search categories by name, slug, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium whitespace-nowrap">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-red-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
            <option value="PAUSED">Paused</option>
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
            onClick={loadCategories}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/30 hover:bg-red-600/50 text-red-200 text-xs font-semibold transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Categories Table */}
      <div className="bg-obsidian-900 border border-obsidian-700 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-obsidian-800/80 text-xs uppercase text-slate-400 border-b border-obsidian-700">
              <tr>
                <th className="px-6 py-4">Order</th>
                <th className="px-6 py-4">Name / Slug</th>
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4 text-center">Offers</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-obsidian-800">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-red-500 mx-auto mb-2" />
                    <span className="text-xs text-slate-400">Loading categories...</span>
                  </td>
                </tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    No categories found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredCategories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-obsidian-800/50 transition">
                    <td className="px-6 py-4 font-mono text-xs text-slate-400">
                      #{cat.displayOrder ?? 0}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white flex items-center gap-2">
                        {cat.icon && <span className="text-base">{cat.icon}</span>}
                        {cat.name}
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">/{cat.slug}</div>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400 max-w-xs truncate">
                      {cat.description || '—'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-obsidian-800 text-slate-200 border border-obsidian-700">
                        {cat.offersCount ?? 0}
                      </span>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(cat.status)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {cat.status === 'PUBLISHED' ? (
                          <button
                            title="Pause category"
                            onClick={() => handleToggleStatus(cat, 'PAUSED')}
                            className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-400/10 transition"
                          >
                            <PauseCircle className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            title="Publish category"
                            onClick={() => handleToggleStatus(cat, 'PUBLISHED')}
                            className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-400/10 transition"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          title="Edit category"
                          onClick={() => openEditModal(cat)}
                          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-obsidian-700 transition"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          title="Delete category"
                          onClick={() => setDeletingCategory(cat)}
                          className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingCategory ? 'Edit Category' : 'Create New Category'}
      >
        <form onSubmit={handleSaveCategory} className="space-y-4">
          {formError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-300 mb-1">
              Category Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Demat & Financial, E-Commerce, Gaming"
              className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-300 mb-1">
              Slug (URL Identifier)
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. demat-financial"
              className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-300 focus:outline-none focus:border-red-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">Leave blank to auto-generate from name.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-300 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of offers in this category..."
              className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-300 mb-1">
                Icon (Emoji or Short Code)
              </label>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="e.g. 💼 or trending-up"
                className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-300 mb-1">
                Display Order
              </label>
              <input
                type="number"
                min={0}
                value={displayOrder}
                onChange={(e) => setDisplayOrder(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-300 mb-1">
              Banner Image URL (Optional)
            </label>
            <input
              type="url"
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              placeholder="https://example.com/category-banner.png"
              className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-300 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as CategoryStatus)}
              className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
            >
              <option value="PUBLISHED">Published (Visible to all users)</option>
              <option value="DRAFT">Draft (Internal preparation)</option>
              <option value="PAUSED">Paused (Temporarily inactive)</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-obsidian-800">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 rounded-lg bg-obsidian-800 hover:bg-obsidian-700 text-slate-300 text-sm font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingCategory ? 'Save Changes' : 'Create Category'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingCategory}
        onClose={() => setDeletingCategory(null)}
        onConfirm={handleDelete}
        title="Delete Category"
        message={`Are you sure you want to delete "${deletingCategory?.name}"? Offers currently assigned to this category may lose their category categorization.`}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete Category'}
        variant="danger"
      />
    </div>
  );
};
export default CategoriesManagement;
