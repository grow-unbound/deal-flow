#!/usr/bin/env node

// Read-only. Reports the scale and recency of duplicate (tenant_id, phone)
// buyer identities — see item #7 in the buyer-auth cleanup plan. Does not
// modify anything; safe to run against dev or prod at any time to re-check
// whether the dupe count is still growing.
//
// Usage: node scripts/verify-duplicate-buyer-phones.mjs

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

function loadRootEnvLocal() {
  const dotenvPath = path.join(repoRoot, '.env.local');
  try {
    const raw = readFileSync(dotenvPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`Warning: could not read ${dotenvPath}: ${error.message}`);
    }
  }
}

loadRootEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PAGE_SIZE = 1000;

/** PosthREST caps unpaginated selects at ~1000 rows — page through everything. */
async function fetchAll(build) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await build().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

// Cutoff used to distinguish "artifact of the 11 Aug identity migration" from
// "still actively forming" — adjust if re-running much later and you want a
// different recency window.
const RECURRENCE_CUTOFF = '2026-08-11';

async function summarize(table, rows, keyFields) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFields.map((f) => row[f]).join('::');
    const entry = groups.get(key) ?? [];
    entry.push(row);
    groups.set(key, entry);
  }

  const dupeGroups = [...groups.values()].filter((g) => g.length > 1);
  const totalRows = dupeGroups.reduce((sum, g) => sum + g.length, 0);
  const cutoffTime = new Date(RECURRENCE_CUTOFF).getTime();
  const groupsTouchingPostCutoff = dupeGroups.filter((g) =>
    g.some((r) => new Date(r.created_at).getTime() > cutoffTime),
  ).length;
  const externalRefs = dupeGroups.flatMap((g) => g.map((r) => r.external_ref).filter(Boolean));
  const distinctExternalRefs = new Set(externalRefs).size;

  const dates = dupeGroups.flatMap((g) => g.map((r) => new Date(r.created_at).getTime()));
  const earliest = dates.length ? new Date(Math.min(...dates)).toISOString() : null;
  const latest = dates.length ? new Date(Math.max(...dates)).toISOString() : null;

  console.log(`\n${table}:`);
  console.log(`  dupe groups: ${dupeGroups.length}`);
  console.log(`  total rows in dupe groups: ${totalRows}`);
  console.log(`  groups with a row created after ${RECURRENCE_CUTOFF}: ${groupsTouchingPostCutoff}`);
  console.log(`  external_ref: ${externalRefs.length} with a value, ${distinctExternalRefs} distinct`
    + (externalRefs.length && externalRefs.length === distinctExternalRefs
      ? ' (every dupe row is a DIFFERENT Zoho contact sharing a phone — not repeated syncs of one contact)'
      : externalRefs.length ? ' (some external_refs repeat — could indicate a sync-upsert bug)' : ''));
  console.log(`  date range: ${earliest ?? 'n/a'} .. ${latest ?? 'n/a'}`);

  return { dupeGroups: dupeGroups.length, totalRows, groupsTouchingPostCutoff };
}

async function main() {
  console.log(`Duplicate buyer-phone verification — cutoff ${RECURRENCE_CUTOFF}\n`);

  const buyers = await fetchAll(() =>
    admin
      .schema('app')
      .from('buyers')
      .select('tenant_id, phone, external_ref, created_at')
      .not('phone', 'is', null)
      .is('deleted_at', null)
      .order('id'),
  );

  const buyerUsersRaw = await fetchAll(() =>
    admin
      .schema('app')
      .from('buyer_users')
      .select('buyer_id, phone, external_ref, created_at, buyers!inner(tenant_id)')
      .not('phone', 'is', null)
      .is('deleted_at', null)
      .order('id'),
  );

  const buyerUsers = (buyerUsersRaw ?? []).map((row) => ({
    ...row,
    tenant_id: row.buyers?.tenant_id ?? null,
  }));

  console.log(`Fetched ${buyers.length} app.buyers rows, ${buyerUsers.length} app.buyer_users rows.`);

  const buyersSummary = await summarize('app.buyers (tenant_id, phone)', buyers ?? [], ['tenant_id', 'phone']);
  const buyerUsersSummary = await summarize('app.buyer_users (tenant_id via buyer, phone)', buyerUsers, ['tenant_id', 'phone']);

  console.log('\nVerdict:');
  const stillForming = buyersSummary.groupsTouchingPostCutoff > 0 || buyerUsersSummary.groupsTouchingPostCutoff > 0;
  if (stillForming) {
    console.log('  Still forming post-cutoff — do NOT run a one-time merge script as if this were closed.');
    console.log('  Needs a product decision on whether same-phone-different-Zoho-contact should ever collapse to one buyer.');
  } else {
    console.log('  No dupe groups touched after the cutoff — consistent with a one-time historical artifact.');
    console.log('  Safe to proceed with a one-time merge/cleanup if desired.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
