'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardApi, modelsApi, healthApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import AppLayout from '@/components/AppLayout';
import { formatDate } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import {
  FileText, AlertTriangle, Bell, Search, Activity,
  Shield, Zap, Users, Globe, RefreshCw, UploadCloud,
  CheckCircle2, AlertCircle, Cpu, Database,
  Server, Clock, ArrowUpRight, PlayCircle, Loader2,
} from 'lucide-react';
import Link from 'next/link';

const RISK_PALETTE: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#f59e0b',
  LOW: '#84cc16',
  NORMAL: '#22c55e',
  UNKNOWN: '#6b7280',
};

const RISK_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NORMAL'];

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  subtext,
  href,
  isLoading,
  isError,
}: {
  label: string;
  value: number | string | undefined;
  icon: React.ElementType;
  color: string;
  subtext?: string;
  href?: string;
  isLoading?: boolean;
  isError?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="card h-full p-4 flex flex-col justify-between animate-pulse bg-gray-900/60 border border-gray-800/80">
        <div className="flex items-center justify-between">
          <div className="h-3 w-16 bg-gray-800 rounded" />
          <div className="w-9 h-9 rounded-xl bg-gray-800/70" />
        </div>
        <div className="h-7 w-20 bg-gray-800 rounded mt-3" />
        <div className="h-2 w-28 bg-gray-800/60 rounded mt-2" />
      </div>
    );
  }

  const content = (
    <div className="card h-full p-4 flex flex-col justify-between hover:border-gray-700/80 transition-all duration-200 group relative overflow-hidden bg-gray-900/40 backdrop-blur-xs border border-gray-800">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
          <div className="mt-2 flex items-baseline gap-2">
            {isError ? (
              <span className="text-sm font-medium text-red-400 flex items-center gap-1">
                <AlertCircle size={14} /> Unavailable
              </span>
            ) : (
              <span className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
                {value ?? '0'}
              </span>
            )}
          </div>
          {subtext && <p className="text-[11px] text-gray-500 mt-1 leading-snug">{subtext}</p>}
        </div>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
          style={{ background: `${color}1a` }}
          aria-hidden="true"
        >
          <Icon size={20} style={{ color }} />
        </div>
      </div>
      {href && (
        <div className="mt-3 pt-2 border-t border-gray-800/60 flex items-center justify-between text-[11px] text-gray-400 group-hover:text-blue-400 transition-colors">
          <span>View records</span>
          <ArrowUpRight size={12} className="opacity-70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </div>
      )}
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full focus:outline-hidden focus:ring-2 focus:ring-blue-500 rounded-xl">
      {content}
    </Link>
  ) : (
    content
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [trainMessage, setTrainMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const refreshInterval = autoRefresh ? 30000 : false;

  // 1. Dashboard Stats
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    dataUpdatedAt,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardApi.stats().then((r) => r.data),
    refetchInterval: refreshInterval,
  });


  // 2. Anomaly Timeline (48h)
  const {
    data: timelineData,
    isLoading: timelineLoading,
    isError: timelineError,
    refetch: refetchTimeline,
  } = useQuery({
    queryKey: ['dashboard-timeline'],
    queryFn: () => dashboardApi.timeline(48).then((r) => r.data),
    refetchInterval: autoRefresh ? 60000 : false,
  });

  // 3. Risk Distribution
  const {
    data: riskDist,
    isLoading: riskLoading,
    isError: riskError,
    refetch: refetchRisk,
  } = useQuery({
    queryKey: ['risk-distribution'],
    queryFn: () => dashboardApi.riskDistribution().then((r) => r.data),
    refetchInterval: refreshInterval,
  });

  // 4. Recent Threat Activity (Top 10)
  const {
    data: threatsData,
    isLoading: threatsLoading,
    isError: threatsError,
    refetch: refetchThreats,
  } = useQuery({
    queryKey: ['recent-threats'],
    queryFn: () => dashboardApi.recentThreats(10).then((r) => r.data),
    refetchInterval: refreshInterval,
  });

  // 5. Event Types
  const {
    data: eventTypes,
    refetch: refetchEvents,
  } = useQuery({
    queryKey: ['event-types'],
    queryFn: () => dashboardApi.eventTypes().then((r) => r.data),
    refetchInterval: refreshInterval,
  });

  // 6. ML Model Status
  const {
    data: modelStatus,
    refetch: refetchModel,
  } = useQuery({
    queryKey: ['model-status'],
    queryFn: () => modelsApi.status().then((r) => r.data),
    refetchInterval: refreshInterval,
  });

  // 7. System Health Status
  const {
    data: health,
    isError: healthError,
    refetch: refetchHealth,
  } = useQuery({
    queryKey: ['system-health'],
    queryFn: () => healthApi.check().then((r) => r.data),
    refetchInterval: refreshInterval,
  });

  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    try {
      await Promise.all([
        refetchStats(),
        refetchTimeline(),
        refetchRisk(),
        refetchThreats(),
        refetchEvents(),
        refetchModel(),
        refetchHealth(),
      ]);
    } finally {
      setIsManualRefreshing(false);
    }
  };


  const handleTrainModel = async () => {
    if (user?.role !== 'ADMIN') return;
    setIsTraining(true);
    setTrainMessage(null);
    try {
      const res = await modelsApi.train();
      setTrainMessage({
        type: 'success',
        text: `Training completed successfully on ${res.data.training_records ?? 'all'} records.`,
      });
      queryClient.invalidateQueries({ queryKey: ['model-status'] });
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Model training failed. Please ensure at least 10 log records are present.';
      setTrainMessage({ type: 'error', text: errorMsg });
    } finally {
      setIsTraining(false);
    }
  };

  const timeline = timelineData?.timeline ?? [];
  const rawRisks = riskDist?.distribution ?? [];
  const threats = threatsData?.threats ?? [];
  const evTypes = eventTypes?.distribution ?? [];

  // Normalize risks to include standard 5 levels
  const riskMap = new Map<string, number>();
  rawRisks.forEach((r: { risk_level: string; count: number }) => {
    if (r.risk_level) riskMap.set(r.risk_level.toUpperCase(), r.count);
  });
  const totalRiskCount = Array.from(riskMap.values()).reduce((a, b) => a + b, 0);

  const formattedRisks = RISK_ORDER.map((level) => ({
    risk_level: level,
    count: riskMap.get(level) || 0,
    pct: totalRiskCount > 0 ? (((riskMap.get(level) || 0) / totalRiskCount) * 100).toFixed(1) : '0.0',
  }));

  // Determine system health indicators
  const isBackendOk = !healthError && health?.status !== undefined;
  const isDbOk = !healthError && health?.database === 'connected';
  const isModelActive = modelStatus?.status === 'active';

  return (
    <AppLayout>
      <div className="space-y-6 pb-12">
        {/* ========================================================
            HEADER
           ======================================================== */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800/80 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
                Security Operations Dashboard
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Shield size={12} />
                SOC Live
              </span>
            </div>
            <p className="text-gray-400 text-sm mt-1">
              AI-powered anomaly detection • Real-time threat monitoring
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Last Refreshed & Auto-refresh status */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900/60 border border-gray-800 text-xs text-gray-400">
              <Clock size={13} className="text-gray-500" />
              <span>Updated: {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : 'Live'}</span>
              <span className="text-gray-700">•</span>

              <button
                type="button"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
                title={autoRefresh ? 'Click to pause auto-refresh' : 'Click to enable 30s auto-refresh'}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-gray-600'
                  }`}
                />
                <span>{autoRefresh ? 'Auto 30s' : 'Paused'}</span>
              </button>
            </div>

            {/* Manual Refresh Button */}
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isManualRefreshing}
              className="btn btn-secondary text-xs px-3 py-2 flex items-center gap-2 border border-gray-700 hover:border-gray-600"
              title="Refresh all dashboard data"
            >
              <RefreshCw
                size={14}
                className={isManualRefreshing ? 'animate-spin text-blue-400' : 'text-gray-400'}
              />
              <span>Refresh</span>
            </button>

            {/* Primary Upload Logs Action */}
            <Link
              href="/logs/upload"
              className="btn btn-primary text-xs px-4 py-2 flex items-center gap-2 font-semibold shadow-xs hover:shadow-blue-500/20"
            >
              <UploadCloud size={15} />
              <span>Upload Logs</span>
            </Link>
          </div>
        </div>

        {/* ========================================================
            SYSTEM HEALTH STATUS BAR
           ======================================================== */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          {/* Frontend Status */}
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-900/50 border border-gray-800/80 text-xs">
            <Activity size={14} className="text-green-400 shrink-0" />
            <div className="truncate">
              <span className="text-gray-500 block text-[10px] uppercase font-bold">Frontend</span>
              <span className="text-green-400 font-medium">Operational</span>
            </div>
          </div>

          {/* Backend API Status */}
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-900/50 border border-gray-800/80 text-xs">
            <Server
              size={14}
              className={`shrink-0 ${isBackendOk ? 'text-green-400' : 'text-red-400'}`}
            />
            <div className="truncate">
              <span className="text-gray-500 block text-[10px] uppercase font-bold">Backend API</span>
              <span className={isBackendOk ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                {isBackendOk ? 'Connected' : 'Unavailable'}
              </span>
            </div>
          </div>

          {/* Database Connectivity */}
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-900/50 border border-gray-800/80 text-xs">
            <Database
              size={14}
              className={`shrink-0 ${isDbOk ? 'text-green-400' : 'text-red-400'}`}
            />
            <div className="truncate">
              <span className="text-gray-500 block text-[10px] uppercase font-bold">Database</span>
              <span className={isDbOk ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                {isDbOk ? 'MongoDB Online' : 'DB Disconnected'}
              </span>
            </div>
          </div>

          {/* ML Engine Status */}
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-900/50 border border-gray-800/80 text-xs">
            <Cpu
              size={14}
              className={`shrink-0 ${
                isModelActive ? 'text-cyan-400' : modelStatus?.status === 'not_trained' ? 'text-amber-400' : 'text-red-400'
              }`}
            />
            <div className="truncate">
              <span className="text-gray-500 block text-[10px] uppercase font-bold">ML Engine</span>
              <span
                className={`font-medium ${
                  isModelActive ? 'text-cyan-400' : modelStatus?.status === 'not_trained' ? 'text-amber-400' : 'text-red-400'
                }`}
              >
                {isModelActive ? 'Isolation Forest Active' : modelStatus?.status === 'not_trained' ? 'Not Trained' : 'Degraded'}
              </span>
            </div>
          </div>

          {/* Ingestion Pipeline Status */}
          <div className="col-span-2 sm:col-span-4 lg:col-span-1 flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-900/50 border border-gray-800/80 text-xs">
            <FileText size={14} className="text-blue-400 shrink-0" />
            <div className="truncate">
              <span className="text-gray-500 block text-[10px] uppercase font-bold">Log Pipeline</span>
              <span className="text-gray-300 font-medium">
                {stats?.last_ingested_at ? (
                  `Last: ${formatDate(stats.last_ingested_at).split(',')[1]?.trim() || 'Recent'}`
                ) : (
                  'Awaiting logs'
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Global Error Notice if Backend is unreachable */}
        {statsError && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 flex items-center justify-between text-sm text-red-200">
            <div className="flex items-center gap-3">
              <AlertCircle size={20} className="text-red-400 shrink-0" />
              <div>
                <p className="font-semibold text-white">Backend Connection Error</p>
                <p className="text-xs text-red-300/80 mt-0.5">
                  Unable to retrieve metrics from the API service. Please verify that the backend is running.
                </p>
              </div>
            </div>
            <button
              onClick={handleManualRefresh}
              className="btn btn-secondary text-xs border border-red-500/40 hover:bg-red-900/30 text-white shrink-0"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* ========================================================
            KPI METRIC CARDS (6 CARDS)
           ======================================================== */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <StatCard
            label="Total Logs"
            value={stats?.total_logs?.toLocaleString()}
            icon={FileText}
            color="#3b82f6"
            subtext="All ingested system events"
            href="/logs"
            isLoading={statsLoading}
            isError={statsError}
          />
          <StatCard
            label="Anomalies"
            value={stats?.total_anomalies?.toLocaleString()}
            icon={AlertTriangle}
            color="#f59e0b"
            subtext="AI detected deviations"
            href="/anomalies"
            isLoading={statsLoading}
            isError={statsError}
          />
          <StatCard
            label="Critical Alerts"
            value={stats?.critical_alerts?.toLocaleString()}
            icon={Zap}
            color="#ef4444"
            subtext="Immediate action required"
            href="/alerts"
            isLoading={statsLoading}
            isError={statsError}
          />
          <StatCard
            label="High Alerts"
            value={stats?.high_alerts?.toLocaleString()}
            icon={Bell}
            color="#f97316"
            subtext="Elevated security risks"
            href="/alerts"
            isLoading={statsLoading}
            isError={statsError}
          />
          <StatCard
            label="Active Cases"
            value={stats?.active_investigations?.toLocaleString()}
            icon={Search}
            color="#8b5cf6"
            subtext="Open investigations"
            href="/investigations"
            isLoading={statsLoading}
            isError={statsError}
          />
          <StatCard
            label="24H Detections"
            value={stats?.recent_anomalies_24h?.toLocaleString()}
            icon={Activity}
            color="#06b6d4"
            subtext="Anomalies in last 24 hours"
            href="/anomalies"
            isLoading={statsLoading}
            isError={statsError}
          />
        </div>

        {/* ========================================================
            ML DETECTION ENGINE STATUS PANEL
           ======================================================== */}
        <div className="card p-4 bg-gray-900/50 border border-gray-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800/80 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Cpu size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white tracking-wide">
                    ML Detection Engine Status
                  </h2>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      isModelActive
                        ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                        : modelStatus?.status === 'not_trained'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        : 'bg-red-500/10 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {isModelActive ? 'Model Active' : modelStatus?.status === 'not_trained' ? 'Not Trained' : 'Error'}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Unsupervised multivariate anomaly detection via scikit-learn Isolation Forest
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {user?.role === 'ADMIN' && (
                <button
                  type="button"
                  onClick={handleTrainModel}
                  disabled={isTraining || stats?.total_logs === 0}
                  className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 border border-cyan-500/30 hover:border-cyan-500/60 text-cyan-300 bg-cyan-950/20 disabled:opacity-50"
                  title={
                    (stats?.total_logs ?? 0) < 10
                      ? 'At least 10 log records are required to train the model'
                      : 'Retrain Isolation Forest model with current log dataset'
                  }
                >
                  {isTraining ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
                  <span>{isTraining ? 'Training...' : 'Retrain Model'}</span>
                </button>
              )}
              <Link
                href="/models"
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                <span>Model details</span>
                <ArrowUpRight size={12} />
              </Link>
            </div>
          </div>

          {trainMessage && (
            <div
              className={`mt-3 p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                trainMessage.type === 'success'
                  ? 'bg-green-950/40 text-green-300 border border-green-500/30'
                  : 'bg-red-950/40 text-red-300 border border-red-500/30'
              }`}
            >
              {trainMessage.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              <span>{trainMessage.text}</span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mt-3 pt-1 text-xs">
            <div className="bg-gray-950/50 p-2.5 rounded-lg border border-gray-800/60">
              <span className="text-gray-500 block text-[11px]">Algorithm</span>
              <span className="font-semibold text-white font-mono">
                {modelStatus?.algorithm || 'Isolation Forest'}
              </span>
            </div>
            <div className="bg-gray-950/50 p-2.5 rounded-lg border border-gray-800/60">
              <span className="text-gray-500 block text-[11px]">Model Version</span>
              <span className="font-semibold text-white font-mono">v{modelStatus?.version || '1.0'}</span>
            </div>
            <div className="bg-gray-950/50 p-2.5 rounded-lg border border-gray-800/60">
              <span className="text-gray-500 block text-[11px]">Training Set</span>
              <span className="font-semibold text-white font-mono">
                {modelStatus?.training_record_count?.toLocaleString() ?? '—'} records
              </span>
            </div>
            <div className="bg-gray-950/50 p-2.5 rounded-lg border border-gray-800/60">
              <span className="text-gray-500 block text-[11px]">Contamination Rate</span>
              <span className="font-semibold text-white font-mono">
                {modelStatus?.contamination ? `${(modelStatus.contamination * 100).toFixed(0)}%` : '10%'}
              </span>
            </div>
            <div className="bg-gray-950/50 p-2.5 rounded-lg border border-gray-800/60">
              <span className="text-gray-500 block text-[11px]">Estimators</span>
              <span className="font-semibold text-white font-mono">
                {modelStatus?.n_estimators ?? 200} Trees
              </span>
            </div>
            <div className="bg-gray-950/50 p-2.5 rounded-lg border border-gray-800/60">
              <span className="text-gray-500 block text-[11px]">Last Trained</span>
              <span className="font-semibold text-white truncate block font-mono" title={modelStatus?.trained_at}>
                {modelStatus?.trained_at ? formatDate(modelStatus.trained_at).split(',')[0] : 'Never'}
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================
            CHARTS ROW (ANOMALY TIMELINE & RISK DISTRIBUTION)
           ======================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 1. Anomaly Timeline (48 Hours) */}
          <div className="card lg:col-span-2 p-5 bg-gray-900/40 border border-gray-800">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-800/60">
              <div>
                <h2 className="font-bold text-white text-base flex items-center gap-2">
                  <Activity size={18} className="text-blue-400" />
                  Anomaly Timeline
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Hourly anomaly detections over the previous 48 hours
                </p>
              </div>
              <span className="text-[11px] font-mono text-gray-400 bg-gray-800/60 px-2.5 py-1 rounded">
                Window: 48h
              </span>
            </div>

            {timelineLoading ? (
              <div className="h-56 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-gray-500 text-xs">
                  <Loader2 size={24} className="animate-spin text-blue-500" />
                  <span>Loading timeline dataset...</span>
                </div>
              </div>
            ) : timelineError ? (
              <div className="h-56 flex flex-col items-center justify-center text-center p-4">
                <AlertCircle size={28} className="text-red-400 mb-2" />
                <p className="text-sm text-red-400 font-medium">Failed to load anomaly timeline</p>
                <button
                  onClick={() => refetchTimeline()}
                  className="btn btn-secondary text-xs mt-3 border border-red-500/30"
                >
                  Retry
                </button>
              </div>
            ) : timeline.length === 0 ? (
              <div className="h-56 flex flex-col items-center justify-center text-center p-4">
                <div className="w-12 h-12 rounded-full bg-gray-800/50 flex items-center justify-center text-gray-500 mb-3">
                  <FileText size={22} />
                </div>
                <p className="text-sm font-semibold text-gray-300">No anomaly activity in previous 48 hours</p>
                <p className="text-xs text-gray-500 mt-1 max-w-sm">
                  Upload security logs to begin automated anomaly detection and behavioral baseline profiling.
                </p>
                <Link href="/logs/upload" className="btn btn-primary text-xs mt-4 flex items-center gap-1.5">
                  <UploadCloud size={14} />
                  <span>Upload Security Logs</span>
                </Link>
              </div>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                    <XAxis
                      dataKey="_id"
                      tick={{ fill: '#6b7280', fontSize: 10 }}
                      tickFormatter={(v) => (v ? v.slice(11) + ':00' : '')}
                    />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: '#0d1117',
                        border: '1px solid #374151',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#f9fafb',
                      }}
                      labelFormatter={(label) => `Timestamp: ${label}:00`}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px', color: '#9ca3af' }} />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      name="Total Anomalies"
                    />
                    <Line
                      type="monotone"
                      dataKey="critical"
                      stroke="#ef4444"
                      strokeWidth={1.5}
                      dot={false}
                      name="Critical"
                    />
                    <Line
                      type="monotone"
                      dataKey="high"
                      stroke="#f97316"
                      strokeWidth={1.5}
                      dot={false}
                      name="High"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* 2. Risk Distribution */}
          <div className="card p-5 bg-gray-900/40 border border-gray-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-800/60">
                <div>
                  <h2 className="font-bold text-white text-base">Risk Distribution</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Classification by severity levels</p>
                </div>
                <Link
                  href="/anomalies"
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <span>Filter</span>
                  <ArrowUpRight size={12} />
                </Link>
              </div>

              {riskLoading ? (
                <div className="h-44 flex items-center justify-center">
                  <Loader2 size={24} className="animate-spin text-amber-500" />
                </div>
              ) : riskError ? (
                <div className="h-44 flex flex-col items-center justify-center text-center">
                  <AlertCircle size={24} className="text-red-400 mb-1" />
                  <p className="text-xs text-red-400">Failed to load risk distribution</p>
                  <button onClick={() => refetchRisk()} className="btn btn-secondary text-xs mt-2">
                    Retry
                  </button>
                </div>
              ) : totalRiskCount === 0 ? (
                <div className="h-44 flex flex-col items-center justify-center text-center text-gray-500 text-xs">
                  <AlertTriangle size={24} className="text-gray-600 mb-2" />
                  <span>No risk data available yet</span>
                </div>
              ) : (
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={formattedRisks}
                        dataKey="count"
                        nameKey="risk_level"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={3}
                      >
                        {formattedRisks.map((entry) => (
                          <Cell
                            key={entry.risk_level}
                            fill={RISK_PALETTE[entry.risk_level] || '#6b7280'}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: '#0d1117',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          fontSize: '12px',
                          color: '#f9fafb',
                        }}
                        formatter={(val) => [`${val} events`, 'Count']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Risk Levels Summary Table */}
            <div className="grid grid-cols-5 gap-1 pt-3 border-t border-gray-800/60 text-center">
              {formattedRisks.map((r) => (
                <Link
                  key={r.risk_level}
                  href={`/anomalies?risk_level=${r.risk_level}`}
                  className="p-1.5 rounded-lg bg-gray-950/40 hover:bg-gray-800/50 transition-colors block"
                  title={`View ${r.risk_level} anomalies`}
                >
                  <span
                    className="text-[10px] font-bold block uppercase"
                    style={{ color: RISK_PALETTE[r.risk_level] }}
                  >
                    {r.risk_level.slice(0, 4)}
                  </span>
                  <span className="text-xs font-bold text-white block mt-0.5">
                    {r.count.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-gray-500 block">{r.pct}%</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* ========================================================
            BOTTOM ROW: RECENT THREAT ACTIVITY & SUSPICIOUS ACTORS
           ======================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 1. Recent Threat Activity (2 Cols) */}
          <div className="card lg:col-span-2 p-5 bg-gray-900/40 border border-gray-800">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-800/60">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <h2 className="font-bold text-white text-base">Recent Threat Activity</h2>
                <span className="text-xs text-gray-500 font-normal">
                  (High & Critical Anomalies)
                </span>
              </div>
              <Link
                href="/alerts"
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
              >
                <span>View all alerts</span>
                <ArrowUpRight size={13} />
              </Link>
            </div>

            {threatsLoading ? (
              <div className="space-y-3 py-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-14 rounded-lg bg-gray-800/40 animate-pulse" />
                ))}
              </div>
            ) : threatsError ? (
              <div className="py-10 text-center">
                <AlertCircle size={28} className="text-red-400 mx-auto mb-2" />
                <p className="text-sm text-red-400 font-medium">Failed to load recent threats</p>
                <button onClick={() => refetchThreats()} className="btn btn-secondary text-xs mt-3">
                  Retry
                </button>
              </div>
            ) : threats.length === 0 ? (
              <div className="py-12 text-center">
                <CheckCircle2 size={32} className="text-green-500 mx-auto mb-2 opacity-80" />
                <p className="text-sm font-semibold text-gray-300">
                  No High or Critical Threats Detected
                </p>
                <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                  System behavior is operating within expected baselines. Ingest new security logs to run continuous threat evaluations.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {threats.map(
                  (t: {
                    _id: string;
                    risk_level: string;
                    user?: string;
                    ip?: string;
                    event_type?: string;
                    action?: string;
                    normalized_anomaly_score?: number;
                    timestamp?: string;
                    created_at?: string;
                  }) => {
                    const riskColor = RISK_PALETTE[t.risk_level] || '#6b7280';
                    return (
                      <Link
                        key={t._id}
                        href={`/anomalies/${t._id}`}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-gray-950/60 hover:bg-gray-800/60 border border-gray-800/70 hover:border-gray-700 transition-all duration-150 group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wider shrink-0 border"
                            style={{
                              backgroundColor: `${riskColor}18`,
                              color: riskColor,
                              borderColor: `${riskColor}40`,
                            }}
                          >
                            {t.risk_level}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-white truncate group-hover:text-blue-300 transition-colors">
                                {t.user || 'Unknown User'}
                              </span>
                              {t.ip && (
                                <span className="text-xs font-mono text-gray-400 bg-gray-900 px-1.5 py-0.5 rounded border border-gray-800">
                                  {t.ip}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5 truncate">
                              {t.action || t.event_type || 'Potentially suspicious activity detected'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-800/60">
                          <div className="text-left sm:text-right">
                            <div className="flex items-center sm:justify-end gap-1.5">
                              <span className="text-[10px] text-gray-500 uppercase">Score</span>
                              <span className="text-xs font-mono font-bold" style={{ color: riskColor }}>
                                {t.normalized_anomaly_score !== undefined
                                  ? t.normalized_anomaly_score.toFixed(3)
                                  : '—'}
                              </span>
                            </div>
                            <span className="text-[11px] text-gray-500 block">
                              {formatDate(t.timestamp || t.created_at)}
                            </span>
                          </div>
                          <ArrowUpRight
                            size={16}
                            className="text-gray-500 group-hover:text-blue-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
                          />
                        </div>
                      </Link>
                    );
                  }
                )}
              </div>
            )}
          </div>

          {/* 2. Right Column: Suspicious Users, IPs & Event Types (1 Col) */}
          <div className="space-y-6">
            {/* Top Suspicious Users */}
            <div className="card p-5 bg-gray-900/40 border border-gray-800">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-800/60">
                <h2 className="font-bold text-white text-sm flex items-center gap-2">
                  <Users size={16} className="text-purple-400" />
                  Top Suspicious Users
                </h2>
                <span className="text-[11px] text-gray-500">By Anomaly Count</span>
              </div>

              {(stats?.top_suspicious_users ?? []).length === 0 ? (
                <div className="text-gray-500 text-xs py-4 text-center">
                  No suspicious user activity recorded
                </div>
              ) : (
                <div className="space-y-2">
                  {(stats?.top_suspicious_users ?? []).map(
                    (u: { user: string; count: number; max_score?: number }) => (
                      <Link
                        key={u.user}
                        href={`/anomalies?user=${encodeURIComponent(u.user)}`}
                        className="flex items-center justify-between p-2 rounded-lg bg-gray-950/40 hover:bg-gray-800/50 border border-gray-800/50 transition-colors text-xs group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 font-bold flex items-center justify-center text-[10px] shrink-0">
                            {u.user[0]?.toUpperCase() || 'U'}
                          </span>
                          <span className="text-gray-200 font-mono truncate group-hover:text-purple-300 transition-colors">
                            {u.user}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-gray-400 font-semibold">{u.count} events</span>
                          {u.max_score != null && (
                            <span
                              className="font-mono font-bold text-[11px]"
                              style={{
                                color:
                                  u.max_score > 0.8
                                    ? '#ef4444'
                                    : u.max_score > 0.6
                                    ? '#f59e0b'
                                    : '#22c55e',
                              }}
                            >
                              {u.max_score.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </Link>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Top Suspicious IPs */}
            <div className="card p-5 bg-gray-900/40 border border-gray-800">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-800/60">
                <h2 className="font-bold text-white text-sm flex items-center gap-2">
                  <Globe size={16} className="text-cyan-400" />
                  Top Suspicious IPs
                </h2>
                <span className="text-[11px] text-gray-500">By Frequency</span>
              </div>

              {(stats?.top_suspicious_ips ?? []).length === 0 ? (
                <div className="text-gray-500 text-xs py-4 text-center">
                  No suspicious IPs flagged yet
                </div>
              ) : (
                <div className="space-y-2">
                  {(stats?.top_suspicious_ips ?? []).map(
                    (i: { ip: string; count: number; max_score?: number }) => (
                      <div
                        key={i.ip}
                        className="flex items-center justify-between p-2 rounded-lg bg-gray-950/40 border border-gray-800/50 text-xs"
                      >
                        <span className="text-gray-200 font-mono text-[11px]">{i.ip}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-gray-400 font-semibold">{i.count}× flagged</span>
                          {i.max_score != null && (
                            <span
                              className="font-mono font-bold text-[11px]"
                              style={{
                                color:
                                  i.max_score > 0.8
                                    ? '#ef4444'
                                    : i.max_score > 0.6
                                    ? '#f59e0b'
                                    : '#22c55e',
                              }}
                            >
                              {i.max_score.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Event Types Distribution */}
            {evTypes.length > 0 && (
              <div className="card p-5 bg-gray-900/40 border border-gray-800">
                <h2 className="font-bold text-white text-sm mb-3">Event Type Distribution</h2>
                <div className="h-32 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={evTypes} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                      <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} />
                      <YAxis
                        dataKey="event_type"
                        type="category"
                        tick={{ fill: '#9ca3af', fontSize: 10 }}
                        width={85}
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#0d1117',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          fontSize: '11px',
                          color: '#f9fafb',
                        }}
                      />
                      <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
