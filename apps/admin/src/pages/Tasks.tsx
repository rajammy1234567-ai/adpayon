import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CheckSquare,
  PlusCircle,
  Play,
  Pause,
  Edit2,
  Clock,
  ShieldCheck,
  Search,
  AlertCircle,
  Sparkles,
  Ban,
} from 'lucide-react';
import { api } from '../services/api';
import { Task, TaskStatus, Pagination } from '../types';
import { DataTable, Column } from '../components/common/DataTable';
import { Badge } from '../components/common/Badge';
import { ConfirmModal } from '../components/common/ConfirmModal';

export const Tasks: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialCampaignId = searchParams.get('campaignId') || '';

  const [tasks, setTasks] = useState<Task[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [campaignIdFilter, setCampaignIdFilter] = useState<string>(initialCampaignId);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  // Publish / Pause / Expire confirmation modal states
  const [taskToPublish, setTaskToPublish] = useState<Task | null>(null);
  const [taskToPause, setTaskToPause] = useState<Task | null>(null);
  const [taskToExpire, setTaskToExpire] = useState<Task | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const fetchTasks = async (page = 1) => {
    setIsLoading(true);
    setActionError(null);
    try {
      const res = await api.listTasks({
        page,
        limit: 10,
        status: statusFilter,
        campaignId: campaignIdFilter || undefined,
      });
      if (res.success) {
        setTasks(res.data.tasks);
        setPagination(res.data.pagination);
      }
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || 'Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks(1);
  }, [statusFilter, campaignIdFilter]);

  const handlePublishConfirm = async () => {
    if (!taskToPublish) return;
    setIsProcessingAction(true);
    setActionError(null);
    try {
      await api.publishTask(taskToPublish.id);
      setTaskToPublish(null);
      await fetchTasks(pagination.page);
    } catch (err: any) {
      setActionError(err.message || 'Failed to publish task');
      setTaskToPublish(null);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handlePauseConfirm = async () => {
    if (!taskToPause) return;
    setIsProcessingAction(true);
    setActionError(null);
    try {
      await api.pauseTask(taskToPause.id);
      setTaskToPause(null);
      await fetchTasks(pagination.page);
    } catch (err: any) {
      setActionError(err.message || 'Failed to pause task');
      setTaskToPause(null);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleExpireConfirm = async () => {
    if (!taskToExpire) return;
    setIsProcessingAction(true);
    setActionError(null);
    try {
      await api.expireTask(taskToExpire.id);
      setTaskToExpire(null);
      await fetchTasks(pagination.page);
    } catch (err: any) {
      setActionError(err.message || 'Failed to expire task');
      setTaskToExpire(null);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const filteredTasks = tasks.filter(
    (t) =>
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      (t.campaign?.name || '').toLowerCase().includes(search.toLowerCase())
  );

  const columns: Column<Task>[] = [
    {
      header: 'Task Title & Campaign',
      accessor: (row) => {
        const isSandbox = row.isSandbox || row.campaign?.isSandbox;
        return (
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-white tracking-tight">{row.title}</p>
              {isSandbox && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                  SANDBOX
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {row.campaign ? row.campaign.name : `Campaign ID: ${row.campaignId.slice(-6)}`}
            </p>
          </div>
        );
      },
    },
    {
      header: 'Category & Verification',
      accessor: (row) => (
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-slate-300 block">{row.category}</span>
          <span className="text-[10px] font-mono text-cyan-400 bg-obsidian-800 px-1.5 py-0.5 rounded border border-obsidian-700">
            {row.verificationMethod}
          </span>
          {row.expiresAt && (
            <span className="text-[10px] text-amber-400/90 flex items-center gap-1 font-mono">
              Exp: {new Date(row.expiresAt).toLocaleDateString()}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Reward Points',
      accessor: (row) => (
        <div className="flex items-center gap-1.5 font-bold text-amber-300">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>{row.rewardPoints.toLocaleString()} PTS</span>
        </div>
      ),
    },
    {
      header: 'Cap Progress',
      accessor: (row) => (
        <div>
          <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
            <span>
              {row.completionsCount} / {row.totalCap}
            </span>
            <span className="text-[10px] text-slate-500">
              {Math.round((row.completionsCount / row.totalCap) * 100)}%
            </span>
          </div>
          <div className="w-24 h-1.5 bg-obsidian-800 rounded-full overflow-hidden border border-obsidian-700">
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: `${Math.min(100, (row.completionsCount / row.totalCap) * 100)}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      header: 'Dwell & Targeting',
      accessor: (row) => (
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-1 text-slate-400">
            <Clock className="w-3 h-3 text-slate-500" />
            <span>{row.dwellTimeSeconds}s min dwell</span>
          </div>
          <div className="flex items-center gap-2">
            {row.targeting?.kycRequired && (
              <span className="text-[10px] font-medium text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                KYC Required
              </span>
            )}
            {row.targeting?.minAncestryDepth ? (
              <span className="text-[10px] text-slate-400 font-mono">
                Depth: {row.targeting.minAncestryDepth}+
              </span>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (row) => <Badge status={row.status} />,
    },
    {
      header: 'Actions',
      className: 'text-right',
      accessor: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          {row.status === 'PUBLISHED' ? (
            <button
              onClick={() => setTaskToPause(row)}
              title="Pause Task"
              className="p-1.5 text-orange-400 hover:bg-obsidian-800 rounded-lg transition"
            >
              <Pause className="w-4 h-4" />
            </button>
          ) : row.status !== 'ARCHIVED' ? (
            <button
              onClick={() => setTaskToPublish(row)}
              title="Publish Task"
              className="p-1.5 text-emerald-400 hover:bg-obsidian-800 rounded-lg transition"
            >
              <Play className="w-4 h-4" />
            </button>
          ) : null}

          {(row.status === 'PUBLISHED' || row.status === 'PAUSED') && (
            <button
              onClick={() => setTaskToExpire(row)}
              title="Expire & Archive Task"
              className="p-1.5 text-rose-400 hover:bg-obsidian-800 rounded-lg transition"
            >
              <Ban className="w-4 h-4" />
            </button>
          )}

          <Link
            to={`/tasks/${row.id}/edit`}
            title="Edit Task"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-obsidian-800 rounded-lg transition"
          >
            <Edit2 className="w-4 h-4" />
          </Link>
        </div>
      ),
    },
  ];

  const statusOptions: (TaskStatus | 'ALL')[] = ['ALL', 'DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Task Engine Operations</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure earner engagement tasks, dwell time rules, targeting criteria, and publication states.
          </p>
        </div>
        <Link
          to="/tasks/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-950/60 hover:from-emerald-500 hover:to-teal-400 transition"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>Create Task</span>
        </Link>
      </div>

      {actionError && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex items-center gap-1 overflow-x-auto p-1 bg-obsidian-900 border border-obsidian-700 rounded-xl">
          {statusOptions.map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-obsidian-800'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {campaignIdFilter && (
            <button
              onClick={() => setCampaignIdFilter('')}
              className="text-xs text-slate-400 hover:text-rose-400 border border-obsidian-700 px-2.5 py-1.5 rounded-xl bg-obsidian-900"
            >
              Clear Campaign Filter ✕
            </button>
          )}

          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-obsidian-900 border border-obsidian-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Tasks Table */}
      <DataTable
        columns={columns}
        data={filteredTasks}
        pagination={pagination}
        isLoading={isLoading}
        onPageChange={(page) => fetchTasks(page)}
        keyExtractor={(item) => item.id}
        emptyMessage="No tasks found matching operational criteria"
      />

      {/* Publish Confirmation Modal */}
      {taskToPublish && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setTaskToPublish(null)}
          onConfirm={handlePublishConfirm}
          title="Safe Publication: Release Task to Earners"
          message={`Are you sure you want to publish '${taskToPublish.title}'? The task will immediately become visible to eligible earners in the ADPAYON feed. Publication requires that the parent campaign is in ACTIVE status.`}
          confirmLabel="Publish to Feed"
          variant="emerald"
          isLoading={isProcessingAction}
        />
      )}

      {/* Pause Confirmation Modal */}
      {taskToPause && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setTaskToPause(null)}
          onConfirm={handlePauseConfirm}
          title="Emergency Pause: Suspend Task"
          message={`Are you sure you want to pause '${taskToPause.title}'? This will immediately hide the task from all user feeds and reject new start attempts.`}
          confirmLabel="Pause Task Now"
          variant="warning"
          isLoading={isProcessingAction}
        />
      )}

      {/* Expire Confirmation Modal */}
      {taskToExpire && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setTaskToExpire(null)}
          onConfirm={handleExpireConfirm}
          title="Expire Task: Archive & Close to Earners"
          message={`Are you sure you want to expire '${taskToExpire.title}'? This will archive the task, permanently remove it from all earner feeds, and reject any further task completions or reward payouts.`}
          confirmLabel="Expire Task"
          variant="danger"
          isLoading={isProcessingAction}
        />
      )}
    </div>
  );
};
