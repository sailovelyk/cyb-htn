'use client';
import { RISK_COLORS, type RiskLevel, formatScore } from '@/lib/utils';

interface Props {
  score: number | null | undefined;
  showBar?: boolean;
}

export default function ScoreDisplay({ score, showBar = true }: Props) {
  if (score === null || score === undefined) {
    return <span className="text-gray-500 text-sm">N/A</span>;
  }

  const pct = Math.round(score * 100);
  let risk: RiskLevel = 'NORMAL';
  if (score > 0.90) risk = 'CRITICAL';
  else if (score > 0.80) risk = 'HIGH';
  else if (score > 0.60) risk = 'MEDIUM';
  else if (score > 0.30) risk = 'LOW';

  const color = RISK_COLORS[risk];

  return (
    <div className="flex flex-col gap-1 min-w-20">
      <span className="text-sm font-mono font-semibold" style={{ color }}>
        {formatScore(score)}
      </span>
      {showBar && (
        <div className="score-bar-container">
          <div
            className="score-bar"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
      )}
    </div>
  );
}
