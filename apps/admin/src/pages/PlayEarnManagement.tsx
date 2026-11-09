import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loader2, Save, Gamepad2, AlertCircle } from 'lucide-react';

export const PlayEarnManagement: React.FC = () => {
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getPlayEarnConfigs();
      setConfigs(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load Play & Earn configs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const handleUpdate = async (activityType: string, updatedFields: any) => {
    try {
      setSavingKey(activityType);
      await api.updatePlayEarnConfig(activityType, updatedFields);
      await fetchConfigs();
      alert(`Updated settings for ${activityType}`);
    } catch (err: any) {
      alert(err.message || 'Failed to update config');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <Gamepad2 className="w-6 h-6 text-emerald-400" /> Play & Earn Activities Management
        </h1>
        <p className="text-sm text-slate-400">
          Configure daily attempt limits, reward points, spin wheel segments, and quiz questions. Outgoing outcomes are strictly server-validated.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
          <button onClick={fetchConfigs} className="px-3 py-1 bg-red-600 text-white rounded text-xs">Retry</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {configs.map((c) => (
            <div key={c.activityType} className="bg-obsidian-900 border border-obsidian-700/60 rounded-xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-obsidian-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-white">{c.title}</h3>
                  <span className="text-xs text-slate-400 uppercase tracking-wider">{c.activityType}</span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={c.enabled}
                    onChange={(e) => handleUpdate(c.activityType, { enabled: e.target.checked })}
                    className="rounded border-obsidian-700 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className={`text-xs font-bold ${c.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {c.enabled ? 'ENABLED' : 'DISABLED'}
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Daily Limit</label>
                  <input
                    type="number"
                    defaultValue={c.dailyLimit}
                    onBlur={(e) => handleUpdate(c.activityType, { dailyLimit: Number(e.target.value) })}
                    className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-2.5 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Min Points</label>
                  <input
                    type="number"
                    defaultValue={c.minPoints}
                    onBlur={(e) => handleUpdate(c.activityType, { minPoints: Number(e.target.value) })}
                    className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-2.5 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Max Points</label>
                  <input
                    type="number"
                    defaultValue={c.maxPoints}
                    onBlur={(e) => handleUpdate(c.activityType, { maxPoints: Number(e.target.value) })}
                    className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-2.5 py-1.5 text-white text-sm"
                  />
                </div>
              </div>

              {c.activityType === 'SPIN_WHEEL' && (
                <div className="bg-obsidian-950/60 p-3 rounded-lg border border-obsidian-800 text-xs">
                  <span className="font-semibold text-slate-300 block mb-1">Wheel Segments (Points):</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(c.spinSegments || []).map((seg: number, i: number) => (
                      <span key={i} className="px-2 py-0.5 bg-obsidian-800 text-amber-300 rounded font-bold">
                        {seg} pts (${(seg / 1000).toFixed(3)})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {c.activityType === 'QUIZ' && (
                <div className="bg-obsidian-950/60 p-3 rounded-lg border border-obsidian-800 text-xs">
                  <span className="font-semibold text-slate-300 block mb-1">Questions Configured:</span>
                  <span className="text-slate-400">{(c.quizQuestions || []).length} active questions in server pool.</span>
                </div>
              )}

              {c.activityType === 'NUMBER_PUZZLE' && (
                <div className="bg-obsidian-950/60 p-3 rounded-lg border border-obsidian-800 text-xs">
                  <span className="font-semibold text-slate-300 block mb-1">Puzzle Settings:</span>
                  <span className="text-slate-400">Target: 3x3 Grid [1-8, 0]. Time Limit: {c.puzzleConfig?.timeLimitSeconds || 120}s.</span>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  disabled={savingKey === c.activityType}
                  className="px-3 py-1.5 bg-obsidian-800 hover:bg-obsidian-700 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  {savingKey === c.activityType ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Saved Auto
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

