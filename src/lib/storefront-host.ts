export const CANONICAL_STOREFRONT_SUFFIX = 'useyukti.in';
export const LEGACY_STOREFRONT_SUFFIX = 'yukti.so';
export const LOCAL_STOREFRONT_SUFFIX = 'localhost';
export const WINEYARD_SLUG = 'wineyard';

export const RESERVED_STOREFRONT_LABELS = [
  'app',
  'www',
  'catalog',
  'api',
  'login',
  'admin',
  'assets',
  'mail',
  'smtp',
  'ftp',
  'cdn',
  'static',
  'status',
  'help',
  'support',
] as const;

export type StorefrontHostKind =
  | { kind: 'local' }
  | { kind: 'app'; suffix: string }
  | { kind: 'reserved'; label: string; suffix: string }
  | { kind: 'tenant'; slug: string; suffix: string };

export function isReservedStorefrontLabel(label: string): boolean {
  return (RESERVED_STOREFRONT_LABELS as readonly string[]).includes(label.toLowerCase());
}

export function canonicalStorefrontHost(slug: string): string {
  return `${slug}.${CANONICAL_STOREFRONT_SUFFIX}`;
}

export function canonicalStorefrontUrl(slug: string, path = '/'): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `https://${canonicalStorefrontHost(slug)}${normalized === '/' ? '' : normalized}`;
}

export function parseRequestHost(hostHeader: string): StorefrontHostKind {
  const hostname = hostHeader.split(':')[0]?.trim().toLowerCase() ?? '';
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
    return { kind: 'local' };
  }

  if (hostname === CANONICAL_STOREFRONT_SUFFIX || hostname === LEGACY_STOREFRONT_SUFFIX) {
    return { kind: 'reserved', label: 'www', suffix: hostname };
  }

  const parts = hostname.split('.');
  const isLocalDevHost = parts.length >= 2 && parts[parts.length - 1] === LOCAL_STOREFRONT_SUFFIX;
  if (parts.length < 3 && !isLocalDevHost) {
    return { kind: 'reserved', label: parts[0] ?? hostname, suffix: hostname };
  }

  const label = parts[0] ?? '';
  const suffix = parts.slice(1).join('.');
  if (label === 'app') {
    return { kind: 'app', suffix };
  }
  if (isReservedStorefrontLabel(label)) {
    return { kind: 'reserved', label, suffix };
  }
  return { kind: 'tenant', slug: label, suffix };
}

export function isCanonicalStorefrontSuffix(suffix: string): boolean {
  return suffix === CANONICAL_STOREFRONT_SUFFIX;
}

export function isLocalStorefrontSuffix(suffix: string): boolean {
  return suffix === LOCAL_STOREFRONT_SUFFIX;
}

export function toCanonicalHost(hostKind: StorefrontHostKind): string | null {
  if (hostKind.kind === 'local') return null;
  if ('suffix' in hostKind && isLocalStorefrontSuffix(hostKind.suffix)) return null;
  if (hostKind.kind === 'app') {
    return isCanonicalStorefrontSuffix(hostKind.suffix) ? null : `app.${CANONICAL_STOREFRONT_SUFFIX}`;
  }
  if (hostKind.kind === 'reserved') {
    if (hostKind.label === 'www') return CANONICAL_STOREFRONT_SUFFIX;
    return isCanonicalStorefrontSuffix(hostKind.suffix)
      ? null
      : `${hostKind.label}.${CANONICAL_STOREFRONT_SUFFIX}`;
  }
  return isCanonicalStorefrontSuffix(hostKind.suffix)
    ? null
    : canonicalStorefrontHost(hostKind.slug);
}

/** Port from a `host` header (e.g. "wineyard.localhost:3000" -> "3000"), or ''. */
function extractPort(hostHeader: string): string {
  return hostHeader.includes(':') ? hostHeader.slice(hostHeader.indexOf(':') + 1) : '';
}

/** Seller app host that stays on *.localhost in local dev. */
export function sellerAppHostForRequest(hostHeader: string): string {
  const hostKind = parseRequestHost(hostHeader);
  if (hostKind.kind !== 'local' && 'suffix' in hostKind && isLocalStorefrontSuffix(hostKind.suffix)) {
    const port = extractPort(hostHeader);
    return `app.${LOCAL_STOREFRONT_SUFFIX}${port ? `:${port}` : ''}`;
  }
  return `app.${CANONICAL_STOREFRONT_SUFFIX}`;
}

export function tenantStorefrontHostForRequest(hostHeader: string, slug: string): string {
  const hostKind = parseRequestHost(hostHeader);
  if (hostKind.kind !== 'local' && 'suffix' in hostKind && isLocalStorefrontSuffix(hostKind.suffix)) {
    const port = extractPort(hostHeader);
    return `${slug}.${LOCAL_STOREFRONT_SUFFIX}${port ? `:${port}` : ''}`;
  }
  return canonicalStorefrontHost(slug);
}

export function storefrontOriginForRequest(hostHeader: string, slug: string): string {
  const hostname = hostHeader.split(':')[0]?.trim().toLowerCase() ?? '';
  const port = hostHeader.includes(':') ? hostHeader.slice(hostHeader.indexOf(':') + 1) : '';
  const hostKind = parseRequestHost(hostHeader);
  const local =
    hostKind.kind === 'local'
    || ('suffix' in hostKind && isLocalStorefrontSuffix(hostKind.suffix));
  if (local || hostname === LOCAL_STOREFRONT_SUFFIX) {
    const host = `${slug}.${LOCAL_STOREFRONT_SUFFIX}`;
    return `http://${host}${port ? `:${port}` : ''}`;
  }
  return canonicalStorefrontUrl(slug);
}

// Host-only everywhere — never a shared `.useyukti.in` domain cookie. Seller
// (app.useyukti.in) and buyer ({slug}.useyukti.in) sessions are different
// identity realms and must never collide (this is what caused the P0
// session-clobbering bug: a shared cookie let a seller login overwrite a
// buyer's session and vice versa). Cross-tenant buyer continuity is handled
// at the app layer via the catalog.useyukti.in handoff (mintBuyerHandoffLink),
// not by sharing a cookie across origins — see
// specs/Yukti_Onboarding-Public-Catalog_Build-Plan_v1.md, "P1 open-items
// resolution", item 1.
export function authCookieDomain(): string | undefined {
  return undefined;
}

export function withAuthCookieDomain<T extends object>(options: T): T {
  const domain = authCookieDomain();
  if (!domain) return options;
  return { ...options, domain } as T;
}

/**
 * Validates a client-supplied `return_to` (an absolute URL) against the
 * destination host the handoff is actually landing on, before trusting it as
 * a post-login redirect target — never pass an unvalidated return_to through,
 * that's an open redirect. Returns just the path+search portion (safe to
 * append to the destination's own origin) or null if it doesn't resolve to
 * that exact host.
 */
export function safeReturnToPath(returnTo: string | null | undefined, destinationHost: string): string | null {
  if (!returnTo) return null;
  try {
    const parsed = new URL(returnTo);
    if (parsed.host !== destinationHost) return null;
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return `${parsed.pathname}${parsed.search}` || '/';
  } catch {
    return null;
  }
}

/** Builds the /auth/storefront-handoff URL a buyer's browser redeems the
 * single-use magic-link token on, optionally carrying a validated return path. */
/** Central buyer login / workspace-finder origin (catalog.useyukti.in). */
export function catalogHostForRequest(hostHeader: string): string {
  const hostKind = parseRequestHost(hostHeader);
  if (hostKind.kind !== 'local' && 'suffix' in hostKind && isLocalStorefrontSuffix(hostKind.suffix)) {
    const port = extractPort(hostHeader);
    return `catalog.${LOCAL_STOREFRONT_SUFFIX}${port ? `:${port}` : ''}`;
  }
  return `catalog.${CANONICAL_STOREFRONT_SUFFIX}`;
}

export function catalogOriginForRequest(hostHeader: string): string {
  const host = catalogHostForRequest(hostHeader);
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

export function buildStorefrontHandoffUrl(
  destinationHost: string,
  hashedToken: string,
  returnTo?: string | null,
): string {
  const protocol = destinationHost.includes('localhost') ? 'http' : 'https';
  const url = new URL(`${protocol}://${destinationHost}/auth/storefront-handoff`);
  url.searchParams.set('token_hash', hashedToken);
  const safePath = safeReturnToPath(returnTo, destinationHost);
  if (safePath) {
    url.searchParams.set('next', safePath);
  }
  return url.toString();
}
