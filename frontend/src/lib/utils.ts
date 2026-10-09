export type RiskLevel = 'NORMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';

export const RISK_COLORS: Record<RiskLevel, string> = {
  NORMAL: '#22c55e',
  LOW: '#84cc16',
  MEDIUM: '#f59e0b',
  HIGH: '#f97316',
  CRITICAL: '#ef4444',
  UNKNOWN: '#6b7280',
};

export const RISK_BG: Record<RiskLevel, string> = {
  NORMAL: 'bg-green-500/10 text-green-400 border-green-500/30',
  LOW: 'bg-lime-500/10 text-lime-400 border-lime-500/30',
  MEDIUM: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  HIGH: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  CRITICAL: 'bg-red-500/10 text-red-400 border-red-500/30',
  UNKNOWN: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
};

export const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  investigating: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  resolved: 'bg-green-500/10 text-green-400 border-green-500/30',
  false_positive: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
  open: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  in_progress: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  closed: 'bg-green-500/10 text-green-400 border-green-500/30',
};

export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'N/A';
  return score.toFixed(3);
}

export function formatDate(ts: string | null | undefined): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return ts;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
