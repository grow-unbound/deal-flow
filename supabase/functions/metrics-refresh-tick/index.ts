import { createClient } from 'npm:@supabase/supabase-js@2';

type TickStage = 'claim' | 'compute' | 'acknowledge' | 'fail' | 'release';
type TickResult = Record<string, unknown> | null;

interface ClaimIdentity {
  fencingEpoch: number | string;
  tenantId: string;
  domain: string;
}

interface StageResults {
  claim: TickResult;
  compute: TickResult;
  acknowledge: TickResult;
  fail: TickResult;
  release: TickResult;
}

class TickStageError extends Error {
  constructor(readonly stage: TickStage, message: string) {
    super(message);
    this.name = 'TickStageError';
  }
}

function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new Error('Missing required env var: SUPABASE_URL');

  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_KEY');
  if (!key) {
    throw new Error('Missing required env var: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let mismatch = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);

  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index % Math.max(leftBytes.length, 1)] ?? 0)
      ^ (rightBytes[index % Math.max(rightBytes.length, 1)] ?? 0);
  }
  return mismatch === 0;
}

function isAuthorized(request: Request): boolean {
  const expected = Deno.env.get('METRICS_REFRESH_TOKEN');
  const received = request.headers.get('x-metrics-refresh-token');
  return typeof expected === 'string' && expected.length >= 32
    && typeof received === 'string' && timingSafeEqual(received, expected);
}

function json(body: Record<string, unknown>, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

function normalizeResult(value: unknown): TickResult {
  const result = Array.isArray(value) ? value[0] : value;
  return result !== null && typeof result === 'object'
    ? result as Record<string, unknown>
    : null;
}

function claimIdentity(result: TickResult): ClaimIdentity | null {
  if (!result) return null;

  const fencingEpoch = result.fencing_epoch;
  const tenantId = result.tenant_id;
  const domain = result.domain;
  const validEpoch = typeof fencingEpoch === 'number' || typeof fencingEpoch === 'string';

  if (!validEpoch || typeof tenantId !== 'string' || typeof domain !== 'string') {
    return null;
  }

  return { fencingEpoch, tenantId, domain };
}

async function callStage(
  admin: ReturnType<typeof createAdminClient>,
  stage: TickStage,
  ownerToken: string,
  identity: ClaimIdentity | null,
  deadlineMs: number | null = null,
): Promise<TickResult> {
  const remainingMs = deadlineMs === null ? 3_500 : deadlineMs - performance.now();
  if (remainingMs <= 0) throw new TickStageError(stage, 'metrics_tick_wall_budget_exceeded');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, Math.min(remainingMs, 3_500)));
  const { data, error } = await admin
    .schema('app')
    .rpc('metrics_refresh_tick', {
      p_stage: stage,
      p_owner_token: ownerToken,
      p_fencing_epoch: identity?.fencingEpoch ?? null,
      p_tenant_id: identity?.tenantId ?? null,
      p_domain: identity?.domain ?? null,
    })
    .abortSignal(controller.signal);
  clearTimeout(timeout);

  if (error) throw new TickStageError(stage, error.message);
  return normalizeResult(data);
}

async function bestEffortStage(
  admin: ReturnType<typeof createAdminClient>,
  stage: 'fail' | 'release',
  ownerToken: string,
  identity: ClaimIdentity,
): Promise<TickResult> {
  try {
    return await callStage(admin, stage, ownerToken, identity);
  } catch (error) {
    console.error(`[metrics-refresh-tick] best-effort ${stage} failed`, error);
    return null;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return json(
      { ok: false, skipped: false, error: 'method_not_allowed', stages: null },
      405,
      { Allow: 'POST' },
    );
  }

  if (!isAuthorized(request)) {
    return json({ ok: false, skipped: false, error: 'unauthorized', stages: null }, 401);
  }

  const ownerToken = crypto.randomUUID();
  const stages: StageResults = {
    claim: null,
    compute: null,
    acknowledge: null,
    fail: null,
    release: null,
  };

  let identity: ClaimIdentity | null = null;
  const deadlineMs = performance.now() + 5_000;

  try {
    const admin = createAdminClient();
    stages.claim = await callStage(admin, 'claim', ownerToken, null, deadlineMs);
    identity = claimIdentity(stages.claim);

    if (!identity) {
      return json({
        ok: true,
        skipped: true,
        owner_token: ownerToken,
        reason: stages.claim?.status ?? 'no_work_claimed',
        stages,
      });
    }

    try {
      stages.compute = await callStage(admin, 'compute', ownerToken, identity, deadlineMs);
      stages.acknowledge = await callStage(admin, 'acknowledge', ownerToken, identity, deadlineMs);
    } catch (error) {
      stages.fail = await bestEffortStage(admin, 'fail', ownerToken, identity);
      stages.release = await bestEffortStage(admin, 'release', ownerToken, identity);
      throw error;
    }

    return json({
      ok: true,
      skipped: false,
      owner_token: ownerToken,
      stages,
    });
  } catch (error) {
    const stage = error instanceof TickStageError ? error.stage : 'initialization';
    console.error(`[metrics-refresh-tick] ${stage} failed`, error);

    return json({
      ok: false,
      skipped: false,
      owner_token: ownerToken,
      error: 'metrics_refresh_tick_failed',
      failed_stage: stage,
      message: error instanceof Error ? error.message : 'Unknown error',
      stages,
    }, 500);
  }
});
