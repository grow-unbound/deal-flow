'use client';

import { useEffect } from 'react';
import { parseRequestHost } from '@/lib/storefront-host';

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

    const hostKind = parseRequestHost(window.location.hostname);
    const isTenantHost = hostKind.kind === 'tenant';

    void (async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        const scopePath = new URL(reg.scope).pathname;
        if (!isTenantHost || scopePath.startsWith('/buy')) {
          await reg.unregister();
        }
      }

      if (!isTenantHost) return;

      await navigator.serviceWorker.register('/buyer-sw.js', { scope: '/' }).catch(() => {
        // Non-critical — the app works fine without the service worker.
      });
    })();
  }, []);

  return null;
}
