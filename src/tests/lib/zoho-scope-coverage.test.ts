import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { getZohoOAuthScopes } from '@/lib/integrations/zoho-oauth';

// Guards the actual bug that motivated (and then un-motivated —
// see zoho-oauth.ts) trying ZohoBooks.fullaccess.all: a Zoho Books endpoint
// gets called from some sync-*/webhook edge function, but nobody remembers
// to add the matching OAuth scope, so every existing tenant connection
// 401s on it (Zoho error code 57) until they reconnect. customerpayments
// was exactly this, 2026-09-05.
//
// Every Zoho Books REST path prefix actually used in supabase/functions
// must map to a scope module below, and that module must appear in
// getZohoOAuthScopes('zoho_books'). Adding a new endpoint without adding
// its scope here (or to zoho-oauth.ts) fails this test instead of failing
// silently in production months later.
const PATH_PREFIX_TO_SCOPE: Record<string, string> = {
  '/contacts': 'ZohoBooks.contacts.ALL',
  '/items': 'ZohoBooks.items.ALL',
  '/salesorders': 'ZohoBooks.salesorders.ALL',
  '/invoices': 'ZohoBooks.invoices.ALL',
  '/estimates': 'ZohoBooks.estimates.ALL',
  '/customerpayments': 'ZohoBooks.customerpayments.ALL',
  // Org-level settings surface: webhooks/workflows registration, users,
  // price books/lists, and locations all live under Zoho Books "Settings".
  '/settings': 'ZohoBooks.settings.ALL',
  '/users': 'ZohoBooks.settings.ALL',
  '/pricebooks': 'ZohoBooks.settings.ALL',
  '/pricelists': 'ZohoBooks.settings.ALL',
  '/locations': 'ZohoBooks.settings.ALL',
  // Read-only org metadata — no module-specific scope required.
  '/organizations': null as unknown as string,
};

function findFunctionSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return findFunctionSourceFiles(fullPath);
    return entry.name.endsWith('.ts') ? [fullPath] : [];
  });
}

function extractZohoPathPrefixes(source: string): string[] {
  // Matches path: '/xyz' / path: `/xyz` / path: `/xyz/${var}` literals —
  // deliberately a broad regex over string literals rather than an AST
  // parse; false positives just mean a harmless unmapped-prefix failure
  // that a human resolves once, which is the point of this test.
  const matches = [...source.matchAll(/path:\s*[`'"](\/[a-zA-Z][a-zA-Z0-9/_{}$-]*)/g)];
  return matches.map((m) => `/${m[1].split('/')[1]}`);
}

describe('zoho books scope coverage', () => {
  it('has a scope mapping for every Zoho path prefix used in supabase/functions', () => {
    const functionsDir = path.join(process.cwd(), 'supabase/functions');
    const files = findFunctionSourceFiles(functionsDir);

    const foundPrefixes = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const prefix of extractZohoPathPrefixes(source)) {
        foundPrefixes.add(prefix);
      }
    }

    const unmapped = [...foundPrefixes].filter((prefix) => !(prefix in PATH_PREFIX_TO_SCOPE));
    expect(
      unmapped,
      `Found Zoho path prefix(es) with no entry in PATH_PREFIX_TO_SCOPE: ${unmapped.join(', ')}. ` +
        `Add them to this test's map and to ZOHO_OAUTH_SCOPES_BY_INTEGRATION.zoho_books in zoho-oauth.ts.`,
    ).toEqual([]);
  });

  it('grants every scope module that PATH_PREFIX_TO_SCOPE requires', () => {
    const grantedScopes = getZohoOAuthScopes('zoho_books').split(',');
    const requiredScopes = [...new Set(Object.values(PATH_PREFIX_TO_SCOPE).filter(Boolean))];

    for (const scope of requiredScopes) {
      expect(grantedScopes, `Missing required Zoho Books scope: ${scope}`).toContain(scope);
    }
  });
});
