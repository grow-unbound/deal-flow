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
    // Feature flags reload on each page navigation
    bootstrap: {},
  });
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PostHogProviderComponent client={posthog}>
      {children}
    </PostHogProviderComponent>
  );
}
