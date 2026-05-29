import type { ReactNode } from 'react';
import { ChevronDown, Plus } from 'lucide-react';

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
  secondary: HeaderAction;
  primary: string;
  onPrimaryClick?: () => void;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  horizon,
  secondary,
  primary,
  onPrimaryClick,
}: PageHeaderProps) {
  return (
    <header className="mb-7 flex items-end justify-between gap-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-cream-700">{eyebrow}</p>
        <h1 className="font-display text-[34px] font-medium leading-[1.05] tracking-[-0.018em] text-cream-900">{title}</h1>
        <p className="mt-[10px] max-w-[64ch] text-[14px] leading-[1.55] text-cream-700">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pb-0.5">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-[8px] border border-cream-400 bg-white px-3 py-[7px] text-[12.5px] text-cream-800 hover:bg-cream-100"
        >
          <span className="text-cream-700">Showing</span>
          <span className="font-semibold">{horizon}</span>
          <ChevronDown size={14} />
        </button>
        <button type="button" className="cockpit-btn cockpit-btn-secondary" onClick={secondary.onClick}>
          {secondary.icon}
          <span>{secondary.label}</span>
        </button>
        <button
          type="button"
          className="cockpit-btn cockpit-btn-primary"
          onClick={onPrimaryClick}
        >
          <Plus size={13} />
          <span>{primary}</span>
        </button>
      </div>
    </header>
  );
}
