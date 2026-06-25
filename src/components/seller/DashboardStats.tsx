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
    <div className="rounded-lg border border-cream-300 bg-white p-5 shadow-xs">
      <div className="flex items-start justify-between">
        <p className="eyebrow text-cream-600 mb-2">{stat.label}</p>
        {stat.icon && <span className="text-cream-400">{stat.icon}</span>}
      </div>
      <p className="font-mono text-2xl font-medium leading-none text-[#4A3F35] tabular">{stat.value}</p>
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

function DashboardCard({
  title,
  subtitle,
  rightSlot,
  children,
}: {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-cream-300 bg-white">
      <div className="flex items-center justify-between border-b border-cream-200 px-5 py-4">
        <div>
          <h2 className="text-md font-semibold text-cream-900">{title}</h2>
          {subtitle ? <p className="text-sm text-cream-600">{subtitle}</p> : null}
        </div>
        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export { DashboardStats, DashboardCard, StatCard };
