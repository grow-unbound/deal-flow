'use client';

import { useEffect } from 'react';

export function BuyerServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/buyer-sw.js', { scope: '/buy/' }).catch(() => {
      // Non-critical — the app works fine without the service worker, it's a pure speed optimization.
    });
  }, []);

  return null;
}
