'use client';

import { useEffect } from 'react';

export function BuyerServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Dev (esp. Turbopack) doesn't content-hash chunk URLs as reliably as prod builds —
    // a cache-first SW here can pin a stale JS/CSS chunk across HMR recompiles indefinitely.
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister();
      }).catch(() => {});
      return;
    }
    navigator.serviceWorker.register('/buyer-sw.js', { scope: '/buy/' }).catch(() => {
      // Non-critical — the app works fine without the service worker, it's a pure speed optimization.
    });
  }, []);

  return null;
}
