'use client';
import { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { alertsApi } from '@/lib/api';
import AppLayout from '@/components/AppLayout';
import Badge from '@/components/Badge';
import ScoreDisplay from '@/components/ScoreDisplay';
import { formatDate } from '@/lib/utils';
import { ArrowLeft, Bell, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function AlertDetailPage() {
  return (
    <Suspense fallback={
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="spinner w-8 h-8" />
        </div>
      </AppLayout>
    }>
      <AlertDetailContent />
    </Suspense>
  );
}

function AlertDetailContent() {
  const { id } = useParams() as { id: string };
  const { data: alert, isLoading, error } = useQuery({
    queryKey: ['alert', id],
    queryFn: () => alertsApi.get(id).then(r => r.data),
  });

  if (isLoading) return <AppLayout><div className="flex items-center justify-center h-64"><div className="spinner w-8 h-8" /></div></AppLayout>;
  if (error || !alert) return <AppLayout><div className="p-8 text-center text-red-400">Alert not found</div></AppLayout>;

  return (
    <AppLayout>
      <div className="max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/alerts" className="btn btn-secondary"><ArrowLeft size={16} /></Link>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Bell size={20} className="text-red-400" />
            Alert Detail
          </h1>
          <Badge value={alert.severity} type="risk" />
          <Badge value={alert.status} type="status" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card space-y-3">
            <h2 className="font-semibold text-white border-b border-gray-800 pb-2">Alert Info</h2>
            {[
              { label: 'Alert ID', value: alert._id },
              { label: 'Created', value: formatDate(alert.created_at) },
              { label: 'Severity', value: <Badge value={alert.severity} type="risk" /> },
              { label: 'Status', value: <Badge value={alert.status} type="status" /> },
              { label: 'Assigned Analyst', value: alert.assigned_analyst || 'Unassigned' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center text-sm">
                <span className="text-gray-500">{label}</span>
                <span className="text-gray-200 font-mono text-xs">{value || '—'}</span>
              </div>
            ))}
          </div>

          <div className="card space-y-3">
            <h2 className="font-semibold text-white border-b border-gray-800 pb-2">Detection Info</h2>
            {[
              { label: 'User', value: alert.user },
              { label: 'IP', value: alert.ip },
              { label: 'Hostname', value: alert.hostname },
              { label: 'Event Type', value: alert.event_type },
              { label: 'Action', value: alert.action },
              { label: 'Timestamp', value: formatDate(alert.timestamp) },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center text-sm">
                <span className="text-gray-500">{label}</span>
                <span className="text-gray-200 font-mono text-xs">{value || '—'}</span>
              </div>
            ))}
            <div className="pt-2">
              <div className="text-xs text-gray-500 mb-1">Anomaly Score</div>
              <ScoreDisplay score={alert.anomaly_score} />
            </div>
          </div>
        </div>

        {/* Evidence */}
        {(alert.evidence as string[] || []).length > 0 && (
          <div className="card">
            <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
              <ShieldAlert size={18} className="text-amber-400" />
              Evidence
            </h2>
            <div className="space-y-2">
              {(alert.evidence as string[]).map((e: string, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-900/50">
                  <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{i + 1}</div>
                  <span className="text-gray-300 text-sm">{e}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {alert.investigation_id && (
          <Link href={`/investigations/${alert.investigation_id}`} className="btn btn-primary">
            Open Investigation →
          </Link>
        )}
      </div>
    </AppLayout>
  );
}
