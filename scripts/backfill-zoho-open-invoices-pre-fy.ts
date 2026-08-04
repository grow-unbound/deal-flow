#!/usr/bin/env -S npx tsx
// One-time backfill: pull Zoho invoices that still carry a balance and are
// dated BEFORE the current Indian financial year, and persist just enough of
// them to make the outstanding/overdue picture complete.
//
// WHY THIS EXISTS
// ---------------
// The regular sync deliberately never asks Zoho for anything older than the
// financial year. supabase/functions/_shared/integrations-zoho.ts computes
// date_start = financialYearStart() for transactional entities, which from July
// onward is April 1 of the current calendar year. So app.invoices legitimately
// holds almost nothing before 2026-04-01 -- that is the designed window, not a
// sync failure.
//
// That window is fine for period metrics (this month, this quarter) but wrong
// for balances. Receivables and overdue amounts are all-time figures: an
// invoice raised in January that is still unpaid belongs in today's outstanding
// total. Those invoices were never imported, so the figure was understated.
//
// This script does NOT touch the running sync workflow, its edge functions, or
// its job/cursor tables. It is a standalone read-from-Zoho / upsert-to-Postgres
// pass that can be run once and then forgotten.
//
// SCOPE -- deliberately narrow
//   * invoice HEADERS only, no line items. Outstanding is a header-level
//     figure (balance, due_date, status, buyer). Skipping items avoids the
//     expensive per-invoice hydration the real sync does, and keeps this from
//     touching product/brand/category metrics at all.
//   * only invoices with balance > 0. Fully-settled historical invoices cannot
//     affect any outstanding figure, so importing them would be noise.
//   * only invoice_date < the FY cutoff. Anything on/after it is already synced.
//
// WHAT PICKS IT UP AFTERWARDS
// app.invoices carries trg_metrics_v2_capture_invoices, which calls
// metrics_mark_dirty. Inserting rows therefore enqueues metrics work
// automatically -- no manual reconciliation needed. And because
// metrics_buyer_now_summary / metrics_location_now_summary are all-time
// aggregates rather than period-bounded ones, the outstanding figures correct
// themselves on the next tick without needing any pre-FY period rows to exist.
//
// Usage:
//   npx tsx scripts/backfill-zoho-open-invoices-pre-fy.ts <tenant_integration_id>
//   npx tsx scripts/backfill-zoho-open-invoices-pre-fy.ts <id> --apply
//   npx tsx scripts/backfill-zoho-open-invoices-pre-fy.ts <id> --before=2026-04-01 --apply
//
// Dry-run is the default. Nothing is written without --apply.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

function loadRootEnvLocal() {
  const dotenvPath = path.join(repoRoot, '.env.local');
  const raw = readFileSync(dotenvPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadRootEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local');
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const tenantIntegrationId = process.argv[2];
if (!tenantIntegrationId || tenantIntegrationId.startsWith('--')) {
  throw new Error(
    'Usage: npx tsx scripts/backfill-zoho-open-invoices-pre-fy.ts <tenant_integration_id> [--before=YYYY-MM-DD] [--apply]',
  );
}
const APPLY = process.argv.includes('--apply');
const beforeArg = process.argv.find((a) => a.startsWith('--before='))?.split('=')[1];

// Mirrors financialYearStart() in supabase/functions/_shared/integrations-zoho.ts.
// Anything on or after this date the normal sync already covers.
function financialYearStart(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 4 && month <= 6) return `${year}-01-01`;
  if (month >= 7) return `${year}-04-01`;
  return `${year - 1}-04-01`;
}

const CUTOFF = beforeArg ?? financialYearStart(); // exclusive
const DATE_END = new Date(new Date(CUTOFF).getTime() - 86_400_000).toISOString().slice(0, 10);

const ZOHO_ACCOUNTS: Record<string, string> = {
  US: 'https://accounts.zoho.com',
  EU: 'https://accounts.zoho.eu',
  IN: 'https://accounts.zoho.in',
  AU: 'https://accounts.zoho.com.au',
  JP: 'https://accounts.zoho.jp',
  CA: 'https://accounts.zohocloud.ca',
};
const ZOHO_API: Record<string, string> = {
  US: 'https://www.zohoapis.com/books/v3',
  EU: 'https://www.zohoapis.eu/books/v3',
  IN: 'https://www.zohoapis.in/books/v3',
  AU: 'https://www.zohoapis.com.au/books/v3',
  JP: 'https://www.zohoapis.jp/books/v3',
  CA: 'https://www.zohoapis.ca/books/v3',
};

// Zoho Books caps at 100 requests/minute per org. Sequential paging with a
// small pause keeps this comfortably inside that without needing the batching
// machinery the real sync uses.
const PAGE_PAUSE_MS = 700;
const PER_PAGE = 200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Zoho invoice status -> app.invoices.status. The app-side vocabulary is
// confirmed against existing rows: draft | sent | overdue | partially_paid |
// paid | void. app.invoice_status_has_receivable() treats sent/viewed/unpaid/
// partially_paid/overdue as carrying a receivable, so the mapping must land
// inside that set for anything with a balance.
function mapStatus(zohoStatus: string | undefined, balance: number): string {
  const s = (zohoStatus ?? '').toLowerCase();
  if (s === 'draft') return 'draft';
  if (s === 'void' || s === 'voided') return 'void';
  if (s === 'paid') return 'paid';
  if (s === 'overdue') return 'overdue';
  if (s === 'partially_paid' || s === 'partiallypaid') return 'partially_paid';
  if (s === 'sent' || s === 'viewed' || s === 'unpaid' || s === 'open') return 'sent';
  // Unknown status but money outstanding: fall back to 'sent' so it is counted
  // as a receivable rather than silently dropped out of the totals.
  return balance > 0 ? 'sent' : 'paid';
}

async function main() {
  console.log(`Cutoff (exclusive): ${CUTOFF}   -> fetching Zoho invoices dated <= ${DATE_END}`);
  console.log(APPLY ? 'MODE: APPLY (will write)' : 'MODE: DRY RUN (no writes; pass --apply to write)');

  const { data: integration, error: intErr } = await db
    .schema('app')
    .from('tenant_integrations')
    .select('id, tenant_id, integration_type_id, sync_suspended, deleted_at')
    .eq('id', tenantIntegrationId)
    .single();
  if (intErr || !integration) throw new Error(`tenant_integration not found: ${intErr?.message}`);
  if (integration.deleted_at) throw new Error('tenant_integration is soft-deleted');

  const { data: secret, error: secErr } = await db
    .schema('app')
    .rpc('get_tenant_integration_runtime_secret', {
      p_tenant_integration_id: integration.id,
      p_expected_integration_type_id: integration.integration_type_id,
    });
  if (secErr || !secret) throw new Error(`Unable to load integration secret: ${secErr?.message}`);

  const { org_id, region, client_id, client_secret, refresh_token } = secret as Record<string, string>;
  const regionKey = (region ?? 'IN').toUpperCase();
  const accountsBase = ZOHO_ACCOUNTS[regionKey] ?? ZOHO_ACCOUNTS.IN;
  const apiBase = ZOHO_API[regionKey] ?? ZOHO_API.IN;

  // OAuth: refresh token -> short-lived access token.
  const tokenRes = await fetch(`${accountsBase}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token,
      client_id,
      client_secret,
      grant_type: 'refresh_token',
    }),
  });
  const tokenJson = (await tokenRes.json()) as Record<string, unknown>;
  const accessToken = typeof tokenJson.access_token === 'string' ? tokenJson.access_token : null;
  if (!accessToken) throw new Error(`Zoho token refresh failed: ${JSON.stringify(tokenJson)}`);

  // Page through invoices. date_end is passed as a server-side filter, but every
  // record is ALSO checked client-side -- if Zoho ignores or misinterprets the
  // parameter we simply fetch more pages rather than importing the wrong rows.
  const collected: Record<string, unknown>[] = [];
  let page = 1;
  let scanned = 0;
  for (;;) {
    const url = new URL(`${apiBase}/invoices`);
    url.searchParams.set('organization_id', org_id);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(PER_PAGE));
    url.searchParams.set('date_end', DATE_END);
    url.searchParams.set('sort_column', 'date');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Zoho /invoices ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as Record<string, unknown>;
    const rows = Array.isArray(body.invoices) ? (body.invoices as Record<string, unknown>[]) : [];
    scanned += rows.length;

    for (const r of rows) {
      const invDate = String(r.date ?? '');
      const balance = Number(r.balance ?? 0);
      if (!invDate || invDate >= CUTOFF) continue; // defensive: honour cutoff locally
      if (!(balance > 0)) continue; // only dues
      collected.push(r);
    }

    const ctx = (body.page_context ?? {}) as Record<string, unknown>;
    if (!ctx.has_more_page) break;
    page += 1;
    await sleep(PAGE_PAUSE_MS);
  }

  console.log(`Zoho: scanned ${scanned} invoice(s) dated <= ${DATE_END}; ${collected.length} carry a balance > 0`);
  if (collected.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  // Resolve Zoho customer_id -> app.buyers.id. Customers are a full-fetch phase
  // in the normal sync, so these should almost all resolve; any that do not are
  // reported rather than silently written with a null buyer, because a null
  // buyer would land in tenant totals but vanish from per-buyer receivables.
  const customerIds = [...new Set(collected.map((r) => String(r.customer_id ?? '')).filter(Boolean))];
  const buyerByExternal = new Map<string, string>();
  for (let i = 0; i < customerIds.length; i += 500) {
    const chunk = customerIds.slice(i, i + 500);
    const { data, error } = await db
      .schema('app')
      .from('buyers')
      .select('id, external_ref')
      .eq('tenant_id', integration.tenant_id)
      .is('deleted_at', null)
      .in('external_ref', chunk);
    if (error) throw new Error(`buyer lookup failed: ${error.message}`);
    for (const b of data ?? []) buyerByExternal.set(String(b.external_ref), String(b.id));
  }

  const rows: Record<string, unknown>[] = [];
  const unmatched: string[] = [];
  for (const r of collected) {
    const customerId = String(r.customer_id ?? '');
    const buyerId = buyerByExternal.get(customerId);
    if (!buyerId) {
      unmatched.push(`${String(r.invoice_number ?? r.invoice_id)} (customer_id=${customerId})`);
      continue;
    }
    const total = Number(r.total ?? 0);
    const balance = Number(r.balance ?? 0);
    rows.push({
      tenant_id: integration.tenant_id,
      buyer_id: buyerId,
      external_ref: String(r.invoice_id),
      invoice_number: String(r.invoice_number ?? r.invoice_id),
      invoice_date: String(r.date),
      due_date: r.due_date ? `${String(r.due_date)}T00:00:00+05:30` : null,
      status: mapStatus(r.status as string | undefined, balance),
      total_amount: total,
      outstanding_balance: balance,
      amount_paid: Math.max(0, total - balance),
      // location_id is intentionally left null -- see the caveat printed below.
    });
  }

  const dueTotal = rows.reduce((s, r) => s + Number(r.outstanding_balance ?? 0), 0);
  console.log(`Resolved ${rows.length} invoice(s) to known buyers; outstanding total = ${dueTotal.toFixed(2)}`);
  if (unmatched.length) {
    console.warn(`\n${unmatched.length} invoice(s) SKIPPED -- Zoho customer not present in app.buyers:`);
    for (const u of unmatched.slice(0, 20)) console.warn(`  - ${u}`);
    if (unmatched.length > 20) console.warn(`  ... and ${unmatched.length - 20} more`);
    console.warn('Run the customers sync phase first if these matter, then re-run this script.\n');
  }

  if (!APPLY) {
    console.log('\nDRY RUN -- no rows written. Sample of what would be upserted:');
    console.table(rows.slice(0, 5));
    console.log(`\nRe-run with --apply to write ${rows.length} row(s).`);
    return;
  }

  // Upsert on the existing (tenant_id, external_ref) unique key so re-running is
  // idempotent and so any invoice the normal sync later picks up is updated
  // rather than duplicated.
  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await db
      .schema('app')
      .from('invoices')
      .upsert(chunk, { onConflict: 'tenant_id,external_ref' });
    if (error) throw new Error(`upsert failed at offset ${i}: ${error.message}`);
    written += chunk.length;
    console.log(`  upserted ${written}/${rows.length}`);
  }

  console.log(`\nDone. ${written} invoice(s) written.`);
  console.log('trg_metrics_v2_capture_invoices has enqueued metrics work; the 15s tick will pick it up.');
  console.log('\nCAVEATS:');
  console.log('  * location_id is NULL on these rows, so they contribute to tenant- and');
  console.log('    buyer-level outstanding but NOT to metrics_location_now_summary.overdue_amount.');
  console.log('  * No line items were imported, so product/brand/category metrics are untouched.');
  console.log('    That is deliberate: outstanding is a header-level figure.');
  console.log('  * Verify with:');
  console.log("      SELECT SUM(outstanding_balance) FROM app.invoices");
  console.log(`      WHERE tenant_id='${integration.tenant_id}' AND deleted_at IS NULL`);
  console.log(`        AND invoice_date < '${CUTOFF}' AND outstanding_balance > 0;`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
