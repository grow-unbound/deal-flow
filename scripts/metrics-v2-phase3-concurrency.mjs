#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const sqlDir = path.join(repoRoot, 'scripts/sql/metrics-v2-phase3');
const linkedRefPath = path.join(repoRoot, 'supabase/.temp/project-ref');
const poolerUrlPath = path.join(repoRoot, 'supabase/.temp/pooler-url');
const expectedRef = 'euhzgherjvjopjrpoqjr';
const phase3MigrationSuffix = '_metrics_v2_phase_3_manual_refresh_kernel.sql';
const command = process.argv[2] || 'help';

function fail(message) {
  throw new Error(`[metrics-v2-phase3] ${message}`);
}

function deterministicUuid(runId, key) {
  const hex = createHash('md5').update(`metrics-v2-phase3:${runId}:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

function readEnvFile(file) {
  if (!existsSync(file)) return {};
  const values = {};
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function phase3Migration() {
  const files = readdirSync(path.join(repoRoot, 'supabase/migrations'))
    .filter((file) => file.endsWith(phase3MigrationSuffix));
  if (files.length !== 1) {
    fail(`expected exactly one Phase 3 migration, found ${files.length}`);
  }
  return { file: files[0], version: files[0].slice(0, 14) };
}

function assertLinkedRef() {
  if (!existsSync(linkedRefPath)) fail(`missing linked project ref at ${linkedRefPath}`);
  const actual = readFileSync(linkedRefPath, 'utf8').trim();
  if (actual !== expectedRef) {
    fail(`linked ref mismatch: expected ${expectedRef}, got ${actual || '<empty>'}`);
  }
}

function connectionConfig() {
  assertLinkedRef();
  if (!existsSync(poolerUrlPath)) fail(`missing linked pooler configuration at ${poolerUrlPath}`);
  const url = new URL(readFileSync(poolerUrlPath, 'utf8').trim());
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) fail('linked pooler configuration is not PostgreSQL');
  if (url.password) fail('linked pooler URL must not contain a password; use SUPABASE_DB_PASSWORD');
  const username = decodeURIComponent(url.username);
  if (!url.hostname.includes(expectedRef) && !username.includes(expectedRef)) {
    fail('linked pooler configuration does not identify the approved yukti-dev project');
  }
  const localEnv = readEnvFile(path.join(repoRoot, '.env.local'));
  const password = process.env.SUPABASE_DB_PASSWORD || localEnv.SUPABASE_DB_PASSWORD;
  if (!password) fail('SUPABASE_DB_PASSWORD is required in the environment or .env.local');
  return {
    args: ['-X', '-v', 'ON_ERROR_STOP=1', '-h', url.hostname, '-p', url.port || '5432', '-U', username, '-d', url.pathname.slice(1) || 'postgres'],
    env: {
      ...process.env,
      PGPASSWORD: password,
      PGSSLMODE: url.searchParams.get('sslmode') || 'require',
    },
  };
}

function psql({ sql, file, variables = {}, allowFailure = false }) {
  // Every database operation independently rechecks the workspace link and
  // derives a password-free connection argument list.
  const connection = connectionConfig();
  const args = [...connection.args, '-qAt'];
  for (const [key, value] of Object.entries(variables)) args.push('-v', `${key}=${value}`);
  if (file) args.push('-f', file);
  if (sql) args.push('-c', sql);
  const result = spawnSync('psql', args, {
    cwd: repoRoot,
    env: connection.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (!allowFailure && (result.status ?? 1) !== 0) {
    fail(`psql operation failed: ${(result.stderr || 'unknown database error').trim()}`);
  }
  return result;
}

function psqlAsync(sql) {
  const connection = connectionConfig();
  return new Promise((resolve, reject) => {
    const child = spawn('psql', [...connection.args, '-qAt', '-c', sql], {
      cwd: repoRoot,
      env: connection.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function parseSingleJson(result, label) {
  if ((result.status ?? 1) !== 0) fail(`${label} failed: ${(result.stderr || '').trim()}`);
  const line = result.stdout.trim().split(/\r?\n/u).filter(Boolean).at(-1);
  if (!line) fail(`${label} returned no row`);
  try {
    return JSON.parse(line);
  } catch {
    fail(`${label} returned invalid JSON`);
  }
}

function assertExpectedStaleFailure(result, stage) {
  if ((result.status ?? 0) === 0) fail(`stale owner unexpectedly completed ${stage}`);
  if (!/metrics_stale_(global|tenant)_fence/u.test(result.stderr)) {
    fail(`stale-owner ${stage} failed for an unexpected reason: ${result.stderr.trim()}`);
  }
}

function localDoctor() {
  const migration = phase3Migration();
  assertLinkedRef();
  const psqlVersion = spawnSync('psql', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if ((psqlVersion.status ?? 1) !== 0) fail('psql is required');
  const poolerConfigured = existsSync(poolerUrlPath);
  const localEnv = readEnvFile(path.join(repoRoot, '.env.local'));
  const hasPassword = Boolean(process.env.SUPABASE_DB_PASSWORD || localEnv.SUPABASE_DB_PASSWORD);
  console.log(JSON.stringify({
    validationRef: expectedRef,
    linkedRef: expectedRef,
    phase3Migration: migration.file,
    phase3MigrationVersion: migration.version,
    poolerConfigured,
    hasDatabasePassword: hasPassword,
    hostedRunEnabled: process.env.PHASE3_ALLOW_HOSTED_CONCURRENCY === '1',
    psqlVersion: psqlVersion.stdout.trim(),
  }, null, 2));
}

function databasePreflight(migrationVersion) {
  const sql = `
    SELECT json_build_object(
      'migration_applied', EXISTS (
        SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '${migrationVersion}'
      ),
      'tick_rpc_exists', to_regprocedure('app.metrics_refresh_tick(text,uuid,bigint,uuid,text)') IS NOT NULL,
      'mark_rpc_exists', to_regprocedure('app.metrics_mark_dirty(uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,date,date,date,date)') IS NOT NULL
    )::text;
  `;
  const preflight = parseSingleJson(psql({ sql }), 'Phase 3 database preflight');
  if (!preflight.migration_applied || !preflight.tick_rpc_exists || !preflight.mark_rpc_exists) {
    fail('Phase 3 migration/RPC preflight failed on yukti-dev');
  }
}

function claimSql(ownerToken) {
  return `SELECT row_to_json(r)::text FROM app.metrics_refresh_tick('claim', '${ownerToken}'::uuid) r;`;
}

function stageSql(stage, ownerToken, epoch, tenantId, domain) {
  return `SELECT row_to_json(r)::text FROM app.metrics_refresh_tick('${stage}', '${ownerToken}'::uuid, ${epoch}::bigint, '${tenantId}'::uuid, '${domain}') r;`;
}

async function runConcurrency() {
  if (process.env.PHASE3_ALLOW_HOSTED_CONCURRENCY !== '1') {
    fail('set PHASE3_ALLOW_HOSTED_CONCURRENCY=1 to authorize the hosted concurrency run');
  }
  const migration = phase3Migration();
  databasePreflight(migration.version);

  const runId = randomUUID();
  const tenantId = deterministicUuid(runId, 'tenant');
  const sourceId = deterministicUuid(runId, 'source');
  const ownerA = deterministicUuid(runId, 'owner-a');
  const ownerB = deterministicUuid(runId, 'owner-b');
  let previousControl = null;
  let seeded = false;
  let resultSummary = null;
  let cleanupFailure = null;

  try {
    previousControl = parseSingleJson(psql({ sql: `
      SELECT json_build_object(
        'exists', COUNT(*) = 1,
        'dispatch_enabled', COALESCE(bool_or(dispatch_enabled), false),
        'pause_reason', MAX(pause_reason),
        'pause_reason_is_null', bool_and(pause_reason IS NULL),
        'global_lease_exists', EXISTS (
          SELECT 1 FROM app.metrics_refresh_leases WHERE lease_scope = 'global'
        )
      )::text
      FROM app.metrics_runtime_control
      WHERE control_scope = 'global';
    ` }), 'runtime-control snapshot');

    psql({
      file: path.join(sqlDir, 'seed.sql'),
      variables: { run_id: runId, tenant_id: tenantId, source_id: sourceId },
    });
    seeded = true;

    const [claimAResult, claimBResult] = await Promise.all([
      psqlAsync(claimSql(ownerA)),
      psqlAsync(claimSql(ownerB)),
    ]);
    const claimA = parseSingleJson(claimAResult, 'claim A');
    const claimB = parseSingleJson(claimBResult, 'claim B');
    const claims = [claimA, claimB];
    const claimed = claims.filter((row) => row.status === 'claimed');
    const excluded = claims.filter((row) => ['busy', 'idle'].includes(row.status));
    if (claimed.length !== 1 || excluded.length !== 1) {
      fail(`expected one claimed and one busy/idle result, got ${claimA.status}/${claimB.status}`);
    }
    if (claimed[0].tenant_id !== tenantId || claimed[0].domain !== 'setup') {
      fail('claim selected a fixture outside this run');
    }

    const winningOwner = claimed[0].owner_token;
    const staleOwner = winningOwner === ownerA ? ownerB : ownerA;
    const epoch = claimed[0].fencing_epoch;
    assertExpectedStaleFailure(psql({
      sql: stageSql('compute', staleOwner, epoch, tenantId, 'setup'),
      allowFailure: true,
    }), 'compute');
    assertExpectedStaleFailure(psql({
      sql: stageSql('acknowledge', staleOwner, epoch, tenantId, 'setup'),
      allowFailure: true,
    }), 'acknowledge');

    const released = parseSingleJson(psql({
      sql: stageSql('release', winningOwner, epoch, tenantId, 'setup'),
    }), 'valid-owner release');
    if (released.status !== 'released') fail(`valid owner release returned ${released.status}`);

    resultSummary = {
      passed: true,
      runId,
      tenantId,
      claimStatuses: [claimA.status, claimB.status].sort(),
      staleComputeRejected: true,
      staleAcknowledgeRejected: true,
      cleanup: 'completed',
    };
  } finally {
    // Cleanup is attempted even after a partial seed or a failed assertion.
    if (previousControl) {
      const cleanup = psql({
        file: path.join(sqlDir, 'cleanup.sql'),
        variables: {
          run_id: runId,
          tenant_id: tenantId,
          owner_a: ownerA,
          owner_b: ownerB,
          previous_control_exists: previousControl.exists ? 'true' : 'false',
          previous_dispatch_enabled: previousControl.dispatch_enabled ? 'true' : 'false',
          previous_pause_reason: previousControl.pause_reason ?? '',
          previous_pause_reason_is_null: previousControl.pause_reason_is_null ? 'true' : 'false',
          previous_global_lease_exists: previousControl.global_lease_exists ? 'true' : 'false',
        },
        allowFailure: true,
      });
      if ((cleanup.status ?? 1) !== 0) {
        const message = (cleanup.stderr || 'unknown cleanup error').trim();
        if (seeded) process.stderr.write(`[metrics-v2-phase3] cleanup failed: ${message}\n`);
        cleanupFailure = message;
      }
    }
  }
  if (cleanupFailure) fail(`cleanup failed: ${cleanupFailure}`);
  console.log(JSON.stringify(resultSummary, null, 2));
}

function help() {
  console.log(`Usage: node scripts/metrics-v2-phase3-concurrency.mjs <doctor|run>

Commands:
  doctor  Verify the local Phase 3 migration, psql, and yukti-dev link.
  run     Run hosted concurrency checks. Requires PHASE3_ALLOW_HOSTED_CONCURRENCY=1.

The run reads SUPABASE_DB_PASSWORD from the environment or .env.local and passes
it only through PGPASSWORD. It never prints the password or database URI.`);
}

try {
  if (command === 'doctor') localDoctor();
  else if (command === 'run') await runConcurrency();
  else help();
} catch (error) {
  console.error(error instanceof Error ? error.message : '[metrics-v2-phase3] unknown failure');
  process.exitCode = 1;
}
