#!/usr/bin/env node
/**
 * Guest storefront load test (Phase 9, specs/db-perf-recovery-2026-09-20.md).
 *
 *   BASE_URL=https://<tenant-slug>.<domain> node scripts/load/guest-storefront.mjs
 *   STAGES=5:60,20:60,50:120 PATHS=/buy/home,/api/buyer/catalog?limit=40 node scripts/load/guest-storefront.mjs
 *
 * STAGES = "<requests per second>:<seconds>" comma list (open-loop ramp). Never point this at
 * production during business hours: run against a preview/staging deployment backed by the dev DB,
 * or at prod only in an agreed window with scripts/load/db-watch.sql running alongside.
 *
 * Reports per stage: sent, 2xx, 429 (limiter), 5xx, network errors, p50/p95/p99 latency (ms), and
 * the cache verdict (x-vercel-cache HIT/STALE/MISS counts) so CDN effectiveness is visible.
 */
const BASE = process.env.BASE_URL;
if (!BASE) { console.error('BASE_URL required'); process.exit(1); }
const PATHS = (process.env.PATHS ?? '/buy/home,/api/buyer/catalog?limit=40,/api/buyer/categories,/api/buyer/brands').split(',');
const STAGES = (process.env.STAGES ?? '5:30,15:30,30:60').split(',').map((s) => s.split(':').map(Number));
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 15000);

const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] : 0);

async function hit(path, stats) {
  const t0 = performance.now();
  try {
    const res = await fetch(new URL(path, BASE), { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': 'yukti-load-test' } });
    await res.arrayBuffer();
    stats.lat.push(performance.now() - t0);
    const c = res.status;
    if (c === 429) stats.r429++; else if (c >= 500) stats.r5xx++; else if (c >= 400) stats.r4xx++; else stats.r2xx++;
    const cache = (res.headers.get('x-vercel-cache') ?? 'none').toUpperCase();
    stats.cache[cache] = (stats.cache[cache] ?? 0) + 1;
  } catch { stats.err++; }
}

for (const [rps, seconds] of STAGES) {
  const stats = { lat: [], r2xx: 0, r4xx: 0, r429: 0, r5xx: 0, err: 0, cache: {} };
  const inflight = new Set();
  const total = rps * seconds;
  const started = performance.now();
  for (let i = 0; i < total; i++) {
    const due = started + (i * 1000) / rps;
    const wait = due - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const p = hit(PATHS[i % PATHS.length], stats).finally(() => inflight.delete(p));
    inflight.add(p);
  }
  await Promise.all(inflight);
  stats.lat.sort((a, b) => a - b);
  console.log(JSON.stringify({
    stage: `${rps}rps x ${seconds}s`, sent: total, ok: stats.r2xx, r4xx: stats.r4xx, limited429: stats.r429, err5xx: stats.r5xx, netErr: stats.err,
    p50: Math.round(pct(stats.lat, 50)), p95: Math.round(pct(stats.lat, 95)), p99: Math.round(pct(stats.lat, 99)), cache: stats.cache,
  }));
}
