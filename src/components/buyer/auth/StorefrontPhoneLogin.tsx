'use client';

import { CANONICAL_STOREFRONT_SUFFIX, LOCAL_STOREFRONT_SUFFIX } from '@/lib/storefront-host';

/**
 * OTP now happens exclusively on catalog.useyukti.in (the central login /
 * workspace-finder host) — never locally on a tenant storefront. This keeps
 * the destination tenant's session cookie first-party (set via the
 * /auth/storefront-handoff redemption page there), instead of the old
 * per-tenant OTP flow that made cross-tenant continuity impossible without
 * sharing a cookie across origins. See
 * specs/Yukti_Onboarding-Public-Catalog_Build-Plan_v1.md, "P1 open-items
 * resolution", item 1.
 *
 * `return_to` (this tenant's own absolute URL, e.g. the product page the
 * buyer was on) rides through as its own param — deliberately not `next`,
 * since /login's safeNext() only accepts relative paths and would drop an
 * absolute cross-origin URL. /verify forwards it in the POST body; the
 * server validates it resolves to the SAME tenant host being logged into
 * before trusting it (never an open redirect), and appends it to the
 * /auth/storefront-handoff link as that page's own `next`.
 */
function catalogLoginUrl(returnTo: string): string {
  const isLocal = typeof window !== 'undefined' && window.location.hostname.endsWith(`.${LOCAL_STOREFRONT_SUFFIX}`);
  const host = isLocal ? `catalog.${LOCAL_STOREFRONT_SUFFIX}` : `catalog.${CANONICAL_STOREFRONT_SUFFIX}`;
  const protocol = isLocal ? window.location.protocol : 'https:';
  const port = isLocal && window.location.port ? `:${window.location.port}` : '';
  return `${protocol}//${host}${port}/login?return_to=${encodeURIComponent(returnTo)}`;
}

export function StorefrontPhoneLogin({
  nextPath = '/',
  compact = false,
}: {
  nextPath?: string;
  compact?: boolean;
}) {
  function handleClick() {
    const returnTo = typeof window !== 'undefined' ? `${window.location.origin}${nextPath || '/'}` : '/';
    window.location.assign(catalogLoginUrl(returnTo));
  }

  return (
    <div className={compact ? '' : 'rounded-xl border border-cream-300 bg-white p-8 shadow-md'}>
      <h1 className="mb-1 font-display text-h2 text-cream-900">Log in to order</h1>
      <p className="mb-6 text-body-sm text-cream-600">
        Continue with your WhatsApp number to see pricing and place orders.
      </p>
      <button
        type="button"
        onClick={handleClick}
        className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-md bg-teal-500 hover:bg-teal-600 text-cream-50 text-body-sm font-semibold transition-colors duration-base"
      >
        Continue
      </button>
    </div>
  );
}
