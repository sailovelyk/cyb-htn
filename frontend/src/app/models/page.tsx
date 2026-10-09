'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { modelsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import AppLayout from '@/components/AppLayout';
import { formatDate } from '@/lib/utils';
import {
  Brain, Cpu, CheckCircle2, AlertCircle, RefreshCw,
  PlayCircle, Loader2, ArrowLeft, History, Sliders, Database,
} from 'lucide-react';
import Link from 'next/link';

const DEFAULT_FEATURES = [
  { name: 'login_hour', desc: 'Hour of event to identify anomalous timing patterns', type: 'Temporal' },
  { name: 'failed_login_count', desc: 'Volume of unsuccessful auth attempts', type: 'Authentication' },
  { name: 'successful_login_count', desc: 'Volume of successful auth sessions', type: 'Authentication' },
  { name: 'login_failure_ratio', desc: 'Ratio of failed to total logins (brute-force detection)', type: 'Authentication' },
  { name: 'unique_ips', desc: 'Number of distinct IP addresses used by an identity', type: 'Network' },
  { name: 'connection_count', desc: 'Total network connection attempts within session window', type: 'Network' },
  { name: 'unique_destinations', desc: 'Number of unique host/port targets visited', type: 'Network' },
  { name: 'bytes_sent', desc: 'Total egress network payload size in bytes', type: 'Volume' },
  { name: 'bytes_received', desc: 'Total ingress network payload size in bytes', type: 'Volume' },
  { name: 'privilege_changes', desc: 'Elevation of privilege or sudo/admin events', type: 'Security' },
  { name: 'files_accessed', desc: 'Volume of file touch/read/write actions', type: 'System' },
  { name: 'process_count', desc: 'Number of unique child processes spawned', type: 'System' },
  { name: 'event_type_encoded', desc: 'Categorical encoding of normalized event type', type: 'Categorical' },
  { name: 'action_encoded', desc: 'Numeric mapping of security action undertaken', type: 'Categorical' },
  { name: 'status_encoded', desc: 'Success / Failure status representation', type: 'Categorical' },
  { name: 'new_ip', desc: 'Binary flag if source IP was never observed for user', type: 'Behavioral' },
  { name: 'new_device', desc: 'Binary flag if device fingerprint is unobserved', type: 'Behavioral' },
];

export default function ModelsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [contamination, setContamination] = useState(0.1);
  const [isTraining, setIsTraining] = useState(false);
  const [trainMessage, setTrainMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 1. Fetch current active model status
  const {
    data: modelStatus,
    isLoading: isStatusLoading,
    isError: isStatusError,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ['model-status'],
    queryFn: () => modelsApi.status().then((r) => r.data),
  });

  // 2. Fetch model training history
  const {
    data: modelsData,
    isLoading: isHistoryLoading,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ['models-list'],
    queryFn: () => modelsApi.list().then((r) => r.data),
  });

  const handleTrain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user?.role !== 'ADMIN') return;

    setIsTraining(true);
    setTrainMessage(null);
    try {
      const res = await modelsApi.train(contamination);
      setTrainMessage({
        type: 'success',
        text: `Model successfully trained on ${res.data.training_records?.toLocaleString() ?? 'all'} records! Isolation Forest is now active.`,
      });
      queryClient.invalidateQueries({ queryKey: ['model-status'] });
      queryClient.invalidateQueries({ queryKey: ['models-list'] });
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    } catch (err: unknown) {
      const errorDetail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Training failed. Please ensure you have ingested at least 10 log records.';
      setTrainMessage({ type: 'error', text: errorDetail });
    } finally {
      setIsTraining(false);
    }
  };

  const isActive = modelStatus?.status === 'active';
  const historyList = modelsData?.models ?? [];

  return (
    <AppLayout>
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="w-8 h-8 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                title="Back to Dashboard"
              >
                <ArrowLeft size={16} />
              </Link>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                <Brain className="text-cyan-400" size={24} />
                ML Detection Engine Management
              </h1>
            </div>
            <p className="text-gray-400 text-sm mt-1 ml-11">
              Unsupervised multivariate behavioral anomaly detection powered by Scikit-Learn Isolation Forest
            </p>
          </div>

          <div className="flex items-center gap-2 ml-11 sm:ml-0">
            <button
              onClick={() => {
                refetchStatus();
                refetchHistory();
              }}
              className="btn btn-secondary text-xs px-3 py-2 flex items-center gap-2 border border-gray-700"
              title="Refresh model status"
            >
              <RefreshCw size={13} className="text-gray-400" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Status Messages */}
        {trainMessage && (
          <div
            className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 border ${
              trainMessage.type === 'success'
                ? 'bg-green-950/40 text-green-300 border-green-500/30'
                : 'bg-red-950/40 text-red-300 border-red-500/30'
            }`}
          >
            {trainMessage.type === 'success' ? (
              <CheckCircle2 size={16} className="text-green-400 shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-red-400 shrink-0" />
            )}
            <span className="font-medium">{trainMessage.text}</span>
          </div>
        )}

        {/* Current Model Status Banner */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Model Overview Card */}
          <div className="card lg:col-span-2 p-5 bg-gray-900/50 border border-gray-800">
            <div className="flex items-start justify-between border-b border-gray-800 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <Cpu size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white">Active Model Baseline</h2>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        isActive
                          ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                          : modelStatus?.status === 'not_trained'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : 'bg-red-500/10 text-red-400 border border-red-500/30'
                      }`}
                    >
                      {isActive ? 'Active Engine' : modelStatus?.status === 'not_trained' ? 'Not Trained' : 'Error'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {isActive
                      ? 'Loaded in-memory and actively scoring real-time log ingestion batches'
                      : 'No trained weights detected on disk. Upload logs and train the model below.'}
                  </p>
                </div>
              </div>
            </div>

            {isStatusLoading ? (
              <div className="py-12 flex items-center justify-center">
                <Loader2 size={24} className="animate-spin text-cyan-500" />
              </div>
            ) : isStatusError ? (
              <div className="py-12 text-center text-red-400 text-xs">
                Unable to retrieve model status from the backend.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-xs">
                <div className="p-3 rounded-lg bg-gray-950/60 border border-gray-800/80">
                  <span className="text-gray-500 block text-[11px]">Algorithm</span>
                  <span className="font-semibold text-white font-mono text-sm mt-0.5 block">
                    {modelStatus?.algorithm || 'Isolation Forest'}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-gray-950/60 border border-gray-800/80">
                  <span className="text-gray-500 block text-[11px]">Model Version</span>
                  <span className="font-semibold text-white font-mono text-sm mt-0.5 block">
                    v{modelStatus?.version || '1.0'}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-gray-950/60 border border-gray-800/80">
                  <span className="text-gray-500 block text-[11px]">Training Records</span>
                  <span className="font-semibold text-cyan-400 font-mono text-sm mt-0.5 block">
                    {modelStatus?.training_record_count?.toLocaleString() ?? 0} events
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-gray-950/60 border border-gray-800/80">
                  <span className="text-gray-500 block text-[11px]">Contamination (Expected Anomalies)</span>
                  <span className="font-semibold text-white font-mono text-sm mt-0.5 block">
                    {modelStatus?.contamination ? `${(modelStatus.contamination * 100).toFixed(0)}%` : '10%'}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-gray-950/60 border border-gray-800/80">
                  <span className="text-gray-500 block text-[11px]">Ensemble Size</span>
                  <span className="font-semibold text-white font-mono text-sm mt-0.5 block">
                    {modelStatus?.n_estimators ?? 200} Decision Trees
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-gray-950/60 border border-gray-800/80">
                  <span className="text-gray-500 block text-[11px]">Last Trained At</span>
                  <span className="font-semibold text-gray-300 font-mono text-xs mt-1 block truncate">
                    {modelStatus?.trained_at ? formatDate(modelStatus.trained_at) : 'Not yet trained'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Model Training Controls Card */}
          <div className="card p-5 bg-gray-900/50 border border-gray-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 pb-3 mb-3 border-b border-gray-800">
                <Sliders size={18} className="text-cyan-400" />
                <h2 className="text-base font-bold text-white">Retrain Parameters</h2>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed mb-4">
                Trains a new Isolation Forest model on all ingested system logs stored in MongoDB.
              </p>

              <form onSubmit={handleTrain} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <label className="text-gray-300 font-medium">Contamination Rate:</label>
                    <span className="font-mono font-bold text-cyan-400">{(contamination * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.01"
                    max="0.50"
                    step="0.01"
                    value={contamination}
                    onChange={(e) => setContamination(parseFloat(e.target.value))}
                    disabled={user?.role !== 'ADMIN' || isTraining}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                    <span>1% (Sparse)</span>
                    <span>10% (Default)</span>
                    <span>50% (Dense)</span>
                  </div>
                </div>

                {user?.role === 'ADMIN' ? (
                  <button
                    type="submit"
                    disabled={isTraining}
                    className="btn btn-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 border-none shadow-xs disabled:opacity-50"
                  >
                    {isTraining ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        <span>Training Isolation Forest...</span>
                      </>
                    ) : (
                      <>
                        <PlayCircle size={15} />
                        <span>Fit & Train Model</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="p-3 rounded-lg bg-gray-950/60 border border-gray-800 text-[11px] text-gray-400">
                    Administrator authorization required to retrain the ML baseline.
                  </div>
                )}
              </form>
            </div>

            <div className="pt-4 border-t border-gray-800/80 text-[11px] text-gray-500 flex items-center gap-2">
              <Database size={13} className="text-gray-500 shrink-0" />
              <span>Requires at least 10 log records to fit distributions.</span>
            </div>
          </div>
        </div>

        {/* Feature Engineering Details */}
        <div className="card p-5 bg-gray-900/50 border border-gray-800">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-800">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Brain size={18} className="text-purple-400" />
                Feature Extraction Matrix (17 Dimensions)
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Each normalized log event is transformed into an engineered feature vector for tree partitioning
              </p>
            </div>
            <span className="text-[11px] font-mono text-gray-400 bg-gray-800/80 px-2.5 py-1 rounded">
              StandardScaler Normalized
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {DEFAULT_FEATURES.map((feat) => (
              <div
                key={feat.name}
                className="p-2.5 rounded-lg bg-gray-950/60 border border-gray-800/70 hover:border-gray-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-white">{feat.name}</span>
                  <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                    {feat.type}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Model Training History Table */}
        <div className="card p-5 bg-gray-900/50 border border-gray-800">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-800">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <History size={18} className="text-blue-400" />
                Training Run History
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">Audit trail of previously trained model versions</p>
            </div>
            <span className="text-xs text-gray-400">{historyList.length} recorded runs</span>
          </div>

          {isHistoryLoading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin text-blue-500" />
            </div>
          ) : historyList.length === 0 ? (
            <div className="py-8 text-center text-gray-500 text-xs">
              No historical model runs logged yet. Once a model is trained, its audit metadata will appear here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Algorithm</th>
                    <th>Records Used</th>
                    <th>Contamination</th>
                    <th>Estimators</th>
                    <th>Trained By</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {historyList.map(
                    (m: {
                      _id: string;
                      created_at?: string;
                      algorithm?: string;
                      training_record_count?: number;
                      contamination?: number;
                      n_estimators?: number;
                      trained_by?: string;
                      status?: string;
                    }) => (
                      <tr key={m._id}>
                        <td className="font-mono text-xs text-gray-300">{formatDate(m.created_at)}</td>
                        <td className="font-semibold text-white text-xs">{m.algorithm || 'IsolationForest'}</td>
                        <td className="font-mono text-xs text-cyan-400">
                          {m.training_record_count?.toLocaleString() ?? '—'}
                        </td>
                        <td className="font-mono text-xs text-gray-300">
                          {m.contamination ? `${(m.contamination * 100).toFixed(0)}%` : '10%'}
                        </td>
                        <td className="font-mono text-xs text-gray-300">{m.n_estimators ?? 200}</td>
                        <td className="text-xs text-gray-400 font-mono">{m.trained_by || 'system'}</td>
                        <td>
                          <span className="badge bg-green-500/10 text-green-400 border-green-500/30">
                            {m.status || 'Active'}
                          </span>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
