#!/usr/bin/env -S npx tsx
// One-time backfill: pull Zoho invoices that still carry a balance and are
// dated BEFORE the current Indian financial year, persist them, then hydrate
// their line items via the existing sync-transaction-line-items function.
//
// WHY THIS EXISTS
// ---------------
// The regular sync deliberately never asks Zoho for anything older than the
// financial year. supabase/functions/_shared/integrations-zoho.ts computes
// date_start = financialYearStart() for transactional entities, which from July
// onward is April 1 of the current calendar year. So app.invoices legitimately
// holds almost nothing before 2026-04-01 -- the designed window, not a failure.
//
// That window is right for period metrics but wrong for balances. Receivables
// and overdue are all-time figures: an invoice raised in January 2025 that is
// still unpaid belongs in today's outstanding total.
//
// This script does NOT modify the sync workflow, its edge functions, or its
// job/cursor tables. Phase 1 reads Zoho directly and upserts headers. Phase 2
// *invokes* sync-transaction-line-items, which its own header documents as the
// supported path for "controlled manual backfills ... calling this function
// DIRECTLY, bypassing the orchestrator, so the caller controls pacing".
//
// TERMINATION (this is the part that hung in the first version)
// Results are requested sorted by date ASCENDING and the walk stops the moment
// a record lands on/after the cutoff. That makes correctness independent of
// whether Zoho honours date_end -- worst case we read a few extra pages. There
// is also a hard page cap and a has_more fallback of `rows >= per_page`,
// matching nextCursorFromPage() in integrations-zoho.ts. The first version
// relied solely on page_context.has_more_page with no date-based stop, so on an
// org with 61k+ invoices it walked the entire history.
//
// Usage:
//   npx tsx scripts/backfill-zoho-open-invoices-pre-fy.ts <tenant_integration_id>
//   npx tsx scripts/backfill-zoho-open-invoices-pre-fy.ts <id> --from=2025-01-01 --apply
//   npx tsx scripts/backfill-zoho-open-invoices-pre-fy.ts <id> --filter-by=Status.All --apply
//   npx tsx scripts/backfill-zoho-open-invoices-pre-fy.ts <id> --apply --skip-line-items
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
const DISPATCH_SECRET = process.env.INTEGRATIONS_DISPATCH_SECRET ?? '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local');
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const tenantIntegrationId = process.argv[2];
if (!tenantIntegrationId || tenantIntegrationId.startsWith('--')) {
  throw new Error(
    'Usage: npx tsx scripts/backfill-zoho-open-invoices-pre-fy.ts <tenant_integration_id> ' +
      '[--from=YYYY-MM-DD] [--before=YYYY-MM-DD] [--filter-by=A,B] [--max-pages=N] [--skip-line-items] [--apply]',
  );
}
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const APPLY = process.argv.includes('--apply');
const SKIP_LINE_ITEMS = process.argv.includes('--skip-line-items');
const MAX_PAGES = Number(arg('max-pages') ?? 400);

// Mirrors financialYearStart() in supabase/functions/_shared/integrations-zoho.ts.
function financialYearStart(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 4 && month <= 6) return `${year}-01-01`;
  if (month >= 7) return `${year}-04-01`;
  return `${year - 1}-04-01`;
}

const CUTOFF = arg('before') ?? financialYearStart(); // exclusive upper bound
const DATE_END = new Date(new Date(CUTOFF).getTime() - 86_400_000).toISOString().slice(0, 10);
// Lower bound. Cheap to set generously -- the ascending walk stops at CUTOFF
// regardless, and a tighter date_start just means fewer pages.
const DATE_START = arg('from') ?? '2024-04-01';

// Zoho's filter_by takes ONE value per request, so "all outstanding" needs
// several passes, deduped by invoice_id. Casing of the overdue variant differs
// between Zoho docs and deployments, so both spellings are attempted and a
// rejected filter is warned about rather than fatal. Pass
// --filter-by=Status.All for a single exhaustive (slower) pass.
const DEFAULT_FILTERS = ['Status.Unpaid', 'Status.PartiallyPaid', 'Status.Overdue', 'Status.OverDue'];
const FILTERS = (arg('filter-by') ?? DEFAULT_FILTERS.join(',')).split(',').map((s) => s.trim()).filter(Boolean);

const ZOHO_ACCOUNTS: Record<string, string> = {
  US: 'https://accounts.zoho.com', EU: 'https://accounts.zoho.eu', IN: 'https://accounts.zoho.in',
  AU: 'https://accounts.zoho.com.au', JP: 'https://accounts.zoho.jp', CA: 'https://accounts.zohocloud.ca',
};
const ZOHO_API: Record<string, string> = {
  US: 'https://www.zohoapis.com/books/v3', EU: 'https://www.zohoapis.eu/books/v3', IN: 'https://www.zohoapis.in/books/v3',
  AU: 'https://www.zohoapis.com.au/books/v3', JP: 'https://www.zohoapis.jp/books/v3', CA: 'https://www.zohoapis.ca/books/v3',
};

// Zoho Books allows 100 requests/minute per org.
const PAGE_PAUSE_MS = 700;
const PER_PAGE = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Zoho invoice status -> app.invoices.status. App vocabulary confirmed against
// existing rows: draft | sent | overdue | partially_paid | paid | void.
// app.invoice_status_has_receivable() counts sent/viewed/unpaid/partially_paid/
// overdue as carrying a receivable, so anything with a balance must map inside
// that set or it will not show up in outstanding.
function mapStatus(zohoStatus: string | undefined, balance: number): string {
  const s = (zohoStatus ?? '').toLowerCase();
  if (s === 'draft') return 'draft';
  if (s === 'void' || s === 'voided') return 'void';
  if (s === 'paid') return 'paid';
  if (s === 'overdue') return 'overdue';
  if (s === 'partially_paid' || s === 'partiallypaid') return 'partially_paid';
  if (s === 'sent' || s === 'viewed' || s === 'unpaid' || s === 'open') return 'sent';
  return balance > 0 ? 'sent' : 'paid';
}

async function fetchFiltered(
  apiBase: string, orgId: string, accessToken: string, filterBy: string,
): Promise<{ rows: Map<string, Record<string, unknown>>; scanned: number; rejected: boolean }> {
  const out = new Map<string, Record<string, unknown>>();
  let scanned = 0;
  let page = 1;

  for (;;) {
    if (page > MAX_PAGES) {
      console.warn(`  [${filterBy}] hit --max-pages=${MAX_PAGES}; stopping. Narrow --from or raise the cap.`);
      break;
    }
    const url = new URL(`${apiBase}/invoices`);
    url.searchParams.set('organization_id', orgId);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(PER_PAGE));
    url.searchParams.set('filter_by', filterBy);
    url.searchParams.set('date_start', DATE_START);
    url.searchParams.set('date_end', DATE_END);
    // Ascending by date is what makes the cutoff stop below reliable.
    url.searchParams.set('sort_column', 'date');
    url.searchParams.set('sort_order', 'A');

    const res = await fetch(url.toString(), { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } });
    if (res.status === 400) {
      console.warn(`  [${filterBy}] rejected by Zoho (400) -- skipping this filter.`);
      return { rows: out, scanned, rejected: true };
    }
    if (res.status === 429) {
      console.warn('  rate limited; backing off 30s');
      await sleep(30_000);
      continue;
    }
    if (!res.ok) throw new Error(`Zoho /invoices ${res.status}: ${await res.text()}`);

    const body = (await res.json()) as Record<string, unknown>;
    const rows = Array.isArray(body.invoices) ? (body.invoices as Record<string, unknown>[]) : [];
    scanned += rows.length;

    let reachedCutoff = false;
    for (const r of rows) {
      const invDate = String(r.date ?? '');
      if (invDate && invDate >= CUTOFF) { reachedCutoff = true; break; }
      if (!(Number(r.balance ?? 0) > 0)) continue;
      out.set(String(r.invoice_id), r);
    }

    process.stdout.write(`\r  [${filterBy}] page ${page}, scanned ${scanned}, kept ${out.size}   `);

    // Ascending order means everything past this point is out of range.
    if (reachedCutoff) break;

    const ctx = (body.page_context ?? {}) as Record<string, unknown>;
    const hasMore = typeof ctx.has_more_page === 'boolean' ? ctx.has_more_page : rows.length >= PER_PAGE;
    if (!hasMore || rows.length === 0) break;

    page += 1;
    await sleep(PAGE_PAUSE_MS);
  }
  process.stdout.write('\n');
  return { rows: out, scanned, rejected: false };
}

// Phase 2 -- drive the existing sync-transaction-line-items edge function over
// the same date window, following its documented manual-invocation contract:
// omit job_id on the first call, then resume with job_id + next_cursor.page
// until has_more is false.
async function hydrateLineItems(tenantIntegrationIdArg: string) {
  if (!DISPATCH_SECRET) {
    console.warn('\nINTEGRATIONS_DISPATCH_SECRET not set -- skipping line-item hydration.');
    console.warn('Run it yourself with:');
    console.warn(`  curl -X POST "$SUPABASE_URL/functions/v1/sync-transaction-line-items" \\`);
    console.warn(`    -H "Content-Type: application/json" -H "x-integrations-dispatch-secret: $INTEGRATIONS_DISPATCH_SECRET" \\`);
    console.warn(`    -d '{"tenant_integration_id":"${tenantIntegrationIdArg}","since":"${DATE_START}","until":"${DATE_END}","batch_size":50}'`);
    return;
  }

  console.log(`\nPhase 2: hydrating line items for ${DATE_START} .. ${DATE_END}`);
  let jobId: string | null = null;
  let pageFrom: number | null = null;
  let calls = 0;

  for (;;) {
    if (calls++ > MAX_PAGES) { console.warn('  line-item hydration hit page cap; re-run to continue.'); break; }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-transaction-line-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-integrations-dispatch-secret': DISPATCH_SECRET },
      body: JSON.stringify({
        tenant_integration_id: tenantIntegrationIdArg,
        since: DATE_START,
        until: DATE_END,
        batch_size: 50,
        ...(jobId ? { job_id: jobId } : {}),
        ...(pageFrom ? { page_from: pageFrom } : {}),
      }),
    });
    if (!res.ok) throw new Error(`sync-transaction-line-items ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as Record<string, unknown>;

    jobId = (body.job_id as string | undefined) ?? jobId;
    const cursor = (body.next_cursor ?? null) as Record<string, unknown> | null;
    const hasMore = Boolean(body.has_more);
    console.log(`  batch ${calls}: records_synced=${body.records_synced ?? '?'} has_more=${hasMore}`);
    if (!hasMore) break;
    pageFrom = typeof cursor?.page === 'number' ? (cursor.page as number) : null;
    if (pageFrom == null) { console.warn('  has_more true but no next_cursor.page; stopping.'); break; }
    await sleep(PAGE_PAUSE_MS);
  }
  console.log(`Line-item hydration finished (job_id=${jobId ?? 'n/a'}).`);
}

async function main() {
  console.log(`Window: ${DATE_START} .. ${DATE_END}  (cutoff exclusive: ${CUTOFF})`);
  console.log(`Filters: ${FILTERS.join(', ')}`);
  console.log(APPLY ? 'MODE: APPLY (will write)' : 'MODE: DRY RUN (no writes; pass --apply to write)');

  const { data: integration, error: intErr } = await db
    .schema('app').from('tenant_integrations')
    .select('id, tenant_id, integration_type_id, deleted_at')
    .eq('id', tenantIntegrationId).single();
  if (intErr || !integration) throw new Error(`tenant_integration not found: ${intErr?.message}`);
  if (integration.deleted_at) throw new Error('tenant_integration is soft-deleted');

  const { data: secret, error: secErr } = await db
    .schema('app').rpc('get_tenant_integration_runtime_secret', {
      p_tenant_integration_id: integration.id,
      p_expected_integration_type_id: integration.integration_type_id,
    });
  if (secErr || !secret) throw new Error(`Unable to load integration secret: ${secErr?.message}`);

  const { org_id, region, client_id, client_secret, refresh_token } = secret as Record<string, string>;
  const regionKey = (region ?? 'IN').toUpperCase();
  const accountsBase = ZOHO_ACCOUNTS[regionKey] ?? ZOHO_ACCOUNTS.IN;
  const apiBase = ZOHO_API[regionKey] ?? ZOHO_API.IN;

  const tokenRes = await fetch(`${accountsBase}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token, client_id, client_secret, grant_type: 'refresh_token' }),
  });
  const tokenJson = (await tokenRes.json()) as Record<string, unknown>;
  const accessToken = typeof tokenJson.access_token === 'string' ? tokenJson.access_token : null;
  if (!accessToken) throw new Error(`Zoho token refresh failed: ${JSON.stringify(tokenJson)}`);

  // Phase 1 -- headers.
  const merged = new Map<string, Record<string, unknown>>();
  let totalScanned = 0;
  let anyAccepted = false;
  for (const f of FILTERS) {
    const { rows, scanned, rejected } = await fetchFiltered(apiBase, org_id, accessToken, f);
    if (!rejected) anyAccepted = true;
    totalScanned += scanned;
    for (const [k, v] of rows) merged.set(k, v);
    await sleep(PAGE_PAUSE_MS);
  }
  if (!anyAccepted) {
    throw new Error(`Every filter was rejected by Zoho. Re-run with --filter-by=Status.All`);
  }

  console.log(`\nZoho: scanned ${totalScanned} record(s); ${merged.size} distinct invoice(s) with balance > 0 before ${CUTOFF}`);
  if (merged.size === 0) { console.log('Nothing to do.'); return; }

  const collected = [...merged.values()];

  // Resolve Zoho customer_id -> app.buyers.id, and location/warehouse -> app.locations.id,
  // the same way persistZohoEntityPage does (rec.location_id ?? rec.warehouse_id).
  const customerIds = [...new Set(collected.map((r) => String(r.customer_id ?? '')).filter(Boolean))];
  const buyerByExternal = new Map<string, string>();
  for (let i = 0; i < customerIds.length; i += 500) {
    const { data, error } = await db.schema('app').from('buyers')
      .select('id, external_ref').eq('tenant_id', integration.tenant_id)
      .is('deleted_at', null).in('external_ref', customerIds.slice(i, i + 500));
    if (error) throw new Error(`buyer lookup failed: ${error.message}`);
    for (const b of data ?? []) buyerByExternal.set(String(b.external_ref), String(b.id));
  }

  const locationByExternal = new Map<string, string>();
  {
    const { data, error } = await db.schema('app').from('locations')
      .select('id, external_ref').eq('tenant_id', integration.tenant_id).is('deleted_at', null);
    if (error) throw new Error(`location lookup failed: ${error.message}`);
    for (const l of data ?? []) if (l.external_ref) locationByExternal.set(String(l.external_ref), String(l.id));
  }

  const rows: Record<string, unknown>[] = [];
  const unmatched: string[] = [];
  let withLocation = 0;
  for (const r of collected) {
    const buyerId = buyerByExternal.get(String(r.customer_id ?? ''));
    if (!buyerId) {
      unmatched.push(`${String(r.invoice_number ?? r.invoice_id)} (customer_id=${String(r.customer_id ?? '')})`);
      continue;
    }
    const locExternal = String(r.location_id ?? r.warehouse_id ?? '');
    const locationId = locExternal ? (locationByExternal.get(locExternal) ?? null) : null;
    if (locationId) withLocation += 1;

    const total = Number(r.total ?? 0);
    const balance = Number(r.balance ?? 0);
    rows.push({
      tenant_id: integration.tenant_id,
      buyer_id: buyerId,
      location_id: locationId,
      external_ref: String(r.invoice_id),
      invoice_number: String(r.invoice_number ?? r.invoice_id),
      invoice_date: String(r.date),
      due_date: r.due_date ? `${String(r.due_date)}T00:00:00+05:30` : null,
      status: mapStatus(r.status as string | undefined, balance),
      total_amount: total,
      outstanding_balance: balance,
      amount_paid: Math.max(0, total - balance),
    });
  }

  const dueTotal = rows.reduce((s, r) => s + Number(r.outstanding_balance ?? 0), 0);
  console.log(`Resolved ${rows.length} invoice(s) to known buyers; ${withLocation} with a location; outstanding total = ${dueTotal.toFixed(2)}`);
  if (unmatched.length) {
    console.warn(`\n${unmatched.length} invoice(s) SKIPPED -- Zoho customer not present in app.buyers:`);
    for (const u of unmatched.slice(0, 20)) console.warn(`  - ${u}`);
    if (unmatched.length > 20) console.warn(`  ... and ${unmatched.length - 20} more`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN -- no rows written. Sample:');
    console.table(rows.slice(0, 5));
    console.log(`\nRe-run with --apply to write ${rows.length} row(s) and hydrate their line items.`);
    return;
  }

  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await db.schema('app').from('invoices')
      .upsert(chunk, { onConflict: 'tenant_id,external_ref' });
    if (error) throw new Error(`upsert failed at offset ${i}: ${error.message}`);
    written += chunk.length;
    console.log(`  upserted ${written}/${rows.length}`);
  }
  console.log(`\nPhase 1 done. ${written} invoice header(s) written.`);

  if (!SKIP_LINE_ITEMS) await hydrateLineItems(integration.id);

  // Metrics need no manual step. Verified on this database:
  // trg_metrics_v2_capture_invoices and trg_metrics_v2_capture_invoice_items are
  // both ROW-level triggers firing on INSERT, UPDATE and DELETE, and both call
  // metrics_mark_dirty -- so every row written above is already queued in
  // app.metrics_dirty_work and the 15s tick will drain it.
  console.log('\nMetrics: no action needed.');
  console.log('  trg_metrics_v2_capture_invoices / _invoice_items fire on INSERT and call');
  console.log('  metrics_mark_dirty, so these rows are already queued in app.metrics_dirty_work.');
  console.log('  Expect a burst of dirty work across the historical days these invoices touch.');
  console.log('  Watch it drain:  SELECT state, count(*) FROM app.metrics_dirty_work GROUP BY 1;');
  console.log('\nVerify outstanding:');
  console.log('  SELECT count(*), sum(outstanding_balance) FROM app.invoices');
  console.log(`  WHERE tenant_id='${integration.tenant_id}' AND deleted_at IS NULL`);
  console.log(`    AND invoice_date < '${CUTOFF}' AND outstanding_balance > 0;`);
}

main().catch((err) => { console.error(err); process.exit(1); });
