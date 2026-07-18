import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

import type { SellerLandingPeriod, SellerLandingPeriodOption } from '@/lib/seller-period';

interface HeaderAction {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  horizon: string;
  showHorizonControl?: boolean;
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
  horizon: _horizon,
  showHorizonControl: _showHorizonControl = true,
  period: _period,
  periodOptions: _periodOptions,
  onPeriodChange: _onPeriodChange,
  secondary,
  primary,
  onPrimaryClick,
}: PageHeaderProps) {
  return (
    <header className="mb-7 flex items-end justify-between gap-6">
      <div>
        <p className="eyebrow text-cream-700">{eyebrow}</p>
        <h1 className="font-display text-3xl font-extrabold leading-[1.05] tracking-[-0.02em] text-cream-900">{title}</h1>
        <p className="mt-[10px] max-w-[64ch] text-md leading-[1.55] text-cream-700">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pb-0.5">
        {secondary ? (
          <Button
            variant="secondary"
            onClick={secondary.onClick}
            disabled={secondary.disabled}
            title={secondary.title}
          >
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
