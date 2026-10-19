import React, { useEffect, useState } from 'react';
import { FileText, Search, Eye, ShieldCheck, Terminal } from 'lucide-react';
import { api } from '../services/api';
import { AdminAuditLog, Pagination } from '../types';
import { DataTable, Column } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Inspector modal
  const [selectedLog, setSelectedLog] = useState<AdminAuditLog | null>(null);

  const fetchLogs = async (page = 1) => {
    setIsLoading(true);
    try {
      const res = await api.listAuditLogs({
        page,
        limit: 15,
        action: actionFilter || undefined,
        targetEntity: entityFilter || undefined,
      });
      if (res.success) {
        setLogs(res.data.logs);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, [actionFilter, entityFilter]);

  const columns: Column<AdminAuditLog>[] = [
    {
      header: 'Admin Identity',
      accessor: (row) => (
        <div>
          <p className="font-semibold text-white tracking-tight">{row.admin?.name || 'Administrator'}</p>
          <p className="text-xs text-slate-400 font-mono mt-0.5">{row.admin?.mobile || 'System'}</p>
        </div>
      ),
    },
    {
      header: 'Action Event',
      accessor: (row) => {
        let badgeColor = 'bg-slate-800 text-slate-300 border-slate-700';
        if (row.action.includes('LOGIN') || row.action.includes('PUBLISH')) {
          badgeColor = 'bg-emerald-950/60 text-emerald-400 border-emerald-500/30';
        } else if (row.action.includes('PAUSE') || row.action.includes('REVEAL')) {
          badgeColor = 'bg-amber-950/60 text-amber-400 border-amber-500/30';
        } else if (row.action.includes('REJECT') || row.action.includes('FAILED')) {
          badgeColor = 'bg-rose-950/60 text-rose-400 border-rose-500/30';
        }
        return (
          <span className={`inline-block font-mono text-xs px-2.5 py-0.5 rounded-md border ${badgeColor}`}>
            {row.action}
          </span>
        );
      },
    },
    {
      header: 'Target Entity & ID',
      accessor: (row) => (
        <div>
          <span className="text-xs font-semibold text-white">{row.targetEntity}</span>
          {row.targetId && (
            <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[140px]">
              {row.targetId}
            </p>
          )}
        </div>
      ),
    },
    {
      header: 'IP Address',
      accessor: (row) => <span className="font-mono text-xs text-slate-400">{row.ipAddress}</span>,
    },
    {
      header: 'Timestamp',
      accessor: (row) => (
        <span className="text-xs text-slate-400">
          {new Date(row.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      header: 'Details',
      className: 'text-right',
      accessor: (row) => (
        <button
          onClick={() => setSelectedLog(row)}
          className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-semibold transition"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Payload</span>
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Security & Compliance Audit Trail</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Immutable append-only record of all administrative operations, secret accesses, and status changes.
          </p>
        </div>
      </div>

      {/* Filter Inputs */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Filter by action..."
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full bg-obsidian-900 border border-obsidian-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="relative w-full sm:w-64">
          <Terminal className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Filter by target entity..."
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="w-full bg-obsidian-900 border border-obsidian-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <DataTable
        columns={columns}
        data={logs}
        pagination={pagination}
        isLoading={isLoading}
        onPageChange={(page) => fetchLogs(page)}
        keyExtractor={(item) => item.id}
        emptyMessage="No administrative audit logs found"
      />

      {/* Log Details Modal */}
      {selectedLog && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedLog(null)}
          title="Audit Log Event Details"
          subtitle={`Event ID: ${selectedLog.id} • Action: ${selectedLog.action}`}
          maxWidth="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-700">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Admin</span>
                <span className="text-white font-medium mt-1 block">
                  {selectedLog.admin?.name} ({selectedLog.admin?.mobile})
                </span>
              </div>
              <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-700">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">IP Address</span>
                <span className="text-emerald-400 font-mono mt-1 block">{selectedLog.ipAddress}</span>
              </div>
            </div>

            <div>
              <span className="text-xs font-bold text-white block mb-1.5">Action Event Metadata</span>
              <pre className="p-4 rounded-xl bg-obsidian-950 border border-obsidian-700 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-60">
                {JSON.stringify(selectedLog.details || {}, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="rounded-xl border border-obsidian-600 bg-obsidian-800 px-4 py-2 text-xs font-semibold text-white hover:bg-obsidian-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
