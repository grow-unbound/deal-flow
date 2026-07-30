import { ReactNode } from 'react';

interface SellerTopbarProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  action?: ReactNode;
}

export function SellerTopbar({ title, subtitle, eyebrow: _eyebrow, action }: SellerTopbarProps) {
  return (
    <div className="mb-3 flex items-end justify-between gap-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold leading-[1] tracking-[-0.02em] text-cream-900">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 max-w-[60ch] text-md leading-[1.3] text-cream-700">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2 pb-0.5">{action}</div> : null}
    </div>
  );
}
