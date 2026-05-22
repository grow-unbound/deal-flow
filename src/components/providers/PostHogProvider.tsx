'use client';

import React from 'react';
import { PostHogProvider as PostHogProviderComponent } from 'posthog-js/react';
import posthog from 'posthog-js';

if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY || '', {
    api_host: 'https://us.i.posthog.com',
    loaded: (ph) => {
      if (process.env.NODE_ENV === 'development') ph.debug();
    },
    // Feature flag configuration
    feature_flags: {
      // Explicitly enable flag ingestion with 60 second cache
      reloadFeatureFlags: 'onEachPage',
    },
  });
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PostHogProviderComponent client={posthog}>
      {children}
    </PostHogProviderComponent>
  );
}
