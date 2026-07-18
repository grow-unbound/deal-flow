#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const VALIDATION_REF = process.env.PHASE1A_SUPABASE_REF || 'euhzgherjvjopjrpoqjr';
const BASELINE_CUTOFF = '20260714114957';
const CANDIDATE_VERSION = '20260715112649';
const PHASE4_VERSION = '20260716071422';
const SQL_DIR = path.join(repoRoot, 'scripts/sql/metrics-v2-phase1a');
const PHASE4_SQL_DIR = path.join(repoRoot, 'scripts/sql/metrics-v2-phase4');
const ARTIFACT_DIR = path.resolve(process.env.PHASE1A_ARTIFACT_DIR || path.join(repoRoot, 'artifacts/metrics-v2-phase1a'));
const BASE_URL = process.env.PHASE1A_BASE_URL || process.env.PERF_BASE_URL || 'http://localhost:3000';
const COOKIE = process.env.PHASE1A_COOKIE || process.env.PERF_COOKIE || '';
const AUTH_BEARER = process.env.PHASE1A_AUTH_BEARER || process.env.PERF_BEARER || '';
const PHASE = process.env.PHASE1A_PHASE || 'baseline';
const TRIALS = Math.max(1, Number(process.env.PHASE1A_TRIALS || '3'));
const VUS = Math.max(1, Number(process.env.PHASE1A_VUS || '1000'));
const RATE = Math.max(1, Number(process.env.PHASE1A_RATE || '50'));
const RAMP_UP_MS = Math.max(0, Number(process.env.PHASE1A_RAMP_UP_MS || '120000'));
const SUSTAIN_MS = Math.max(1, Number(process.env.PHASE1A_SUSTAIN_MS || '480000'));
const RAMP_DOWN_MS = Math.max(0, Number(process.env.PHASE1A_RAMP_DOWN_MS || '120000'));
const DRY_RUN = process.env.PHASE1A_DRY_RUN === '1';
const SEEDED_TENANT_INTEGRATION_ID = deterministicUuid('tenant-integration:zoho');

export const PROFILE_CONFIGS = {
  phase1aStress: {
    name: 'phase1a-stress',
    rampUpMs: RAMP_UP_MS,
    sustainMs: SUSTAIN_MS,
    rampDownMs: RAMP_DOWN_MS,
    rate: RATE,
    vus: VUS,
    mode: 'mixed',
  },
  phase1bNormalLoad: {
    name: 'phase1b-normal-load',
    rampUpMs: Number(process.env.PHASE1B_RAMP_UP_MS || '120000'),
    sustainMs: Number(process.env.PHASE1B_SUSTAIN_MS || '1800000'),
    rampDownMs: Number(process.env.PHASE1B_RAMP_DOWN_MS || '120000'),
    rate: Number(process.env.PHASE1B_RATE || '10'),
    vus: Number(process.env.PHASE1B_VUS || '100'),
    mode: 'mixed',
  },
  phase1bReadSurfaces: {
    name: 'phase1b-read-surfaces',
    rampUpMs: Number(process.env.PHASE1B_READ_RAMP_UP_MS || '0'),
    sustainMs: Number(process.env.PHASE1B_READ_SUSTAIN_MS || '60000'),
    rampDownMs: Number(process.env.PHASE1B_READ_RAMP_DOWN_MS || '0'),
    rate: Number(process.env.PHASE1B_READ_RATE || '10'),
    vus: Number(process.env.PHASE1B_READ_VUS || '25'),
    mode: 'read-surfaces',
  },
  phase4Stress: {
    name: 'phase4-stress',
    rampUpMs: Number(process.env.PHASE4_RAMP_UP_MS || String(RAMP_UP_MS)),
    sustainMs: Number(process.env.PHASE4_SUSTAIN_MS || String(SUSTAIN_MS)),
    rampDownMs: Number(process.env.PHASE4_RAMP_DOWN_MS || String(RAMP_DOWN_MS)),
    rate: Number(process.env.PHASE4_RATE || String(RATE)),
    vus: Number(process.env.PHASE4_VUS || String(VUS)),
    mode: 'mixed',
  },
  phase4NormalLoad: {
    name: 'phase4-normal-load',
    rampUpMs: Number(process.env.PHASE4_NORMAL_RAMP_UP_MS || '120000'),
    sustainMs: Number(process.env.PHASE4_NORMAL_SUSTAIN_MS || '1800000'),
    rampDownMs: Number(process.env.PHASE4_NORMAL_RAMP_DOWN_MS || '120000'),
    rate: Number(process.env.PHASE4_NORMAL_RATE || '10'),
    vus: Number(process.env.PHASE4_NORMAL_VUS || '100'),
    mode: 'mixed',
  },
};

const command = process.argv[2] || 'help';

function log(message) {
  console.log(`[phase1a] ${message}`);
}

function fail(message) {
  console.error(`[phase1a] ${message}`);
  process.exit(1);
}

export function resolvePhase1BProfile(profileName) {
  if (profileName === 'read-surfaces') return PROFILE_CONFIGS.phase1bReadSurfaces;
  return PROFILE_CONFIGS.phase1bNormalLoad;
}

function authHeaders() {
  return {
    ...(COOKIE ? { cookie: COOKIE } : {}),
    ...(AUTH_BEARER ? { authorization: `Bearer ${AUTH_BEARER}` } : {}),
  };
}

function run(cmd, args, options = {}) {
  const printable = [cmd, ...args].join(' ');
  if (DRY_RUN || options.dryRun) {
    log(`dry-run: ${printable}`);
    return { stdout: '', stderr: '', status: 0 };
  }
  const result = spawnSync(cmd, args, {
    cwd: options.cwd || repoRoot,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if ((result.status ?? 1) !== 0) {
    if (options.capture) {
      process.stderr.write(result.stderr || result.stdout || '');
    }
    fail(`command failed: ${printable}`);
  }
  return result;
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function deterministicUuid(key) {
  const hex = createHash('md5').update(`metrics-v2-phase1a:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

function copyDir(src, dest) {
  if (!existsSync(src)) return;
  cpSync(src, dest, {
    recursive: true,
    filter: (from) => !from.includes(`${path.sep}.temp${path.sep}`) && !from.endsWith(`${path.sep}.temp`),
  });
}

function createTempSupabaseProject(kind) {
  const maxVersion = kind === 'baseline'
    ? BASELINE_CUTOFF
    : kind === 'phase4'
      ? PHASE4_VERSION
      : CANDIDATE_VERSION;
  const tempRoot = path.join('/tmp', `deal-flow-metrics-v2-phase1a-${kind}`);
  rmSync(tempRoot, { recursive: true, force: true });
  ensureDir(path.join(tempRoot, 'supabase/migrations'));

  cpSync(path.join(repoRoot, 'supabase/config.toml'), path.join(tempRoot, 'supabase/config.toml'));
  copyDir(path.join(repoRoot, 'supabase/functions'), path.join(tempRoot, 'supabase/functions'));

  for (const file of readdirSync(path.join(repoRoot, 'supabase/migrations')).sort()) {
    if (!file.endsWith('.sql')) continue;
    const version = file.slice(0, 14);
    if (version <= maxVersion) {
      cpSync(path.join(repoRoot, 'supabase/migrations', file), path.join(tempRoot, 'supabase/migrations', file));
    }
  }
  return tempRoot;
}

function preparedProjectDir(kind) {
  return path.join('/tmp', `deal-flow-metrics-v2-phase1a-${kind}`);
}

function assertLinkedRef(projectDir) {
  const refPath = path.join(projectDir, 'supabase/.temp/project-ref');
  if (!existsSync(refPath)) {
    fail(`missing linked project ref at ${refPath}`);
  }
  const actual = readFileSync(refPath, 'utf8').trim();
  if (actual !== VALIDATION_REF) {
    fail(`linked ref mismatch: expected ${VALIDATION_REF}, got ${actual}`);
  }
}

function linkTempProject(projectDir) {
  run('npx', ['supabase', 'link', '--project-ref', VALIDATION_REF], { cwd: projectDir });
  if (DRY_RUN) {
    const tempDir = path.join(projectDir, 'supabase/.temp');
    ensureDir(tempDir);
    writeFileSync(path.join(tempDir, 'project-ref'), `${VALIDATION_REF}\n`);
  }
  assertLinkedRef(projectDir);
}

function supabaseQuery(projectDir, sqlFile) {
  assertLinkedRef(projectDir);
  run('npx', ['supabase', 'db', 'query', '--linked', '--file', sqlFile], { cwd: projectDir });
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let dollarTag = null;
  let inSingle = false;
  let inDouble = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1] || '';
    current += ch;

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        current += next;
        i += 1;
        blockComment = false;
      }
      continue;
    }
    if (!inSingle && !inDouble && !dollarTag && ch === '-' && next === '-') {
      current += next;
      i += 1;
      lineComment = true;
      continue;
    }
    if (!inSingle && !inDouble && !dollarTag && ch === '/' && next === '*') {
      current += next;
      i += 1;
      blockComment = true;
      continue;
    }
    if (!inDouble && !dollarTag && ch === "'" && sql[i - 1] !== '\\') {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !dollarTag && ch === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && ch === '$') {
      const match = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        const tag = match[0];
        if (!dollarTag) {
          dollarTag = tag;
          current += tag.slice(1);
          i += tag.length - 1;
          continue;
        }
        if (dollarTag === tag) {
          dollarTag = null;
          current += tag.slice(1);
          i += tag.length - 1;
          continue;
        }
      }
    }
    if (!inSingle && !inDouble && !dollarTag && ch === ';') {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = '';
    }
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

function seedWithStatementChunks(projectDir) {
  const seedFile = path.join(SQL_DIR, 'seed.sql');
  const statements = splitSqlStatements(readFileSync(seedFile, 'utf8'))
    .filter((statement) => {
      const normalized = statement.replace(/^\s*--.*$/gm, '').trim().toLowerCase();
      return normalized && normalized !== 'begin;' && normalized !== 'commit;' && !normalized.startsWith('select set_config(');
    });
  const tempDir = path.join('/tmp', 'deal-flow-metrics-v2-phase1a-seed');
  rmSync(tempDir, { recursive: true, force: true });
  ensureDir(tempDir);
  statements.forEach((statement, index) => {
    const normalized = statement.replace(/^\s*--.*$/gm, '').trim().toLowerCase();
    const bypass = normalized.startsWith('select app.refresh_') ? 'off' : 'on';
    const file = path.join(tempDir, `seed-${String(index + 1).padStart(3, '0')}.sql`);
    writeFileSync(file, `BEGIN;\nSELECT set_config('app.integration_sync_bypass_triggers', '${bypass}', true);\n${statement}\nCOMMIT;\n`);
    log(`seed chunk ${index + 1}/${statements.length}`);
    supabaseQuery(projectDir, file);
  });
}

function migrationList(projectDir) {
  assertLinkedRef(projectDir);
  run('npx', ['supabase', 'migration', 'list', '--linked'], { cwd: projectDir });
}

function dbPush(projectDir, extraArgs = []) {
  assertLinkedRef(projectDir);
  const args = ['supabase', 'db', 'push', '--linked', ...extraArgs];
  if (!extraArgs.includes('--dry-run')) {
    args.push('--yes');
  }
  run('npx', args, { cwd: projectDir });
}

function prepare(kind) {
  if (kind === 'candidate' && process.env.PHASE1A_ALLOW_PERSISTENT_PUSH !== '1') {
    fail('candidate push requires PHASE1A_ALLOW_PERSISTENT_PUSH=1 after explicit user approval');
  }
  const projectDir = createTempSupabaseProject(kind);
  log(`prepared temp ${kind} project at ${projectDir}`);
  linkTempProject(projectDir);
  migrationList(projectDir);
  supabaseQuery(projectDir, path.join(SQL_DIR, 'preflight-fresh-project.sql'));
  dbPush(projectDir, kind === 'candidate' ? [] : []);
  seedWithStatementChunks(projectDir);
  return projectDir;
}

function dryRunCandidate() {
  const projectDir = createTempSupabaseProject('candidate');
  log(`prepared temp candidate project at ${projectDir}`);
  linkTempProject(projectDir);
  migrationList(projectDir);
  dbPush(projectDir, ['--dry-run']);
}

function resolveProjectDirForTrials(kind) {
  const reusePrepared = process.env.PHASE1A_REUSE_PREPARED !== '0';
  const projectDir = preparedProjectDir(kind);
  if (reusePrepared && existsSync(path.join(projectDir, 'supabase/.temp/project-ref'))) {
    assertLinkedRef(projectDir);
    log(`reusing prepared ${kind} project at ${projectDir}`);
    return projectDir;
  }
  const freshProjectDir = createTempSupabaseProject(kind);
  linkTempProject(freshProjectDir);
  return freshProjectDir;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function readSurfaceOpFor(index) {
  const buyer = deterministicUuid(`buyer:${(index % 10000) + 1}`);
  const product = deterministicUuid(`tenant-product:${(index % 500) + 1}`);
  const brand = deterministicUuid(`tenant-brand:${(index % 50) + 1}`);
  const category = deterministicUuid(`category:${(index % 25) + 1}`);
  const location = deterministicUuid(`location:${(index % 9) + 1}`);
  const warehouse = deterministicUuid(`warehouse:${(index % 9) + 1}`);
  const paths = [
    '/api/tenant/dashboard',
    '/api/tenant/invoices/summary',
    '/api/tenant/products/summary',
    '/api/tenant/categories/landing?limit=50',
    '/api/tenant/locations/landing?limit=50',
    '/api/tenant/warehouses/landing?limit=50',
    `/api/tenant/customers/${buyer}`,
    `/api/tenant/products/${product}`,
    `/api/tenant/brands/${brand}`,
    `/api/tenant/categories/${category}`,
    `/api/tenant/locations/${location}/detail`,
    `/api/tenant/warehouses/${warehouse}`,
  ];
  return { method: 'GET', path: paths[index % paths.length] };
}

function opFor(index, runId, mode = 'mixed') {
  if (mode === 'read-surfaces') return readSurfaceOpFor(index);

  const bucket = index % 100;
  const buyer = deterministicUuid(`buyer:${(index % 10000) + 1}`);
  const product = deterministicUuid(`tenant-product:${(index % 500) + 1}`);
  const warehouse = deterministicUuid(`warehouse:${(index % 9) + 1}`);
  const location = deterministicUuid(`location:${(index % 9) + 1}`);
  const order = deterministicUuid(`order:${(index % 40000) + 1}`);
  const estimate = deterministicUuid(`estimate:${(index % 30000) + 1}`);
  const invoice = deterministicUuid(`invoice:${(index % 30000) + 1}`);
  const today = new Date().toISOString().slice(0, 10);

  if (bucket < 40) {
    const paths = [
      '/api/tenant/orders?limit=50',
      '/api/tenant/invoices?limit=50',
      '/api/tenant/estimates?limit=50',
      '/api/tenant/customers?limit=50',
      '/api/tenant/products?limit=50',
    ];
    return { method: 'GET', path: paths[index % paths.length] };
  }
  if (bucket < 70) {
    const docPick = index % 3;
    if (docPick === 0) {
      return {
        method: 'PATCH',
        path: `/api/tenant/orders/${order}`,
        body: { location_id: location, buyer_id: buyer, order_date: today, seller_note: `phase1a ${runId}`, freight: index % 11 },
      };
    }
    if (docPick === 1) {
      return {
        method: 'PATCH',
        path: `/api/tenant/estimates/${estimate}`,
        body: { location_id: location, buyer_id: buyer, estimate_date: today, seller_note: `phase1a ${runId}`, freight: index % 7 },
      };
    }
    return {
      method: 'PATCH',
      path: `/api/tenant/invoices/${invoice}`,
      body: { action: 'save', location_id: location, buyer_id: buyer, invoice_date: today, seller_note: `phase1a ${runId}`, freight: index % 13 },
    };
  }
  if (bucket < 85) {
    return {
      method: 'POST',
      path: '/api/tenant/inventory',
      body: {
        tenant_product_id: product,
        warehouse_id: warehouse,
        qty_available: 100 + (index % 900),
        qty_reserved: index % 25,
        reorder_point: 25,
      },
    };
  }
  if (bucket < 95) {
    const paths = ['/api/tenant/dashboard', '/api/tenant/orders?limit=20', '/api/tenant/invoices/summary'];
    return { method: 'GET', path: paths[index % paths.length] };
  }
  if (index % 2 === 0) {
    return { method: 'PATCH', path: `/api/customers/${buyer}`, body: { action: 'deactivate' } };
  }
  return { method: 'PATCH', path: `/api/tenant/products/${product}`, body: { name_override: `Phase1A Product ${index % 500} ${runId}` } };
}

async function callApi(op) {
  const started = performance.now();
  if (DRY_RUN) {
    return { ok: true, latencyMs: performance.now() - started, status: 'DRY_RUN', detail: '' };
  }
  let response;
  try {
    response = await fetch(`${BASE_URL}${op.path}`, {
      method: op.method,
      redirect: 'manual',
      headers: {
        ...authHeaders(),
        ...(op.body ? { 'content-type': 'application/json' } : {}),
        'x-phase1a-request-id': op.requestId,
      },
      body: op.body ? JSON.stringify(op.body) : undefined,
    });
    await response.text();
  } catch (error) {
    return { ok: false, latencyMs: performance.now() - started, status: 'NETWORK_ERROR', detail: String(error?.message || error) };
  }
  return {
    ok: response.ok,
    latencyMs: performance.now() - started,
    status: String(response.status),
    detail: response.statusText || '',
  };
}

async function runConcurrentSync(runId) {
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const body = {
    tenant_integration_id: SEEDED_TENANT_INTEGRATION_ID,
    job_type: 'manual',
    mode: 'incremental',
    scope: 'full',
    since,
    max_pages: 1,
  };
  return callApi({
    method: 'POST',
    path: '/api/settings/integrations/sync',
    body,
    requestId: `phase1a-sync-${runId}`,
  });
}

export function buildTrialArtifact({ phase, trial, runId, config, latencies, failures, maxInFlight, syncResult }) {
  return {
    phase,
    trial,
    runId,
    workload: {
      rampUpMs: config.rampUpMs,
      sustainMs: config.sustainMs,
      rampDownMs: config.rampDownMs,
      rate: config.rate,
      vus: config.vus,
      maxInFlight,
      profile: config.name,
      mode: config.mode,
    },
    phase1b: phase.startsWith('phase1b')
      ? {
          icbSampling: {
            status: 'instrumentation-only',
            thresholdGate: 'Phase 4',
            domains: ['commercial', 'inventory', 'buyer_app', 'setup'],
            keyClasses: ['tenant', 'buyer', 'product', 'location', 'warehouse'],
          },
        }
      : undefined,
    api: {
      count: latencies.length,
      failures: failures.length,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      min: latencies.length ? Math.min(...latencies) : 0,
      max: latencies.length ? Math.max(...latencies) : 0,
    },
    sync: syncResult
      ? {
          tenantIntegrationId: SEEDED_TENANT_INTEGRATION_ID,
          pageLimit: 25000,
          status: syncResult.status,
          ok: syncResult.ok,
          latencyMs: syncResult.latencyMs,
        }
      : null,
    failedSamples: failures.slice(0, 50),
    createdAt: new Date().toISOString(),
  };
}

async function runWorkloadTrial(phase, trial, config = PROFILE_CONFIGS.phase1aStress) {
  ensureDir(ARTIFACT_DIR);
  if (!COOKIE && !AUTH_BEARER) {
    fail('PHASE1A_COOKIE/PERF_COOKIE or PHASE1A_AUTH_BEARER/PERF_BEARER is required so workload traffic uses normal authenticated API routes');
  }
  const runId = `${phase}-${trial}-${Date.now()}`;
  const totalMs = config.rampUpMs + config.sustainMs + config.rampDownMs;
  const intervalMs = 1000 / config.rate;
  const totalRequests = Math.max(1, Math.floor(totalMs / intervalMs));
  const latencies = [];
  const failures = [];
  let inFlight = 0;
  let maxInFlight = 0;

  log(`trial ${runId}: ${totalRequests} requests, rate=${config.rate}/s, vus=${config.vus}, profile=${config.name}, base=${BASE_URL}`);
  const syncPromise = config.mode === 'read-surfaces' ? Promise.resolve(null) : runConcurrentSync(runId);
  const startedAt = performance.now();
  for (let i = 0; i < totalRequests; i += 1) {
    while (inFlight >= config.vus) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const targetElapsed = i * intervalMs;
    const actualElapsed = performance.now() - startedAt;
    if (targetElapsed > actualElapsed) {
      await new Promise((resolve) => setTimeout(resolve, targetElapsed - actualElapsed));
    }
    const op = opFor(i, runId, config.mode);
    op.requestId = `phase1a-${runId}-${i}`;
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    callApi(op).then((result) => {
      latencies.push(result.latencyMs);
      if (!result.ok) {
        failures.push({ index: i, method: op.method, path: op.path, status: result.status, detail: result.detail });
      }
    }).finally(() => {
      inFlight -= 1;
    });
  }
  while (inFlight > 0) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const syncResult = await syncPromise;
  if (syncResult && !syncResult.ok) {
    failures.push({
      index: 'sync',
      method: 'POST',
      path: '/api/settings/integrations/sync',
      status: syncResult.status,
      detail: syncResult.detail || 'Concurrent sync start failed',
    });
  }

  const artifact = buildTrialArtifact({ phase, trial, runId, config, latencies, failures, maxInFlight, syncResult });
  const file = path.join(ARTIFACT_DIR, `${phase}-trial-${trial}.json`);
  writeFileSync(file, `${JSON.stringify(artifact, null, 2)}\n`);
  log(`wrote ${file}`);
  if (failures.length > 0) {
    fail(`trial ${runId} had ${failures.length} API failures`);
  }
}

async function runTrials(phase) {
  const projectDir = resolveProjectDirForTrials(phase === 'candidate' ? 'candidate' : 'baseline');
  for (let trial = 1; trial <= TRIALS; trial += 1) {
    supabaseQuery(projectDir, path.join(SQL_DIR, 'reset.sql'));
    supabaseQuery(projectDir, path.join(SQL_DIR, 'sample-before.sql'));
    await runWorkloadTrial(phase, trial);
    supabaseQuery(projectDir, path.join(SQL_DIR, 'sample-after.sql'));
  }
}

async function runPhase1BTrials(profileName) {
  const profile = resolvePhase1BProfile(profileName);
  const projectDir = resolveProjectDirForTrials('candidate');
  const trials = Math.max(1, Number(process.env.PHASE1B_TRIALS || '1'));
  for (let trial = 1; trial <= trials; trial += 1) {
    supabaseQuery(projectDir, path.join(SQL_DIR, 'reset.sql'));
    supabaseQuery(projectDir, path.join(SQL_DIR, 'sample-before.sql'));
    await runWorkloadTrial(profile.name, trial, profile);
    supabaseQuery(projectDir, path.join(SQL_DIR, 'sample-after.sql'));
  }
}

function phase1bReconcile() {
  const projectDir = resolveProjectDirForTrials('candidate');
  supabaseQuery(projectDir, path.join(repoRoot, 'scripts/sql/metrics-v2-phase1b/contracts.sql'));
  supabaseQuery(projectDir, path.join(repoRoot, 'scripts/sql/metrics-v2-phase1b/reconcile-current-reads.sql'));
}

async function runPhase4Trials(profileName) {
  const profile = profileName === 'normal-load' ? PROFILE_CONFIGS.phase4NormalLoad : PROFILE_CONFIGS.phase4Stress;
  const projectDir = resolveProjectDirForTrials('phase4');
  const trials = Math.max(1, Number(process.env.PHASE4_TRIALS || '1'));
  for (let trial = 1; trial <= trials; trial += 1) {
    supabaseQuery(projectDir, path.join(SQL_DIR, 'reset.sql'));
    supabaseQuery(projectDir, path.join(SQL_DIR, 'sample-before.sql'));
    await runWorkloadTrial(profile.name, trial, profile);
    supabaseQuery(projectDir, path.join(SQL_DIR, 'sample-after.sql'));
  }
}

function phase4Reconcile() {
  const projectDir = resolveProjectDirForTrials('phase4');
  supabaseQuery(projectDir, path.join(repoRoot, 'tests/metrics_v2_phase_4_capture_only_validation.sql'));
}

function phase4CronSql() {
  const projectDir = resolveProjectDirForTrials('phase4');
  assertLinkedRef(projectDir);
  const sql = readFileSync(path.join(PHASE4_SQL_DIR, 'staging-cron-template.sql'), 'utf8');
  const outFile = path.join('/tmp', 'metrics-v2-phase4-staging-cron.sql');
  writeFileSync(outFile, sql);
  console.log(outFile);
}

function phase4ScheduleCron() {
  if (process.env.PHASE4_ALLOW_CRON !== '1') {
    fail('refusing to schedule Cron without PHASE4_ALLOW_CRON=1');
  }
  phase4CronSql();
  const projectDir = resolveProjectDirForTrials('phase4');
  supabaseQuery(projectDir, path.join('/tmp', 'metrics-v2-phase4-staging-cron.sql'));
}

function phase4IcBReport() {
  const phase4Artifacts = [
    ...readArtifacts('phase4-stress'),
    ...readArtifacts('phase4-normal-load'),
  ];
  const report = {
    createdAt: new Date().toISOString(),
    artifacts: phase4Artifacts.length,
    domains: ['commercial', 'inventory', 'buyer_app', 'setup'].map((domain) => ({
      domain,
      ingressPerMinute: null,
      completionPerMinute: null,
      backlog: null,
      passed: null,
      note: 'Populate from metrics_dirty_work/metrics_execution_history samples captured during the Phase 4 accepted run.',
    })),
  };
  ensureDir(ARTIFACT_DIR);
  writeFileSync(path.join(ARTIFACT_DIR, 'phase4-icb-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

function median(values) {
  if (!values.length) return 0;
  return percentile(values, 50);
}

function readArtifacts(phase) {
  if (!existsSync(ARTIFACT_DIR)) return [];
  return readdirSync(ARTIFACT_DIR)
    .filter((file) => file.startsWith(`${phase}-trial-`) && file.endsWith('.json'))
    .sort()
    .map((file) => JSON.parse(readFileSync(path.join(ARTIFACT_DIR, file), 'utf8')));
}

function compare() {
  const baseline = readArtifacts('baseline');
  const candidate = readArtifacts('candidate');
  if (baseline.length < TRIALS || candidate.length < TRIALS) {
    fail(`need at least ${TRIALS} baseline and ${TRIALS} candidate artifacts`);
  }
  const baselineP95 = median(baseline.map((row) => row.api.p95));
  const candidateP95 = median(candidate.map((row) => row.api.p95));
  const baselineP99 = median(baseline.map((row) => row.api.p99));
  const candidateP99 = median(candidate.map((row) => row.api.p99));
  const p95Regression = baselineP95 > 0 ? ((candidateP95 - baselineP95) / baselineP95) * 100 : 0;
  const p99Regression = baselineP99 > 0 ? ((candidateP99 - baselineP99) / baselineP99) * 100 : 0;
  const result = {
    baselineTrials: baseline.length,
    candidateTrials: candidate.length,
    baselineP95,
    candidateP95,
    p95Regression,
    baselineP99,
    candidateP99,
    p99Regression,
    passedLatencyGate: p95Regression <= 5 && p99Regression <= 10,
    createdAt: new Date().toISOString(),
  };
  ensureDir(ARTIFACT_DIR);
  writeFileSync(path.join(ARTIFACT_DIR, 'comparison.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  if (!result.passedLatencyGate) {
    process.exit(1);
  }
}

function doctor() {
  ensureDir(ARTIFACT_DIR);
  const seedHash = sha256File(path.join(SQL_DIR, 'seed.sql'));
  console.log(JSON.stringify({
    validationRef: VALIDATION_REF,
    currentWorkspaceRef: existsSync(path.join(repoRoot, 'supabase/.temp/project-ref'))
      ? readFileSync(path.join(repoRoot, 'supabase/.temp/project-ref'), 'utf8').trim()
      : null,
    baselineCutoff: BASELINE_CUTOFF,
    candidateVersion: CANDIDATE_VERSION,
    phase4Version: PHASE4_VERSION,
    seedHash,
    baseUrl: BASE_URL,
    hasCookie: Boolean(COOKIE),
    hasBearer: Boolean(AUTH_BEARER),
    artifactDir: ARTIFACT_DIR,
    phase1bProfiles: {
      normalLoad: PROFILE_CONFIGS.phase1bNormalLoad,
      readSurfaces: PROFILE_CONFIGS.phase1bReadSurfaces,
    },
    phase4Profiles: {
      stress: PROFILE_CONFIGS.phase4Stress,
      normalLoad: PROFILE_CONFIGS.phase4NormalLoad,
    },
  }, null, 2));
}

export function commandHelpText() {
  return `Usage: node scripts/metrics-v2-phase1a-acceptance.mjs <command>

Commands:
  doctor                 Print local configuration and deterministic seed hash.
  prepare-baseline       Link temp project, push migrations through ${BASELINE_CUTOFF}, and seed.
  baseline               Run ${TRIALS} baseline workload trials against an already prepared baseline DB.
  candidate-dry-run      Verify candidate pending migration set and candidate SQL shape.
  prepare-candidate      Link temp project, push through ${CANDIDATE_VERSION}, and seed. Requires PHASE1A_ALLOW_PERSISTENT_PUSH=1.
  candidate              Run ${TRIALS} candidate workload trials.
  compare                Compare baseline/candidate artifacts and fail on threshold regression.
  phase1b-normal-load    Run Phase 1B normal-load profile against prepared candidate DB.
  phase1b-read-surfaces  Run Phase 1B dashboard/summary/callout/detail read profile.
  phase1b-reconcile      Run Phase 1B rolled-back contract and current-read reconciliation SQL.
  phase4-prepare         Link temp project, push through ${PHASE4_VERSION}, and seed. Requires PHASE1A_ALLOW_PERSISTENT_PUSH=1.
  phase4-reconcile       Run Phase 4 capture-only rollback SQL against prepared validation DB.
  phase4-stress          Run Phase 4 mixed 1,000-session safety profile.
  phase4-normal-load     Run Phase 4 normal-load I/C/B profile.
  phase4-icb-report      Write a Phase 4 I/C/B placeholder report from captured artifacts.
  phase4-cron-sql        Generate staging-only 60s Cron SQL under /tmp.
  phase4-schedule-cron   Apply staging Cron SQL; requires PHASE4_ALLOW_CRON=1.

Key env:
  PHASE1A_SUPABASE_REF=${VALIDATION_REF}
  PHASE1A_BASE_URL=${BASE_URL}
  PHASE1A_COOKIE=<authenticated seller_admin cookie>
  PHASE1A_AUTH_BEARER=<authenticated seller_admin access token>
  PHASE1A_TRIALS=${TRIALS}
  PHASE1A_RATE=${RATE}
  PHASE1A_VUS=${VUS}
  PHASE1B_RATE=${PROFILE_CONFIGS.phase1bNormalLoad.rate}
  PHASE1B_VUS=${PROFILE_CONFIGS.phase1bNormalLoad.vus}
  PHASE1B_TRIALS=1
  PHASE4_FUNCTIONS_URL=<https://project.supabase.co/functions/v1>
  PHASE4_REFRESH_TOKEN=<32+ character metrics refresh token>
  PHASE4_ALLOW_CRON=1
  PHASE1A_DRY_RUN=1
`;
}

function help() {
  console.log(commandHelpText());
}

export async function main(selectedCommand = command) {
  switch (selectedCommand) {
    case 'doctor':
      doctor();
      break;
    case 'prepare-baseline':
      prepare('baseline');
      break;
    case 'baseline':
      await runTrials('baseline');
      break;
    case 'candidate-dry-run':
      dryRunCandidate();
      break;
    case 'prepare-candidate':
      prepare('candidate');
      break;
    case 'candidate':
      await runTrials('candidate');
      break;
    case 'compare':
      compare();
      break;
    case 'phase1b-normal-load':
      await runPhase1BTrials('normal-load');
      break;
    case 'phase1b-read-surfaces':
      await runPhase1BTrials('read-surfaces');
      break;
    case 'phase1b-reconcile':
      phase1bReconcile();
      break;
    case 'phase4-prepare':
      prepare('phase4');
      break;
    case 'phase4-reconcile':
      phase4Reconcile();
      break;
    case 'phase4-stress':
      await runPhase4Trials('stress');
      break;
    case 'phase4-normal-load':
      await runPhase4Trials('normal-load');
      break;
    case 'phase4-icb-report':
      phase4IcBReport();
      break;
    case 'phase4-cron-sql':
      phase4CronSql();
      break;
    case 'phase4-schedule-cron':
      phase4ScheduleCron();
      break;
    case 'help':
    default:
      help();
      break;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
