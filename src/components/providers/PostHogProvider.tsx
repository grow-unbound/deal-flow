'use client';

import React from 'react';
import { PostHogProvider as PostHogProviderComponent } from 'posthog-js/react';
import posthog from 'posthog-js';

// PostHog is initialized in instrumentation-client.ts (Next.js 15.3+ pattern).
// This component only provides the React context so usePostHog() hooks work throughout the app.

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PostHogProviderComponent client={posthog}>
      {children}
    </PostHogProviderComponent>
  );
}
