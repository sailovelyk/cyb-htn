'use client';
import { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { anomaliesApi } from '@/lib/api';
import AppLayout from '@/components/AppLayout';
import Badge from '@/components/Badge';
import ScoreDisplay from '@/components/ScoreDisplay';
import { formatDate } from '@/lib/utils';
import { AlertTriangle, ArrowLeft, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function AnomalyDetailPage() {
  return (
    <Suspense fallback={
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="spinner w-8 h-8" />
        </div>
      </AppLayout>
    }>
      <AnomalyDetailContent />
    </Suspense>
  );
}

function AnomalyDetailContent() {
  const { id } = useParams() as { id: string };

  const { data: anomaly, isLoading, error } = useQuery({
    queryKey: ['anomaly', id],
    queryFn: () => anomaliesApi.get(id).then(r => r.data),
  });

  if (isLoading) return (
    <AppLayout>
      <div className="flex items-center justify-center h-64">
        <div className="spinner w-8 h-8" />
      </div>
    </AppLayout>
  );

  if (error || !anomaly) return (
    <AppLayout>
      <div className="p-8 text-center text-red-400">Anomaly not found</div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="max-w-4xl space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/anomalies" className="btn btn-secondary"><ArrowLeft size={16} /></Link>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <AlertTriangle size={20} className="text-amber-400" />
            Anomaly Detail
          </h1>
          <Badge value={anomaly.risk_level} type="risk" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Event Details */}
          <div className="card space-y-4">
            <h2 className="font-semibold text-white border-b border-gray-800 pb-2">Event Details</h2>
            {[
              { label: 'Timestamp', value: formatDate(anomaly.timestamp) },
              { label: 'User', value: anomaly.user },
              { label: 'IP Address', value: anomaly.ip },
              { label: 'Hostname', value: anomaly.hostname },
              { label: 'Event Type', value: anomaly.event_type },
              { label: 'Action', value: anomaly.action },
              { label: 'Status', value: anomaly.status_field },
              { label: 'Source', value: anomaly.source },
              { label: 'Batch ID', value: anomaly.batch_id },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center text-sm">
                <span className="text-gray-500">{label}</span>
                <span className="text-gray-200 font-medium font-mono text-xs">{value || '—'}</span>
              </div>
            ))}
          </div>

          {/* ML Details */}
          <div className="card space-y-4">
            <h2 className="font-semibold text-white border-b border-gray-800 pb-2">ML Detection Details</h2>
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-gray-900">
                <div className="text-xs text-gray-500 mb-1">Raw Model Signal</div>
                <div className="font-mono text-lg text-gray-300">{anomaly.raw_model_signal?.toFixed(6) ?? 'N/A'}</div>
                <div className="text-xs text-gray-600 mt-1">Direct Isolation Forest output (negative = anomalous)</div>
              </div>
              <div className="p-3 rounded-lg bg-gray-900">
                <div className="text-xs text-gray-500 mb-1">Normalized Anomaly Score</div>
                <ScoreDisplay score={anomaly.normalized_anomaly_score} showBar />
                <div className="text-xs text-gray-600 mt-1">Application-level score [0,1] — 1.0 = most anomalous</div>
              </div>
              <div className="p-3 rounded-lg bg-gray-900">
                <div className="text-xs text-gray-500 mb-1">Final Risk Score</div>
                <ScoreDisplay score={anomaly.final_risk_score} showBar />
                <div className="text-xs text-gray-600 mt-1">Weighted: ML + auth + privilege + network signals</div>
              </div>
              <div className="p-3 rounded-lg bg-gray-900">
                <div className="text-xs text-gray-500 mb-1">Risk Classification</div>
                <Badge value={anomaly.risk_level} type="risk" />
              </div>

              {/* Risk signals breakdown */}
              {anomaly.risk_signals && (
                <div className="p-3 rounded-lg bg-gray-900">
                  <div className="text-xs text-gray-500 mb-2">Risk Signal Breakdown</div>
                  <div className="space-y-1">
                    {Object.entries(anomaly.risk_signals as Record<string, number | null>).map(([key, val]) => (
                      <div key={key} className="flex justify-between text-xs">
                        <span className="text-gray-500">{key.replace(/_/g, ' ')}</span>
                        <span className="text-gray-300 font-mono">{val !== null ? (val as number).toFixed(4) : 'not assessed'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Evidence */}
        <div className="card">
          <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
            <ShieldAlert size={18} className="text-amber-400" />
            Evidence — Potentially suspicious behavior detected
          </h2>
          <div className="space-y-2">
            {(anomaly.evidence as string[] || []).map((e: string, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-900/50">
                <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <span className="text-gray-300 text-sm">{e}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
