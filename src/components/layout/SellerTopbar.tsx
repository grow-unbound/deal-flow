import { ReactNode } from 'react';

interface SellerTopbarProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  action?: ReactNode;
}

export function SellerTopbar({ title, subtitle, eyebrow, action }: SellerTopbarProps) {
  return (
    <div className="mb-7 flex items-end justify-between gap-6 px-8 pt-6">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-2xl font-extrabold leading-[1.05] tracking-[-0.025em] text-cream-900">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 max-w-[60ch] text-sm leading-6 text-cream-700">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
