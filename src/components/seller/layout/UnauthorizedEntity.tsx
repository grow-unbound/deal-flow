'use client';

import { Lock, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Props {
  type?: string;
}

const TYPE_LABELS: Record<string, string> = {
  estimate: 'estimate',
  order:    'order',
  invoice:  'invoice',
  product:  'product',
  brand:    'brand',
  customer: 'customer',
};

export function UnauthorizedEntity({ type = 'page' }: Props) {
  const router = useRouter();
  const label  = TYPE_LABELS[type] ?? type;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-cream-100">
        <Lock size={24} className="text-cream-500" strokeWidth={1.5} />
      </div>

      <div className="space-y-1">
        <p className="text-base font-semibold text-cream-900">
          You don&apos;t have access to this {label}
        </p>
        <p className="text-sm text-cream-500">
          Contact your admin if you believe this is a mistake.
        </p>
      </div>

      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1.5 rounded-lg border border-cream-300 bg-[var(--bg-surface)] px-4 py-2 text-sm text-cream-700 transition-colors hover:bg-cream-50"
      >
        <ArrowLeft size={14} />
        Go back
      </button>
    </div>
  );
}
