import React from 'react';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  accent?: 'emerald' | 'gold' | 'cyan' | 'rose' | 'slate';
  badge?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  accent = 'emerald',
  badge,
}) => {
  const accentGlow = {
    emerald: 'from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/20 text-emerald-400',
    gold: 'from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/20 text-amber-400',
    cyan: 'from-cyan-500/10 via-cyan-500/5 to-transparent border-cyan-500/20 text-cyan-400',
    rose: 'from-rose-500/10 via-rose-500/5 to-transparent border-rose-500/20 text-rose-400',
    slate: 'from-slate-500/10 via-slate-500/5 to-transparent border-slate-500/20 text-slate-400',
  }[accent];

  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-gradient-to-br bg-obsidian-900 p-5 shadow-lg transition-all hover:border-slate-600 hover:shadow-xl ${accentGlow}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{title}</p>
          <h3 className="mt-2 text-2xl font-bold tracking-tight text-white">{value}</h3>
          {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="rounded-lg bg-obsidian-800/80 p-2.5 text-current shadow-inner border border-obsidian-700">
            {icon}
          </div>
          {badge && (
            <span className="rounded bg-obsidian-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300 border border-obsidian-700">
              {badge}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
