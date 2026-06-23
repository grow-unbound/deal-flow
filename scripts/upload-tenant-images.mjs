#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
const R2_PUBLIC_URL =
  (process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_BASE_URL ?? '').replace(/\/+$/, '');
const WEBP_QUALITY = Number(process.env.WEBP_QUALITY ?? '85');
const DEFAULT_CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY ?? '4'));
const ENV_DRY_RUN = process.env.DRY_RUN === '1';

const VALID_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const IMAGE_MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const ENTITY_VARIANTS = {
  brands: ['thumb', 'medium'],
  categories: ['thumb', 'medium'],
  products: ['thumb', 'small', 'medium', 'large'],
};

const ENTITY_FLATTEN_ON_WHITE = {
  brands: false,
  categories: false,
  products: true,
};

const VARIANT_SIZES = {
  thumb: 120,
  small: 320,
  medium: 640,
  large: 1200,
};

function usage(exitCode = 1) {
  console.log('Usage: node scripts/upload-tenant-images.mjs <tenant_id> <images_folder_path> [--dry-run] [--concurrency=N]');
  process.exit(exitCode);
}

function parseArgs(argv) {
  const positional = [];
  let dryRun = ENV_DRY_RUN;
  let concurrency = DEFAULT_CONCURRENCY;

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      usage(0);
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg.startsWith('--concurrency=')) {
      const value = Number(arg.slice('--concurrency='.length));
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid concurrency value: ${arg}`);
      }
      concurrency = Math.max(1, Math.floor(value));
      continue;
    }
    positional.push(arg);
  }

  return { dryRun, concurrency, positional };
}

function normalizeLookup(value) {
  return value.trim().toLowerCase();
}

function sanitizeSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function encodePublicUrl(baseUrl, key) {
  if (!baseUrl) return key;
  const encodedPath = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${baseUrl}/${encodedPath}`;
}

async function loadSharp() {
  const candidates = [
    'sharp',
    pathToFileURL(path.join(repoRoot, 'workers/yukti-image-worker/node_modules/sharp/lib/index.js')).href,
    pathToFileURL(
      path.join(repoRoot, 'workers/yukti-image-worker/node_modules/@img/sharp-wasm32/lib/index.js'),
    ).href,
  ];

  for (const candidate of candidates) {
    try {
      const mod = await import(candidate);
      return mod.default ?? mod;
    } catch {
      continue;
    }
  }

  throw new Error(
    'Unable to load sharp. Install dependencies in workers/yukti-image-worker or make sharp available in the workspace.',
  );
}

function createSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error(
      'Missing required env vars: SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY',
    );
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
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

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function walkImageFiles(rootDir) {
  const files = [];

  async function walk(currentDir, relParts = []) {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory() && entry.name.endsWith('_resized')) continue;

      const fullPath = path.join(currentDir, entry.name);
      const nextRelParts = [...relParts, entry.name];

      if (entry.isDirectory()) {
        await walk(fullPath, nextRelParts);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!VALID_IMAGE_EXTENSIONS.has(ext)) continue;

      files.push({
        fullPath,
        relativePath: path.join(...nextRelParts),
        ext,
      });
    }
  }

  await walk(rootDir);
  return files;
}

function getGroupKey(entityType, relativePath) {
  const parts = relativePath.split(path.sep).filter(Boolean);
  if (parts.length === 0) return null;

  if (parts[0] === `${entityType}_resized`) {
    return null;
  }

  if (parts.length === 1) {
    return path.basename(parts[0], path.extname(parts[0]));
  }

  const firstSegment = parts[0];
  if (firstSegment === entityType) {
    if (parts.length >= 3) {
      return parts[1];
    }
    return path.basename(parts[0], path.extname(parts[0]));
  }

  return firstSegment;
}

function groupFilesByKey(entityType, files) {
  const groups = new Map();

  for (const file of files) {
    const key = getGroupKey(entityType, file.relativePath);
    if (!key) continue;
    const normalized = normalizeLookup(key);
    if (!groups.has(normalized)) {
      groups.set(normalized, {
        key,
        files: [],
      });
    }
    groups.get(normalized).files.push(file);
  }

  for (const group of groups.values()) {
    group.files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  return groups;
}

async function fetchRows(db, schema, table, select, tenantId, orderColumn) {
  const rows = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await db
      .schema(schema)
      .from(table)
      .select(select)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order(orderColumn, { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to fetch ${schema}.${table}: ${error.message}`);
    }

    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function resolveActorId(db, tenantId) {
  const { data, error } = await db
    .schema('app')
    .from('tenant_users')
    .select('user_id, role, deleted_at')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('role', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve tenant actor: ${error.message}`);
  }

  return data?.user_id ?? null;
}

function buildMaps(rows, keyField) {
  const map = new Map();
  for (const row of rows) {
    const rawKey = row[keyField];
    if (!rawKey) continue;
    const normalized = normalizeLookup(String(rawKey));
    if (!map.has(normalized)) {
      map.set(normalized, row);
    }
  }
  return map;
}

function buildOriginalKey(tenantId, entityType, entityId, ext) {
  return `tenants/${tenantId}/${entityType}/${entityId}/original${ext}`;
}

function buildVariantKey(tenantId, entityType, entityId, variant) {
  return `tenants/${tenantId}/${entityType}/${entityId}/${variant}.webp`;
}

async function resizeVariant(sharp, inputBuffer, outputPath, size, flattenOnWhite) {
  const pipeline = sharp(inputBuffer).resize(size, size, {
    fit: 'cover',
    position: 'centre',
  });

  const processed = flattenOnWhite
    ? pipeline.flatten({ background: '#ffffff' }).webp({ quality: WEBP_QUALITY })
    : pipeline.webp({ quality: WEBP_QUALITY });

  await processed.toFile(outputPath);
}

async function uploadBuffer(r2, key, body, contentType) {
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

async function processCandidate({
  db,
  r2,
  sharp,
  tenantId,
  entityType,
  row,
  candidate,
  tempRoot,
  actorId,
  dryRun,
}) {
  const entityFolder = entityType;
  const resizedDir = path.join(tempRoot, row.id);
  await ensureDir(resizedDir);

  const sourceBuffer = await fs.readFile(candidate.fullPath);
  const sourceExt = path.extname(candidate.fullPath).toLowerCase() || '.jpg';
  const mimeType = IMAGE_MIME_BY_EXT[sourceExt] ?? 'application/octet-stream';

  const originalKey = buildOriginalKey(tenantId, entityFolder, row.id, sourceExt);
  const originalUrl = encodePublicUrl(R2_PUBLIC_URL, originalKey);

  const variantNames = ENTITY_VARIANTS[entityType];
  const flattenOnWhite = ENTITY_FLATTEN_ON_WHITE[entityType];
  const variantMeta = [];

  for (const variant of variantNames) {
    const size = VARIANT_SIZES[variant];
    const baseName = sanitizeSegment(path.basename(candidate.relativePath, sourceExt));
    const tempPath = path.join(resizedDir, `${baseName}-${variant}.webp`);
    const key = buildVariantKey(tenantId, entityFolder, row.id, variant);
    variantMeta.push({ variant, size, tempPath, key });
  }

  if (!dryRun) {
    if (!r2) {
      throw new Error('R2 client not initialized.');
    }
    await uploadBuffer(r2, originalKey, sourceBuffer, mimeType);
  }

  const urls = {
    original: originalUrl,
  };

  for (const meta of variantMeta) {
    if (dryRun) {
      urls[meta.variant] = encodePublicUrl(R2_PUBLIC_URL, meta.key);
      continue;
    }

    await resizeVariant(sharp, sourceBuffer, meta.tempPath, meta.size, flattenOnWhite);
    const resizedBuffer = await fs.readFile(meta.tempPath);
    await uploadBuffer(r2, meta.key, resizedBuffer, 'image/webp');
    urls[meta.variant] = encodePublicUrl(R2_PUBLIC_URL, meta.key);
  }

  const primaryUrl =
    entityType === 'products' || entityType === 'brands'
      ? urls.medium ?? urls.original
      : undefined;

  if (!dryRun) {
    const updatedByPatch = actorId ? { updated_by: actorId } : {};

    if (entityType === 'products') {
      const { error } = await db
        .schema('app')
        .from('tenant_products')
        .update({
          ...updatedByPatch,
          r2_original_key: originalKey,
          r2_large_key: buildVariantKey(tenantId, entityFolder, row.id, 'large'),
          r2_medium_key: buildVariantKey(tenantId, entityFolder, row.id, 'medium'),
          r2_small_key: buildVariantKey(tenantId, entityFolder, row.id, 'small'),
          r2_thumb_key: buildVariantKey(tenantId, entityFolder, row.id, 'thumb'),
          image_urls: primaryUrl ? [primaryUrl] : [],
        })
        .eq('id', row.id)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new Error(`Failed to update app.tenant_products: ${error.message}`);
      }
    } else if (entityType === 'brands') {
      const { error } = await db
        .schema('app')
        .from('tenant_brands')
        .update({
          ...updatedByPatch,
          r2_logo_original_key: originalKey,
          r2_logo_medium_key: buildVariantKey(tenantId, entityFolder, row.id, 'medium'),
          r2_logo_thumb_key: buildVariantKey(tenantId, entityFolder, row.id, 'thumb'),
          logo_url: primaryUrl ?? null,
        })
        .eq('id', row.id)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new Error(`Failed to update app.tenant_brands: ${error.message}`);
      }
    } else if (entityType === 'categories') {
      const { error } = await db
        .schema('app')
        .from('tenant_categories')
        .update({
          ...updatedByPatch,
          r2_image_original_key: originalKey,
          r2_image_medium_key: buildVariantKey(tenantId, entityFolder, row.id, 'medium'),
          r2_image_thumb_key: buildVariantKey(tenantId, entityFolder, row.id, 'thumb'),
        })
        .eq('id', row.id)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new Error(`Failed to update app.tenant_categories: ${error.message}`);
      }
    }
  }

  return { urls, originalKey };
}

async function runWithConcurrency(items, concurrency, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      await worker(items[current], current);
    }
  });
  await Promise.all(runners);
}

function createStats() {
  return {
    scannedFiles: 0,
    unmatchedGroups: 0,
    matchedGroups: 0,
    updated: 0,
    failed: 0,
    partial: 0,
    retries: 0,
  };
}

function logSummary(label, stats, missingKeys, errorSamples) {
  console.log(`\n${label} summary`);
  console.log(`- Scanned files: ${stats.scannedFiles}`);
  console.log(`- Matched groups: ${stats.matchedGroups}`);
  console.log(`- Unmatched groups: ${stats.unmatchedGroups}`);
  console.log(`- Updated rows: ${stats.updated}`);
  console.log(`- Partial failures: ${stats.partial}`);
  console.log(`- Failed rows: ${stats.failed}`);
  console.log(`- Retry attempts: ${stats.retries}`);

  if (missingKeys.length > 0) {
    console.log('- Missing matches (first 50):');
    for (const key of missingKeys.slice(0, 50)) {
      console.log(`  - ${key}`);
    }
  }

  if (errorSamples.length > 0) {
    console.log('- Errors (first 25):');
    for (const err of errorSamples.slice(0, 25)) {
      console.log(`  - ${err}`);
    }
  }
}

async function processEntityType({
  db,
  r2,
  sharp,
  tenantId,
  rootDir,
  entityType,
  rowMap,
  actorId,
  dryRun,
  concurrency,
}) {
  const stats = createStats();
  const missingKeys = [];
  const errorSamples = [];
  const tempRoot = path.join(rootDir, `${entityType}_resized`);
  const sourceDir = path.join(rootDir, entityType);

  const files = await walkImageFiles(sourceDir);
  stats.scannedFiles = files.length;

  if (files.length === 0) {
    console.log(`\n${entityType}: no source files found in ${sourceDir}`);
    logSummary(entityType, stats, missingKeys, errorSamples);
    return;
  }

  const groups = groupFilesByKey(entityType, files);
  await ensureDir(tempRoot);

  const groupEntries = Array.from(groups.values());
  console.log(`\n${entityType}: ${files.length} source file(s), ${groupEntries.length} group(s)`);

  await runWithConcurrency(groupEntries, concurrency, async (group, index) => {
    const row = rowMap.get(normalizeLookup(group.key));
    if (!row) {
      stats.unmatchedGroups += 1;
      missingKeys.push(`${entityType}:${group.key}`);
      console.warn(`[skip] ${entityType} ${group.key}: no tenant match`);
      return;
    }

    stats.matchedGroups += 1;
    console.log(
      `[start] ${entityType} ${group.key} -> ${row.id} (${index + 1}/${groupEntries.length}, ${group.files.length} candidate file(s))`,
    );

    let success = false;
    let lastError = null;

    for (let attempt = 0; attempt < group.files.length; attempt += 1) {
      const candidate = group.files[attempt];
      try {
        const result = await processCandidate({
          db,
          r2,
          sharp,
          tenantId,
          entityType,
          row,
          candidate,
          tempRoot,
          actorId,
          dryRun,
        });

        success = true;
        console.log(
          `[ok] ${entityType} ${group.key}: uploaded from ${candidate.relativePath} -> ${result.originalKey}`,
        );
        break;
      } catch (error) {
        stats.retries += 1;
        lastError = error instanceof Error ? error.message : String(error);
        errorSamples.push(`${entityType}:${group.key}:${path.basename(candidate.relativePath)} -> ${lastError}`);
        console.warn(`[retry] ${entityType} ${group.key}: ${path.basename(candidate.relativePath)} failed: ${lastError}`);
      }
    }

    if (!success) {
      stats.failed += 1;
      if (group.files.length > 1) {
        stats.partial += 1;
      }
      console.error(`[fail] ${entityType} ${group.key}: all candidate images failed`);
      if (lastError) {
        errorSamples.push(`${entityType}:${group.key}: final failure -> ${lastError}`);
      }
      return;
    }

    stats.updated += 1;
  });

  logSummary(entityType, stats, missingKeys, errorSamples);
}

async function main() {
  const { dryRun, concurrency, positional } = parseArgs(process.argv.slice(2));
  const [tenantId, imagesFolderPath] = positional;

  if (!tenantId || !imagesFolderPath) usage(1);
  if (!dryRun && !R2_PUBLIC_URL) {
    throw new Error('Missing required env var: R2_PUBLIC_URL or NEXT_PUBLIC_R2_BASE_URL');
  }

  const rootDir = path.resolve(imagesFolderPath);
  const db = createSupabaseClient();
  const r2 = dryRun ? null : createR2Client();
  const sharp = await loadSharp();

  const { data: tenantRow, error: tenantError } = await db
    .schema('app')
    .from('tenants')
    .select('id, slug, business_name, deleted_at')
    .eq('id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (tenantError) {
    throw new Error(`Failed to load tenant ${tenantId}: ${tenantError.message}`);
  }
  if (!tenantRow) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  const actorId = await resolveActorId(db, tenantId);

  console.log('Tenant image bulk uploader');
  console.log(`- tenant_id: ${tenantId}`);
  console.log(`- tenant: ${tenantRow.business_name ?? tenantRow.slug ?? tenantId}`);
  console.log(`- images_folder_path: ${rootDir}`);
  console.log(`- dry_run: ${dryRun ? 'yes' : 'no'}`);
  console.log(`- concurrency: ${concurrency}`);
  console.log(`- bucket: ${R2_BUCKET_NAME}`);
  console.log(`- public_base_url: ${R2_PUBLIC_URL || '(unset, will fall back to raw keys)'}`);

  const brandRows = await fetchRows(
    db,
    'app',
    'tenant_brands',
    'id, tenant_id, slug, deleted_at, updated_at',
    tenantId,
    'slug',
  );
  const categoryRows = await fetchRows(
    db,
    'app',
    'tenant_categories',
    'id, tenant_id, slug, deleted_at, updated_at',
    tenantId,
    'slug',
  );
  const productRows = await fetchRows(
    db,
    'app',
    'tenant_products',
    'id, tenant_id, internal_sku, deleted_at, updated_at',
    tenantId,
    'internal_sku',
  );

  const brandMap = buildMaps(brandRows, 'slug');
  const categoryMap = buildMaps(categoryRows, 'slug');
  const productMap = buildMaps(productRows, 'internal_sku');

  console.log(`- loaded ${brandMap.size} tenant brand(s)`);
  console.log(`- loaded ${categoryMap.size} tenant category(ies)`);
  console.log(`- loaded ${productMap.size} tenant product(s)`);

  await Promise.all([
    processEntityType({
      db,
      r2,
      sharp,
      tenantId,
      rootDir,
      entityType: 'brands',
      rowMap: brandMap,
      actorId,
      dryRun,
      concurrency,
    }),
    processEntityType({
      db,
      r2,
      sharp,
      tenantId,
      rootDir,
      entityType: 'categories',
      rowMap: categoryMap,
      actorId,
      dryRun,
      concurrency,
    }),
    processEntityType({
      db,
      r2,
      sharp,
      tenantId,
      rootDir,
      entityType: 'products',
      rowMap: productMap,
      actorId,
      dryRun,
      concurrency,
    }),
  ]);

  console.log('\nDone.');
}

main().catch((error) => {
  console.error('\nFatal error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
