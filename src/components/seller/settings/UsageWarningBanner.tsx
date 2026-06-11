'use client';

import { AlertTriangle } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import type { BillingWarning } from '@/types/billing-settings';

export function UsageWarningBanner({ warnings }: { warnings: BillingWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <Alert variant="warning" className="flex gap-3 border-warning-500/40 bg-warning-50">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-700" />
      <AlertDescription className="text-body-sm text-warning-900">
        <span className="font-semibold">Approaching plan limits</span>
        <ul className="mt-2 list-inside list-disc space-y-1 text-warning-800">
          {warnings.map((w) => (
            <li key={w.key}>{w.message}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
