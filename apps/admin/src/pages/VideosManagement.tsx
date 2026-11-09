import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Plus, Edit2, Trash2, Video, Loader2, ExternalLink } from 'lucide-react';

interface VideoItem {
  id: string;
  title: string;
  thumbnailUrl: string;
  videoUrl: string;
  category: string;
  durationSeconds: number;
  instructions: string[];
  rewardPoints: number;
  usdValue: number;
  isRewardBearing: boolean;
  isPublished: boolean;
  displayOrder: number;
}

export const VideosManagement: React.FC = () => {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<VideoItem | null>(null);

  // Form
  const [title, setTitle] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [category, setCategory] = useState('Learning');
  const [durationSeconds, setDurationSeconds] = useState('60');
  const [rewardPoints, setRewardPoints] = useState('0');
  const [isRewardBearing, setIsRewardBearing] = useState(false);
  const [isPublished, setIsPublished] = useState(true);
  const [displayOrder, setDisplayOrder] = useState('0');
  const [saving, setSaving] = useState(false);

  const fetchVideos = async () => {
    try {
      setLoading(true);
      const res = await api.listVideos();
      setVideos(res.data || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  const handleOpenCreate = () => {
    setEditingVideo(null);
    setTitle('');
    setThumbnailUrl('');
    setVideoUrl('');
    setCategory('Learning');
    setDurationSeconds('60');
    setRewardPoints('0');
    setIsRewardBearing(false);
    setIsPublished(true);
    setDisplayOrder('0');
    setModalOpen(true);
  };

  const handleOpenEdit = (v: VideoItem) => {
    setEditingVideo(v);
    setTitle(v.title);
    setThumbnailUrl(v.thumbnailUrl);
    setVideoUrl(v.videoUrl);
    setCategory(v.category);
    setDurationSeconds(v.durationSeconds.toString());
    setRewardPoints(v.rewardPoints.toString());
    setIsRewardBearing(v.isRewardBearing);
    setIsPublished(v.isPublished);
    setDisplayOrder(v.displayOrder.toString());
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const payload = {
        title,
        thumbnailUrl,
        videoUrl,
        category,
        durationSeconds: Number(durationSeconds),
        rewardPoints: Number(rewardPoints),
        isRewardBearing,
        isPublished,
        displayOrder: Number(displayOrder),
      };

      if (editingVideo) {
        await api.updateVideo(editingVideo.id, payload);
      } else {
        await api.createVideo(payload);
      }
      setModalOpen(false);
      fetchVideos();
    } catch (err: any) {
      alert(err.message || 'Failed to save video');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this video?')) return;
    try {
      await api.deleteVideo(id);
      fetchVideos();
    } catch (err: any) {
      alert(err.message || 'Failed to delete video');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Video className="w-6 h-6 text-emerald-400" /> Video Wall Content Management
          </h1>
          <p className="text-sm text-slate-400">
            Publish ordinary video presentations or reward-bearing task videos. Reward videos require manual or evidence verification.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Video
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        </div>
      ) : videos.length === 0 ? (
        <div className="bg-obsidian-900 border border-obsidian-700/60 rounded-xl p-12 text-center text-slate-400">
          <Video className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No videos published yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((v) => (
            <div key={v.id} className="bg-obsidian-900 border border-obsidian-700/60 rounded-xl overflow-hidden shadow-lg flex flex-col justify-between">
              <div>
                <div className="relative aspect-video bg-obsidian-950">
                  <img src={v.thumbnailUrl} alt={v.title} className="w-full h-full object-cover" />
                  <span className="absolute bottom-2 right-2 bg-black/75 px-1.5 py-0.5 rounded text-[11px] font-mono text-white">
                    {Math.floor(v.durationSeconds / 60)}:{(v.durationSeconds % 60).toString().padStart(2, '0')}
                  </span>
                  <span className={`absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                    v.isRewardBearing ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-blue-500/20 text-blue-300'
                  }`}>
                    {v.isRewardBearing ? `${v.rewardPoints} PTS REWARD` : 'INFO VIDEO'}
                  </span>
                </div>
                <div className="p-4 space-y-1">
                  <span className="text-xs text-slate-400 font-semibold uppercase">{v.category}</span>
                  <h3 className="font-bold text-white text-base truncate">{v.title}</h3>
                  <a
                    href={v.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline pt-1"
                  >
                    <ExternalLink className="w-3 h-3" /> Watch Link
                  </a>
                </div>
              </div>

              <div className="p-4 pt-2 border-t border-obsidian-800 flex items-center justify-between">
                <span className={`text-[11px] font-bold uppercase ${v.isPublished ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {v.isPublished ? 'Published' : 'Draft'}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleOpenEdit(v)} className="p-1.5 hover:bg-obsidian-800 text-slate-300 rounded">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(v.id)} className="p-1.5 hover:bg-red-500/10 text-red-400 rounded">
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
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-obsidian-900 border border-obsidian-700 rounded-2xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-xl font-bold text-white">{editingVideo ? 'Edit Video' : 'Add Video'}</h2>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Thumbnail URL</label>
                <input
                  type="url"
                  required
                  value={thumbnailUrl}
                  onChange={(e) => setThumbnailUrl(e.target.value)}
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Video Stream/YouTube URL</label>
                <input
                  type="url"
                  required
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Duration (Sec)</label>
                  <input
                    type="number"
                    value={durationSeconds}
                    onChange={(e) => setDurationSeconds(e.target.value)}
                    className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="rewardCheck"
                  checked={isRewardBearing}
                  onChange={(e) => setIsRewardBearing(e.target.checked)}
                  className="rounded border-obsidian-700 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="rewardCheck" className="text-xs text-slate-300 font-semibold">Reward-Bearing Task Video</label>
              </div>

              {isRewardBearing && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Reward Points</label>
                  <input
                    type="number"
                    value={rewardPoints}
                    onChange={(e) => setRewardPoints(e.target.value)}
                    className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white text-sm"
                  />
                  <span className="text-[11px] text-amber-300">
                    = ${(Number(rewardPoints) / 1000).toFixed(3)} USD
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="publishCheck"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="rounded border-obsidian-700 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="publishCheck" className="text-xs text-slate-300 font-semibold">Published</label>
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
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save Video
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

