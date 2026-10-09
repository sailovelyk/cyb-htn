'use client';
import { useQuery } from '@tanstack/react-query';
import { investigationsApi } from '@/lib/api';
import AppLayout from '@/components/AppLayout';
import Badge from '@/components/Badge';
import { formatDate } from '@/lib/utils';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export default function InvestigationsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['investigations', page, status],
    queryFn: () => investigationsApi.list({ page, page_size: 50, ...(status ? { status } : {}) }).then(r => r.data),
  });

  const items = data?.investigations ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  return (
    <AppLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Search size={24} className="text-purple-400" />
            Investigations
          </h1>
          <p className="text-gray-500 text-sm mt-1">{total} total investigations</p>
        </div>

        <div className="card">
          <select className="input w-48" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            {['open', 'in_progress', 'closed', 'escalated'].map(s => (
              <option key={s} value={s}>{s.replace('_', ' ').toUpperCase()}</option>
            ))}
          </select>
        </div>

        <div className="card p-0 overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center"><div className="spinner w-6 h-6 mx-auto mb-3" /><div className="text-gray-500 text-sm">Loading...</div></div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center">
              <Search size={32} className="text-gray-700 mx-auto mb-3" />
              <div className="text-gray-500 text-sm">No investigations yet. Click &quot;Investigate&quot; on an anomaly or alert.</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>User</th>
                  <th>Risk</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Assigned To</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((inv: Record<string, unknown>) => {
                  const summary = (inv.anomaly_summary as Record<string, unknown>) || {};
                  return (
                    <tr key={inv._id as string}>
                      <td className="font-mono text-xs text-gray-400 whitespace-nowrap">{formatDate(inv.created_at as string)}</td>
                      <td className="font-medium text-gray-200">{(summary.user as string) || '—'}</td>
                      <td><Badge value={(summary.risk_level as string) || 'UNKNOWN'} type="risk" /></td>
                      <td className="font-mono text-sm font-semibold text-blue-400">
                        {(summary.normalized_anomaly_score as number)?.toFixed(3) ?? '—'}
                      </td>
                      <td><Badge value={(inv.status as string) || 'open'} type="status" /></td>
                      <td className="text-gray-400 text-sm">{(inv.assigned_to as string) || '—'}</td>
                      <td>
                        <Link href={`/investigations/${inv._id}`} className="btn btn-primary py-1 px-2 text-xs">
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Page {page} of {pages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn btn-secondary"><ChevronLeft size={16} /></button>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages} className="btn btn-secondary"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
