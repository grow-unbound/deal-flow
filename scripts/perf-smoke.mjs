#!/usr/bin/env node

const baseUrl = process.env.PERF_BASE_URL || 'http://localhost:3000';
const cookie = process.env.PERF_COOKIE || '';
const rounds = Math.max(1, Number(process.env.PERF_ROUNDS || '5'));

const endpoints = [
  '/api/tenant/orders?limit=200',
  '/api/tenant/catalogs?limit=200',
  '/api/tenant/customers?limit=300',
  '/api/tenant/products',
  '/api/tenant/cohorts',
  '/api/price-lists',
];

function parseServerTiming(header) {
  if (!header) return null;
  const m = header.match(/dur=([0-9.]+)/);
  return m ? Number(m[1]) : null;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function runEndpoint(path) {
  const timings = [];
  const serverTimings = [];
  let okCount = 0;
  const failures = [];

  // Warm-up request to reduce first-hit compile skew in dev mode.
  try {
    await fetch(`${baseUrl}${path}`, {
      headers: cookie ? { cookie } : {},
    });
  } catch {
    // Keep going; failures are tracked in measured rounds below.
  }

  for (let i = 0; i < rounds; i += 1) {
    const start = performance.now();
    let res;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        redirect: 'manual',
        headers: cookie ? { cookie } : {},
      });
      await res.text();
    } catch (err) {
      timings.push(Number.POSITIVE_INFINITY);
      failures.push({ round: i + 1, status: 'NETWORK_ERROR', detail: String(err?.message || err) });
      continue;
    }
    const elapsed = performance.now() - start;
    timings.push(elapsed);
    if (res.ok) {
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/json')) {
        okCount += 1;
      } else {
        failures.push({
          round: i + 1,
          status: 'NON_JSON_200',
          detail: `Unexpected content-type: ${contentType || 'unknown'}`,
        });
      }
    } else if (res.status >= 300 && res.status < 400) {
      failures.push({
        round: i + 1,
        status: String(res.status),
        detail: `Redirected to ${res.headers.get('location') || 'unknown'}`,
      });
    } else {
      failures.push({ round: i + 1, status: String(res.status), detail: res.statusText || 'Request failed' });
    }

    const st = parseServerTiming(res.headers.get('server-timing'));
    if (st != null) serverTimings.push(st);
  }

  const finite = timings.filter((v) => Number.isFinite(v));
  return {
    path,
    okCount,
    total: rounds,
    client: {
      p50: percentile(finite, 50),
      p95: percentile(finite, 95),
      avg: finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : Number.POSITIVE_INFINITY,
    },
    server: {
      p50: percentile(serverTimings, 50),
      p95: percentile(serverTimings, 95),
      avg: serverTimings.length ? serverTimings.reduce((a, b) => a + b, 0) / serverTimings.length : 0,
    },
    failures,
  };
}

function fmt(n) {
  if (!Number.isFinite(n)) return 'INF';
  return `${n.toFixed(1)}ms`;
}

(async () => {
  console.log(`\\nPerf smoke against ${baseUrl} (${rounds} rounds each)\\n`);
  const rows = [];

  for (const ep of endpoints) {
    rows.push(await runEndpoint(ep));
  }

  for (const r of rows) {
    console.log(r.path);
    console.log(`  OK: ${r.okCount}/${r.total}`);
    console.log(`  Client  p50=${fmt(r.client.p50)}  p95=${fmt(r.client.p95)}  avg=${fmt(r.client.avg)}`);
    console.log(`  Server  p50=${fmt(r.server.p50)}  p95=${fmt(r.server.p95)}  avg=${fmt(r.server.avg)}`);
    if (r.failures.length) {
      console.log('  Failures:');
      for (const f of r.failures) {
        console.log(`    round ${f.round}: ${f.status} ${f.detail}`);
      }
    }
  }

  const allFailures = rows.every((r) => r.okCount === 0);
  if (allFailures) {
    const statuses = rows.flatMap((r) => r.failures.map((f) => f.status));
    const onlyNetworkErrors = statuses.length > 0 && statuses.every((s) => s === 'NETWORK_ERROR');
    const hasAuthFailures = statuses.some((s) => s === '401' || s === '403' || s === '302' || s === '307' || s === '308' || s === 'NON_JSON_200');

    console.log('Perf smoke guidance:');
    if (onlyNetworkErrors) {
      console.log('  - Could not reach the app. Start the dev server and verify PERF_BASE_URL.');
      console.log('  - Example: npm run dev:turbo');
    } else if (hasAuthFailures) {
      console.log('  - Endpoints are reachable but unauthorized or redirected. Set PERF_COOKIE with a valid authenticated session cookie.');
    } else {
      console.log('  - Endpoints failed for non-network reasons. Inspect route logs and server output.');
    }
  }

  console.log('');
})();
