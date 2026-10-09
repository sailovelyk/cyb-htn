'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { alertsApi, investigationsApi } from '@/lib/api';
import AppLayout from '@/components/AppLayout';
import Badge from '@/components/Badge';
import ScoreDisplay from '@/components/ScoreDisplay';
import { formatDate } from '@/lib/utils';
import { Bell, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const STATUSES = ['new', 'investigating', 'resolved', 'false_positive'];

export default function AlertsPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: '', severity: '' });
  const [updating, setUpdating] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data, isLoading, error } = useQuery({
    queryKey: ['alerts', page, filters],
    queryFn: () => alertsApi.list({ page, page_size: 50, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }).then(r => r.data),
    refetchInterval: 30000,
  });

  const alerts = data?.alerts ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  const updateStatus = async (alertId: string, status: string) => {
    setUpdating(alertId);
    try {
      await alertsApi.update(alertId, { status });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    } catch (e) { console.error(e); }
    finally { setUpdating(null); }
  };

  const openInvestigation = async (alert: Record<string, unknown>) => {
    if (alert.investigation_id) {
      router.push(`/investigations/${alert.investigation_id}`);
      return;
    }
    try {
      const res = await investigationsApi.create({
        alert_id: alert._id as string,
        anomaly_id: alert.anomaly_id as string,
      });
      router.push(`/investigations/${res.data._id}`);
    } catch (e) { console.error(e); }
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Bell size={24} className="text-red-400" />
            Alert Management
          </h1>
          <p className="text-gray-500 text-sm mt-1">{total} total alerts</p>
        </div>

        <div className="card">
          <div className="grid grid-cols-2 gap-3">
            <select className="input" value={filters.status}
              onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1); }}>
              <option value="">All Statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ').toUpperCase()}</option>)}
            </select>
            <select className="input" value={filters.severity}
              onChange={e => { setFilters(f => ({ ...f, severity: e.target.value })); setPage(1); }}>
              <option value="">All Severities</option>
              {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="card p-0 overflow-hidden">
          {error ? (
            <div className="p-8 text-center text-red-400">Failed to load alerts</div>
          ) : isLoading ? (
            <div className="p-8 text-center"><div className="spinner w-6 h-6 mx-auto mb-3" /><div className="text-gray-500 text-sm">Loading...</div></div>
          ) : alerts.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle size={32} className="text-green-700 mx-auto mb-3" />
              <div className="text-gray-500 text-sm">No alerts matching filters.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Severity</th>
                    <th>User</th>
                    <th>IP</th>
                    <th>Event</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert: Record<string, unknown>) => (
                    <tr key={alert._id as string}>
                      <td className="font-mono text-xs text-gray-400 whitespace-nowrap">{formatDate(alert.created_at as string)}</td>
                      <td><Badge value={(alert.severity as string) || '—'} type="risk" /></td>
                      <td className="font-medium text-gray-200">{(alert.user as string) || '—'}</td>
                      <td className="font-mono text-xs text-gray-400">{(alert.ip as string) || '—'}</td>
                      <td className="text-gray-300 text-sm">{(alert.action as string) || (alert.event_type as string) || '—'}</td>
                      <td><ScoreDisplay score={alert.anomaly_score as number} showBar={false} /></td>
                      <td>
                        <select
                          className="input py-1 text-xs w-32"
                          value={(alert.status as string) || 'new'}
                          disabled={updating === alert._id as string}
                          onChange={e => updateStatus(alert._id as string, e.target.value)}
                        >
                          {STATUSES.map(s => (
                            <option key={s} value={s}>{s.replace('_', ' ').toUpperCase()}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <Link href={`/alerts/${alert._id}`} className="btn btn-secondary py-1 px-2 text-xs">
                            View
                          </Link>
                          <button onClick={() => openInvestigation(alert)} className="btn btn-primary py-1 px-2 text-xs">
                            Investigate
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
