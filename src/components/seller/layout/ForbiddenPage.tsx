'use client';

import { FeatureDisabledState } from '@/components/FeatureGate';
import { PermissionDenied } from '@/components/auth/PermissionDenied';

/** Server-gated wrong role — use instead of redirecting to dashboard. */
export function RoleForbiddenPage() {
  return <PermissionDenied />;
}

/** Server-gated feature flag off — use instead of redirecting to dashboard. */
export function FeatureForbiddenPage() {
  return <FeatureDisabledState />;
}
