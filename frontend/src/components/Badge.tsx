'use client';
import { RISK_BG, STATUS_COLORS, type RiskLevel } from '@/lib/utils';

interface Props {
  value: string;
  type?: 'risk' | 'status' | 'default';
}

export default function Badge({ value, type = 'default' }: Props) {
  const upper = (value || '').toUpperCase();
  const lower = (value || '').toLowerCase();

  let colorClass = 'bg-gray-500/10 text-gray-400 border-gray-500/30';
  if (type === 'risk') {
    colorClass = RISK_BG[upper as RiskLevel] ?? colorClass;
  } else if (type === 'status') {
    colorClass = STATUS_COLORS[lower] ?? colorClass;
  }

  return (
    <span className={`badge ${colorClass}`}>
      {value}
    </span>
  );
}
