import { ReactNode } from 'react';

interface SellerTopbarProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  action?: ReactNode;
}

export function SellerTopbar({ title, subtitle, eyebrow, action }: SellerTopbarProps) {
  return (
    <div className="mb-7 flex items-end justify-between gap-6">
      <div>
        {eyebrow ? <p className="eyebrow text-cream-700">{eyebrow}</p> : null}
        <h1 className="font-display text-3xl font-extrabold leading-[1.05] tracking-[-0.02em] text-cream-900">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-[10px] max-w-[60ch] text-md leading-[1.55] text-cream-700">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2 pb-0.5">{action}</div> : null}
    </div>
  );
}
