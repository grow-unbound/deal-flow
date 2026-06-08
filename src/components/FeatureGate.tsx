'use client';

import React from 'react';
import { FEATURE_FLAGS } from '@/constants';
import { useFlagState } from '@/hooks/useFeatureFlag';

interface FeatureGateProps {
  flag: keyof typeof FEATURE_FLAGS;
  children: React.ReactNode;
}

export function FeatureDisabledState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center bg-cream-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/illustrations/illustration-empty-catalog.svg"
        alt=""
        width={160}
        height={120}
        className="mb-6 opacity-70"
      />
      <h2 className="font-display text-2xl text-cream-900 mb-3">
        This feature isn&apos;t enabled yet.
      </h2>
      <p className="font-sans text-cream-700 max-w-sm">
        Contact your administrator to enable this module, or check back once it&apos;s been activated for your workspace.
      </p>
    </div>
  );
}

export function FeatureGate({ flag, children }: FeatureGateProps) {
  const enabled = useFlagState(flag);

  // Avoid a false-negative flash while flags are hydrating.
  if (enabled === undefined) {
    return <>{children}</>;
  }

  if (!enabled) {
    return <FeatureDisabledState />;
  }

  return <>{children}</>;
}
