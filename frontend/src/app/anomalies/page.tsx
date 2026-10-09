'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { anomaliesApi, investigationsApi } from '@/lib/api';
import AppLayout from '@/components/AppLayout';
import Badge from '@/components/Badge';
import ScoreDisplay from '@/components/ScoreDisplay';
import { formatDate } from '@/lib/utils';
import { AlertTriangle, ChevronLeft, ChevronRight, Search as SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function AnomaliesPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ risk_level: '', status: '', user: '' });
  const [creating, setCreating] = useState<string | null>(null);
  const router = useRouter();

  const { data, isLoading, error } = useQuery({
    queryKey: ['anomalies', page, filters],
    queryFn: () => anomaliesApi.list({ page, page_size: 50, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }).then(r => r.data),
  });

  const anomalies = data?.anomalies ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  const handleInvestigate = async (anomaly: Record<string, unknown>) => {
    setCreating(anomaly._id as string);
    try {
      const res = await investigationsApi.create({
        alert_id: '',
        anomaly_id: anomaly._id as string,
        notes: 'Created from anomaly list',
      });
      router.push(`/investigations/${res.data._id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(null);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <AlertTriangle size={24} className="text-amber-400" />
            Anomaly Detection Results
          </h1>
          <p className="text-gray-500 text-sm mt-1">{total.toLocaleString()} anomalies detected by the ML engine</p>
        </div>

        {/* Filters */}
        <div className="card">
          <div className="grid grid-cols-3 gap-3">
            <select className="input" value={filters.risk_level}
              onChange={e => { setFilters(f => ({ ...f, risk_level: e.target.value })); setPage(1); }}>
              <option value="">All Risk Levels</option>
              {['NORMAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select className="input" value={filters.status}
              onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1); }}>
              <option value="">All Status</option>
              <option value="open">Open</option>
              <option value="investigating">Investigating</option>
            </select>
            <input type="text" className="input" placeholder="Filter by user"
              value={filters.user}
              onChange={e => { setFilters(f => ({ ...f, user: e.target.value })); setPage(1); }} />
          </div>
        </div>

        <div className="card p-0 overflow-hidden">
          {error ? (
            <div className="p-8 text-center text-red-400">Failed to load anomalies</div>
          ) : isLoading ? (
            <div className="p-8 text-center">
              <div className="spinner w-6 h-6 mx-auto mb-3" />
              <div className="text-gray-500 text-sm">Loading...</div>
            </div>
          ) : anomalies.length === 0 ? (
            <div className="p-12 text-center">
              <SearchIcon size={32} className="text-gray-700 mx-auto mb-3" />
              <div className="text-gray-500 text-sm">No anomalies detected yet.</div>
              <div className="text-gray-600 text-xs mt-1">Upload logs and train the model to start detecting.</div>
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
                    <th>Anomaly Score</th>
                    <th>Risk</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalies.map((a: Record<string, unknown>) => (
                    <tr key={a._id as string}>
                      <td className="font-mono text-xs text-gray-400 whitespace-nowrap">{formatDate(a.timestamp as string)}</td>
                      <td className="font-medium text-gray-200">{(a.user as string) || '—'}</td>
                      <td className="font-mono text-xs text-gray-400">{(a.ip as string) || '—'}</td>
                      <td className="text-gray-400 text-xs">{(a.hostname as string) || '—'}</td>
                      <td><Badge value={(a.event_type as string) || '—'} /></td>
                      <td className="text-gray-300 text-sm">{(a.action as string) || '—'}</td>
                      <td><ScoreDisplay score={a.normalized_anomaly_score as number} /></td>
                      <td><Badge value={(a.risk_level as string) || 'UNKNOWN'} type="risk" /></td>
                      <td><Badge value={(a.status as string) || 'open'} type="status" /></td>
                      <td>
                        <div className="flex gap-2">
                          <Link href={`/anomalies/${a._id}`}
                            className="btn btn-secondary py-1 px-2 text-xs">
                            Details
                          </Link>
                          <button
                            onClick={() => handleInvestigate(a)}
                            disabled={creating === a._id as string}
                            className="btn btn-primary py-1 px-2 text-xs"
                          >
                            {creating === a._id ? 'Opening...' : 'Investigate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Page {page} of {pages} ({total} anomalies)</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn btn-secondary">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages} className="btn btn-secondary">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
