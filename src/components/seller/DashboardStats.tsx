import * as React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StatItem {
  label: string;
  value: string | number;
  sub?: string;
  trend?: number;
  icon?: React.ReactNode;
}

interface DashboardStatsProps {
  stats: StatItem[];
  columns?: 2 | 3 | 4;
  className?: string;
}

function DashboardStats({ stats, columns = 4, className }: DashboardStatsProps) {
  return (
    <div
      className={cn(
        'grid gap-4',
        columns === 2 && 'grid-cols-2',
        columns === 3 && 'grid-cols-3',
        columns === 4 && 'grid-cols-2 lg:grid-cols-4',
        className
      )}
    >
      {stats.map((stat) => (
        <StatCard key={stat.label} stat={stat} />
      ))}
    </div>
  );
}

function StatCard({ stat }: { stat: StatItem }) {
  const trend = stat.trend;
  const isPositive = trend !== undefined && trend > 0;
  const isNegative = trend !== undefined && trend < 0;

  return (
    <div className="bg-white border border-cream-300 rounded-lg p-5 shadow-xs">
      <div className="flex items-start justify-between">
        <p className="eyebrow text-cream-600 mb-2">{stat.label}</p>
        {stat.icon && <span className="text-cream-400">{stat.icon}</span>}
      </div>
      <p className="text-h2 font-display font-medium text-cream-900 tabular-nums">{stat.value}</p>
      <div className="flex items-center gap-1.5 mt-1.5">
        {trend !== undefined && (
          <span
            className={cn(
              'flex items-center gap-0.5 text-caption font-medium',
              isPositive && 'text-success-700',
              isNegative && 'text-danger-500',
              !isPositive && !isNegative && 'text-cream-600'
            )}
          >
            {isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : isNegative ? (
              <TrendingDown className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            {Math.abs(trend)}%
          </span>
        )}
        {stat.sub && (
          <p className="text-caption text-cream-500">{stat.sub}</p>
        )}
      </div>
    </div>
  );
}

export { DashboardStats };
