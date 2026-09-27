#!/usr/bin/env node

// One-time consolidation: before the buyer-identity fix (findExistingAuthUserIdForPhone
// in src/lib/server/buyer-access.ts), every app.buyers / app.buyer_users row got its
// own fresh auth.users identity, even when the same phone already had one from a
// different tenant/business relationship. This finds phones with more than one linked
// auth.users id, picks the earliest-created as canonical, repoints every buyers.user_id
// / buyer_users.user_id reference to it, and deletes the now-redundant auth.users rows.
//
// Safe by default: dry-run unless --apply is passed. Idempotent — a phone with only
// one linked auth.users id after a prior run is skipped.
//
// Usage: node scripts/consolidate-duplicate-buyer-auth-users.mjs [--apply]

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

const DRY_RUN = !process.argv.includes('--apply');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchLinkedRows(table, columns) {
  const { data, error } = await admin
    .schema('app')
    .from(table)
    .select(columns)
    .not('user_id', 'is', null)
    .not('phone', 'is', null);
  if (error) throw new Error(`${table} fetch failed: ${error.message}`);
  return data ?? [];
}

async function main() {
  console.log(`[consolidate-duplicate-buyer-auth-users] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} mode`);

  const [buyerRows, buyerUserRows] = await Promise.all([
    fetchLinkedRows('buyers', 'id, phone, user_id, created_at'),
    fetchLinkedRows('buyer_users', 'id, phone, user_id, created_at'),
  ]);

  // phone -> { buyers: [{id, user_id, created_at}], buyer_users: [...] }
  const byPhone = new Map();
  for (const row of buyerRows) {
    const entry = byPhone.get(row.phone) ?? { buyers: [], buyer_users: [] };
    entry.buyers.push(row);
    byPhone.set(row.phone, entry);
  }
  for (const row of buyerUserRows) {
    const entry = byPhone.get(row.phone) ?? { buyers: [], buyer_users: [] };
    entry.buyer_users.push(row);
    byPhone.set(row.phone, entry);
  }

  let phonesWithDupes = 0;
  let authUsersToDelete = 0;

  for (const [phone, entry] of byPhone) {
    const userIds = new Set([
      ...entry.buyers.map((r) => r.user_id),
      ...entry.buyer_users.map((r) => r.user_id),
    ]);
    if (userIds.size <= 1) continue;

    phonesWithDupes += 1;

    // Canonical = earliest-created row's user_id across both tables.
    const allRows = [...entry.buyers, ...entry.buyer_users].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const canonicalUserId = allRows[0].user_id;
    const redundantUserIds = [...userIds].filter((id) => id !== canonicalUserId);
    authUsersToDelete += redundantUserIds.length;

    console.log(`\nPhone ${phone}: ${userIds.size} auth.users, canonical=${canonicalUserId}`);
    console.log(`  redundant: ${redundantUserIds.join(', ')}`);

    const buyersToRepoint = entry.buyers.filter((r) => r.user_id !== canonicalUserId);
    const buyerUsersToRepoint = entry.buyer_users.filter((r) => r.user_id !== canonicalUserId);

    if (DRY_RUN) {
      console.log(`  would repoint ${buyersToRepoint.length} buyers row(s), ${buyerUsersToRepoint.length} buyer_users row(s)`);
      continue;
    }

    for (const row of buyersToRepoint) {
      const { error } = await admin
        .schema('app')
        .from('buyers')
        .update({ user_id: canonicalUserId })
        .eq('id', row.id);
      if (error) throw new Error(`Failed to repoint buyers.id=${row.id}: ${error.message}`);
    }

    for (const row of buyerUsersToRepoint) {
      const { error } = await admin
        .schema('app')
        .from('buyer_users')
        .update({ user_id: canonicalUserId })
        .eq('id', row.id);
      if (error) throw new Error(`Failed to repoint buyer_users.id=${row.id}: ${error.message}`);
    }

    for (const userId of redundantUserIds) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        // Non-fatal — the FK repoint above already succeeded, so no data is
        // orphaned; a stray auth.users row can be cleaned up by re-running.
        console.warn(`  warning: failed to delete auth.users id=${userId}: ${error.message}`);
      } else {
        console.log(`  deleted redundant auth.users id=${userId}`);
      }
    }
  }

  console.log(`\nDone. Phones with duplicate identities: ${phonesWithDupes}. auth.users rows ${DRY_RUN ? 'that would be' : ''} removed: ${authUsersToDelete}.`);
  if (DRY_RUN) {
    console.log('Re-run with --apply to make changes.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
