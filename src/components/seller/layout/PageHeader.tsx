import type { ReactNode } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { cn } from '@/lib/utils';
import type { SellerLandingPeriod, SellerLandingPeriodOption } from '@/lib/seller-period';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface HeaderAction {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
}

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  horizon: string;
  period?: SellerLandingPeriod;
  periodOptions?: SellerLandingPeriodOption[];
  onPeriodChange?: (period: SellerLandingPeriod) => void;
  secondary?: HeaderAction;
  primary?: string;
  onPrimaryClick?: () => void;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  horizon,
  period,
  periodOptions,
  onPeriodChange,
  secondary,
  primary,
  onPrimaryClick,
}: PageHeaderProps) {
  const showPeriodMenu = Boolean(periodOptions?.length && onPeriodChange);

  return (
    <header className="mb-7 flex items-end justify-between gap-6">
      <div>
        <p className="eyebrow text-cream-700">{eyebrow}</p>
        <h1 className="font-display text-3xl font-extrabold leading-[1.05] tracking-[-0.02em] text-cream-900">{title}</h1>
        <p className="mt-[10px] max-w-[64ch] text-md leading-[1.55] text-cream-700">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pb-0.5">
        {showPeriodMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-[10px] border border-cream-400 bg-white px-3 py-[7px] text-sm text-cream-800 hover:bg-cream-100">
              <span className="text-cream-700">Showing</span>
              <span className="font-semibold">{horizon}</span>
              <ChevronDown size={14} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px] border-cream-300">
              {(periodOptions ?? []).map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => onPeriodChange?.(option.value)}
                  className={cn(period === option.value && 'bg-cream-100 font-medium text-cream-900')}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-[10px] border border-cream-400 bg-white px-3 py-[7px] text-sm text-cream-800 hover:bg-cream-100"
          >
            <span className="text-cream-700">Showing</span>
            <span className="font-semibold">{horizon}</span>
            <ChevronDown size={14} />
          </button>
        )}
        {secondary ? (
          <Button variant="secondary" onClick={secondary.onClick}>
            {secondary.icon}
            {secondary.label}
          </Button>
        ) : null}
        {primary ? (
          <Button variant="primary" onClick={onPrimaryClick}>
            <Plus size={13} />
            {primary}
          </Button>
        ) : null}
      </div>
    </header>
  );
}
