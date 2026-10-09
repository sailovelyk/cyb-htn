'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { logsApi } from '@/lib/api';
import AppLayout from '@/components/AppLayout';
import Badge from '@/components/Badge';
import ScoreDisplay from '@/components/ScoreDisplay';
import { formatDate } from '@/lib/utils';
import { FileText, ChevronLeft, ChevronRight, Upload, Search } from 'lucide-react';
import Link from 'next/link';

export default function LogsPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    user: '', ip: '', hostname: '', event_type: '', risk_level: '',
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['logs', page, filters],
    queryFn: () => logsApi.list({ page, page_size: 50, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }).then(r => r.data),
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <FileText size={24} className="text-blue-400" />
              Log Explorer
            </h1>
            <p className="text-gray-500 text-sm mt-1">{total.toLocaleString()} total log records</p>
          </div>
          <Link href="/logs/upload" className="btn btn-primary">
            <Upload size={16} />
            Upload Logs
          </Link>
        </div>

        {/* Filters */}
        <div className="card">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { key: 'user', placeholder: 'Filter by user' },
              { key: 'ip', placeholder: 'Filter by IP' },
              { key: 'hostname', placeholder: 'Filter by hostname' },
              { key: 'event_type', placeholder: 'Event type' },
            ].map(({ key, placeholder }) => (
              <input
                key={key}
                type="text"
                className="input"
                placeholder={placeholder}
                value={filters[key as keyof typeof filters]}
                onChange={e => { setFilters(f => ({ ...f, [key]: e.target.value })); setPage(1); }}
              />
            ))}
            <select
              className="input"
              value={filters.risk_level}
              onChange={e => { setFilters(f => ({ ...f, risk_level: e.target.value })); setPage(1); }}
            >
              <option value="">All Risk Levels</option>
              {['NORMAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="card p-0 overflow-hidden">
          {error ? (
            <div className="p-8 text-center text-red-400">Failed to load logs. Is the backend running?</div>
          ) : isLoading ? (
            <div className="p-8 text-center">
              <div className="spinner w-6 h-6 mx-auto mb-3" />
              <div className="text-gray-500 text-sm">Loading logs...</div>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center">
              <Search size={32} className="text-gray-700 mx-auto mb-3" />
              <div className="text-gray-500 text-sm">No logs found. Upload a log file to begin.</div>
              <Link href="/logs/upload" className="btn btn-primary mt-4 inline-flex">
                <Upload size={14} /> Upload Logs
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>IP</th>
                    <th>Hostname</th>
                    <th>Event Type</th>
                    <th>Action</th>
                    <th>Status</th>
                    <th>Anomaly Score</th>
                    <th>Risk</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log: Record<string, unknown>) => (
                    <tr key={log._id as string}>
                      <td className="font-mono text-xs text-gray-400 whitespace-nowrap">
                        {formatDate(log.timestamp as string)}
                      </td>
                      <td className="font-medium text-gray-200">{(log.user as string) || '—'}</td>
                      <td className="font-mono text-xs text-gray-400">{(log.ip as string) || '—'}</td>
                      <td className="text-gray-400 text-xs">{(log.hostname as string) || '—'}</td>
                      <td><Badge value={(log.event_type as string) || '—'} /></td>
                      <td className="text-gray-300 text-sm">{(log.action as string) || '—'}</td>
                      <td><Badge value={(log.status as string) || '—'} type="status" /></td>
                      <td>
                        <ScoreDisplay score={log.anomaly_score as number} />
                      </td>
                      <td><Badge value={(log.risk_level as string) || 'UNKNOWN'} type="risk" /></td>
                      <td className="text-xs text-gray-600">{(log.source as string) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Page {page} of {pages}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn btn-secondary"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="btn btn-secondary"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
