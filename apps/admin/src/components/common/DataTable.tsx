import React from 'react';
import { ChevronLeft, ChevronRight, Inbox, Loader2 } from 'lucide-react';
import { Pagination } from '../../types';

export interface Column<T> {
  header: string;
  accessor?: keyof T | ((row: T) => React.ReactNode);
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  pagination?: Pagination;
  isLoading?: boolean;
  emptyMessage?: string;
  onPageChange?: (page: number) => void;
  keyExtractor: (item: T) => string;
}

export function DataTable<T>({
  columns,
  data,
  pagination,
  isLoading = false,
  emptyMessage = 'No records found',
  onPageChange,
  keyExtractor,
}: DataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-xl border border-obsidian-700 bg-obsidian-900 shadow-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="border-b border-obsidian-700 bg-obsidian-800/80 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <tr>
              {columns.map((col, idx) => (
                <th key={idx} scope="col" className={`px-5 py-3.5 ${col.className || ''}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-obsidian-800">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                    <span className="text-xs">Loading operational records...</span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Inbox className="w-8 h-8 text-slate-600" />
                    <span className="text-sm font-medium text-slate-300">{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={keyExtractor(row)}
                  className="transition-colors hover:bg-obsidian-800/50"
                >
                  {columns.map((col, colIdx) => (
                    <td key={colIdx} className={`px-5 py-4 ${col.className || ''}`}>
                      {typeof col.accessor === 'function'
                        ? col.accessor(row)
                        : col.accessor
                        ? (row[col.accessor] as React.ReactNode)
                        : null}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-obsidian-700 bg-obsidian-800/40 px-5 py-3 text-xs text-slate-400">
          <div>
            Showing page <span className="font-semibold text-slate-200">{pagination.page}</span> of{' '}
            <span className="font-semibold text-slate-200">{pagination.totalPages}</span> (
            <span className="font-semibold text-slate-200">{pagination.total}</span> total entries)
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange?.(pagination.page - 1)}
              disabled={pagination.page <= 1 || isLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-obsidian-600 bg-obsidian-800 px-2.5 py-1 text-slate-300 hover:bg-obsidian-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>
            <button
              onClick={() => onPageChange?.(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || isLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-obsidian-600 bg-obsidian-800 px-2.5 py-1 text-slate-300 hover:bg-obsidian-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
