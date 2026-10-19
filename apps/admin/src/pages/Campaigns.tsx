import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Layers,
  PlusCircle,
  Key,
  Edit2,
  Plus,
  Copy,
  Check,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../services/api';
import { Campaign, CampaignStatus, Pagination } from '../types';
import { DataTable, Column } from '../components/common/DataTable';
import { Badge } from '../components/common/Badge';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { Modal } from '../components/common/Modal';

export const Campaigns: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Reveal Secret Modal State
  const [selectedCampaignForSecret, setSelectedCampaignForSecret] = useState<Campaign | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const fetchCampaigns = async (page = 1) => {
    setIsLoading(true);
    try {
      const res = await api.listCampaigns({ page, limit: 10, status: statusFilter });
      if (res.success) {
        setCampaigns(res.data.campaigns);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns(1);
  }, [statusFilter]);

  const handleRevealSecretConfirm = async () => {
    if (!selectedCampaignForSecret) return;
    setIsRevealing(true);
    try {
      const res = await api.revealCampaignSecret(selectedCampaignForSecret.id);
      if (res.success) {
        setRevealedSecret(res.data.webhookSecret);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRevealing(false);
    }
  };

  const handleCopySecret = () => {
    if (revealedSecret) {
      navigator.clipboard.writeText(revealedSecret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const filteredCampaigns = campaigns.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.advertiserName.toLowerCase().includes(search.toLowerCase()) ||
      c.authorizedAgreementRef.toLowerCase().includes(search.toLowerCase())
  );

  const columns: Column<Campaign>[] = [
    {
      header: 'Campaign & Advertiser',
      accessor: (row) => (
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-white tracking-tight">{row.name}</p>
            {row.isSandbox && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                SANDBOX QA
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{row.advertiserName}</p>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (row) => <Badge status={row.status} />,
    },
    {
      header: 'Advertiser Budget (INR)',
      accessor: (row) =>
        row.isSandbox ? (
          <div>
            <p className="font-medium text-amber-300">
              ₹0 <span className="text-[10px] text-slate-400 font-normal">(Synthetic)</span>
            </p>
            <p className="text-[10px] text-slate-500 font-mono">No real funding</p>
          </div>
        ) : (
          <div>
            <p className="font-medium text-white">
              ₹{(row.advertiserBudgetPaise / 100).toLocaleString('en-IN')}
            </p>
            <p className="text-[10px] text-slate-400 font-mono">
              Spent: ₹{(row.spentBudgetPaise / 100).toLocaleString('en-IN')}
            </p>
          </div>
        ),
    },
    {
      header: 'Agreement Ref',
      accessor: (row) =>
        row.isSandbox ? (
          <span className="font-mono text-xs text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/30">
            {row.authorizedAgreementRef} (QA)
          </span>
        ) : (
          <span className="font-mono text-xs text-emerald-400 bg-obsidian-800 px-2 py-0.5 rounded border border-obsidian-700">
            {row.authorizedAgreementRef}
          </span>
        ),
    },
    {
      header: 'Created At',
      accessor: (row) => (
        <span className="text-xs text-slate-400">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right',
      accessor: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => {
              setSelectedCampaignForSecret(row);
              setRevealedSecret(null);
            }}
            title="Reveal Webhook Secret"
            className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-obsidian-800 rounded-lg transition"
          >
            <Key className="w-4 h-4" />
          </button>
          <Link
            to={`/tasks/new?campaignId=${row.id}`}
            title="Create Task for Campaign"
            className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-obsidian-800 rounded-lg transition"
          >
            <Plus className="w-4 h-4" />
          </Link>
          <Link
            to={`/campaigns/${row.id}/edit`}
            title="Edit Campaign"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-obsidian-800 rounded-lg transition"
          >
            <Edit2 className="w-4 h-4" />
          </Link>
        </div>
      ),
    },
  ];

  const statusOptions: (CampaignStatus | 'ALL')[] = [
    'ALL',
    'DRAFT',
    'ACTIVE',
    'PAUSED',
    'COMPLETED',
    'ARCHIVED',
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Campaign Operations</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage authorized advertiser commercial agreements, funding status, and integration secrets.
          </p>
        </div>
        <Link
          to="/campaigns/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-950/60 hover:from-emerald-500 hover:to-teal-400 transition"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>Create Campaign</span>
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Status Tabs */}
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

        {/* Search Input */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search campaigns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-obsidian-900 border border-obsidian-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Campaigns Table */}
      <DataTable
        columns={columns}
        data={filteredCampaigns}
        pagination={pagination}
        isLoading={isLoading}
        onPageChange={(page) => fetchCampaigns(page)}
        keyExtractor={(item) => item.id}
        emptyMessage="No advertiser campaigns found matching criteria"
      />

      {/* Confirm Secret Reveal Modal */}
      {selectedCampaignForSecret && !revealedSecret && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setSelectedCampaignForSecret(null)}
          onConfirm={handleRevealSecretConfirm}
          title="Security Clearance: Reveal Webhook Secret"
          message={`You are about to access the cryptographic partner webhook secret for '${selectedCampaignForSecret.name}'. This action will be permanently logged in the Administrative Security Audit Trail.`}
          confirmLabel="I Understand, Reveal Secret"
          variant="warning"
          isLoading={isRevealing}
        />
      )}

      {/* Display Revealed Secret Modal */}
      {revealedSecret && selectedCampaignForSecret && (
        <Modal
          isOpen={true}
          onClose={() => {
            setSelectedCampaignForSecret(null);
            setRevealedSecret(null);
          }}
          title="Partner Webhook Secret"
          subtitle={`Integration credential for: ${selectedCampaignForSecret.name}`}
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              Use this secret to sign outbound HTTP postbacks using HMAC-SHA256. Provide this secret only to verified
              partner technical representatives.
            </p>

            <div className="p-3.5 rounded-xl bg-obsidian-950 border border-obsidian-700 font-mono text-xs text-emerald-400 break-all select-all flex items-center justify-between gap-3">
              <span>{revealedSecret}</span>
              <button
                onClick={handleCopySecret}
                className="shrink-0 p-1.5 rounded-lg bg-obsidian-800 hover:bg-obsidian-700 text-slate-300 transition"
                title="Copy to Clipboard"
              >
                {copiedSecret ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="rounded-lg bg-emerald-950/40 border border-emerald-500/20 p-3 text-[11px] text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>Audit entry recorded with your administrator identity and timestamp.</span>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  setSelectedCampaignForSecret(null);
                  setRevealedSecret(null);
                }}
                className="rounded-xl border border-obsidian-600 bg-obsidian-800 px-4 py-2 text-xs font-semibold text-white hover:bg-obsidian-700 transition"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
