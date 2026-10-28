import React from 'react';

export interface BadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ status, size = 'md' }) => {
  const normalized = status.toUpperCase();

  let styles = 'bg-slate-800 text-slate-300 border-slate-700';

  switch (normalized) {
    case 'ACTIVE':
    case 'PUBLISHED':
    case 'VERIFIED':
      styles = 'bg-emerald-950/60 text-emerald-400 border-emerald-500/30';
      break;
    case 'DRAFT':
    case 'PENDING':
    case 'PENDING_REVIEW':
    case 'IN_PROGRESS':
      styles = 'bg-amber-950/60 text-amber-400 border-amber-500/30';
      break;
    case 'PAUSED':
    case 'SUSPENDED':
      styles = 'bg-orange-950/60 text-orange-400 border-orange-500/30';
      break;
    case 'FLAGGED':
      styles = 'bg-rose-950/70 text-rose-300 border-rose-500/40 animate-pulse';
      break;
    case 'REJECTED':
    case 'ARCHIVED':
    case 'EXPIRED':
      styles = 'bg-red-950/60 text-red-400 border-red-500/30';
      break;
    case 'COMPLETED':
      styles = 'bg-cyan-950/60 text-cyan-400 border-cyan-500/30';
      break;
  }

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${styles} ${sizeClasses}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {normalized}
    </span>
  );
};
