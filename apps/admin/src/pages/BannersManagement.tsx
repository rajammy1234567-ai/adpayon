import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Plus, Edit2, Trash2, ExternalLink, Loader2, Image as ImageIcon } from 'lucide-react';

interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  destinationUrl: string;
  sponsorName: string;
  active: boolean;
  displayOrder: number;
  clicksCount: number;
  createdAt: string;
}

export const BannersManagement: React.FC = () => {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);

  // Form
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [sponsorName, setSponsorName] = useState('');
  const [displayOrder, setDisplayOrder] = useState('0');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchBanners = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.listBanners();
      setBanners(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load banners');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBanners();
  }, []);

  const handleOpenCreate = () => {
    setEditingBanner(null);
    setTitle('');
    setImageUrl('');
    setDestinationUrl('');
    setSponsorName('AdPayOn Partner');
    setDisplayOrder('0');
    setActive(true);
    setModalOpen(true);
  };

  const handleOpenEdit = (b: Banner) => {
    setEditingBanner(b);
    setTitle(b.title);
    setImageUrl(b.imageUrl);
    setDestinationUrl(b.destinationUrl);
    setSponsorName(b.sponsorName);
    setDisplayOrder(b.displayOrder.toString());
    setActive(b.active);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const payload = {
        title,
        imageUrl,
        destinationUrl,
        sponsorName,
        displayOrder: Number(displayOrder),
        active,
      };

      if (editingBanner) {
        await api.updateBanner(editingBanner.id, payload);
      } else {
        await api.createBanner(payload);
      }
      setModalOpen(false);
      fetchBanners();
    } catch (err: any) {
      alert(err.message || 'Failed to save banner');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this sponsored banner?')) return;
    try {
      await api.deleteBanner(id);
      fetchBanners();
    } catch (err: any) {
      alert(err.message || 'Failed to delete banner');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Sponsored Banners</h1>
          <p className="text-sm text-slate-400">Manage high-visibility promotional banners displayed across Home discovery.</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Banner
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchBanners} className="px-3 py-1 bg-red-600 text-white rounded text-xs">Retry</button>
        </div>
      ) : banners.length === 0 ? (
        <div className="bg-obsidian-900 border border-obsidian-700/60 rounded-xl p-12 text-center text-slate-400">
          <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No sponsored banners created yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {banners.map((b) => (
            <div key={b.id} className="bg-obsidian-900 border border-obsidian-700/60 rounded-xl overflow-hidden shadow-lg flex flex-col">
              <div className="relative aspect-video bg-obsidian-950">
                <img src={b.imageUrl} alt={b.title} className="w-full h-full object-cover" />
                <span className={`absolute top-2 right-2 text-xs px-2 py-0.5 rounded font-bold uppercase ${b.active ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-700 text-slate-300'}`}>
                  {b.active ? 'Active' : 'Inactive'}
                </span>
                <span className="absolute bottom-2 left-2 text-[11px] bg-obsidian-900/80 px-2 py-0.5 rounded text-amber-300 font-semibold">
                  {b.sponsorName}
                </span>
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-white text-base truncate">{b.title}</h3>
                  <a
                    href={b.destinationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline mt-1 truncate max-w-full"
                  >
                    <ExternalLink className="w-3 h-3" /> {b.destinationUrl}
                  </a>
                  <div className="mt-3 text-xs text-slate-400 flex items-center justify-between border-t border-obsidian-800 pt-2">
                    <span>Order: #{b.displayOrder}</span>
                    <span>Clicks: {b.clicksCount || 0}</span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-2 pt-2 border-t border-obsidian-800">
                  <button
                    onClick={() => handleOpenEdit(b)}
                    className="p-1.5 hover:bg-obsidian-800 text-slate-300 hover:text-white rounded transition"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(b.id)}
                    className="p-1.5 hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-obsidian-900 border border-obsidian-700 rounded-2xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-xl font-bold text-white">
              {editingBanner ? 'Edit Banner' : 'Create Sponsored Banner'}
            </h2>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Banner Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white text-sm"
                  placeholder="e.g. Diwali Super Rewards Offer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Image URL</label>
                <input
                  type="url"
                  required
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white text-sm"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Destination URL / Route</label>
                <input
                  type="text"
                  required
                  value={destinationUrl}
                  onChange={(e) => setDestinationUrl(e.target.value)}
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white text-sm"
                  placeholder="https://partner.com or /offers"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Sponsor Name</label>
                  <input
                    type="text"
                    value={sponsorName}
                    onChange={(e) => setSponsorName(e.target.value)}
                    className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Display Order</label>
                  <input
                    type="number"
                    value={displayOrder}
                    onChange={(e) => setDisplayOrder(e.target.value)}
                    className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="activeCheck"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="rounded border-obsidian-700 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="activeCheck" className="text-sm text-slate-300 font-medium">Active (Visible to users)</label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-obsidian-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save Banner
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

