#!/usr/bin/env node

// One-time backfill: moves app.integration_entity_map.source_payload (jsonb)
// out to R2 as a JSON file, recording the relative key in
// source_payload_r2_key. Idempotent/resumable — only processes rows still
// missing the key, so it's safe to interrupt and re-run.
//
// Usage: node scripts/backfill-entity-map-payloads-to-r2.mjs [--dry-run]

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
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

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? 'yukti-assets';

const BATCH_SIZE = 200;
const DRY_RUN = process.argv.includes('--dry-run');

function createSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error(
      'Missing required env vars: SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY',
    );
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function createR2Client() {
  if (!CLOUDFLARE_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error(
      'Missing required env vars: CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY',
    );
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

async function putObjectJson(r2, key, value) {
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(value),
      ContentType: 'application/json',
    }),
  );
}

function buildKey(tenantId, entityMapId) {
  return `integrations/${tenantId}/entity-map/${entityMapId}.json`;
}

async function fetchNextBatch(db) {
  const { data, error } = await db
    .schema('app')
    .from('integration_entity_map')
    .select('id, tenant_id, source_payload')
    .not('source_payload', 'is', null)
    .is('source_payload_r2_key', null)
    .order('id', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    throw new Error(`Failed to fetch integration_entity_map rows: ${error.message}`);
  }
  return data ?? [];
}

async function main() {
  const db = createSupabaseClient();
  const r2 = DRY_RUN ? null : createR2Client();

  console.log('Entity map source_payload -> R2 backfill');
  console.log(`- dry_run: ${DRY_RUN ? 'yes' : 'no'}`);
  console.log(`- bucket: ${R2_BUCKET_NAME}`);

  let processed = 0;
  let failed = 0;

  while (true) {
    const rows = await fetchNextBatch(db);
    if (rows.length === 0) break;

    for (const row of rows) {
      const key = buildKey(row.tenant_id, row.id);
      try {
        if (!DRY_RUN) {
          await putObjectJson(r2, key, row.source_payload);
          const { error: updateError } = await db
            .schema('app')
            .from('integration_entity_map')
            .update({ source_payload_r2_key: key })
            .eq('id', row.id);
          if (updateError) {
            throw new Error(`update failed: ${updateError.message}`);
          }
        }
        processed += 1;
        if (processed % 50 === 0) console.log(`[progress] ${processed} rows processed`);
      } catch (error) {
        failed += 1;
        console.error(`[fail] entity_map row ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (DRY_RUN) {
      // Dry-run never writes source_payload_r2_key, so the query would
      // return the same batch forever — stop after one batch preview.
      console.log(`[dry-run] would process ${rows.length} row(s) in this batch (showing first batch only)`);
      break;
    }
  }

  console.log('\nDone.');
  console.log(`- processed: ${processed}`);
  console.log(`- failed: ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('\nFatal error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
