import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock, schemaMock } = vi.hoisted(() => {
  const rpcMock = vi.fn();
  const schemaMock = vi.fn(() => ({ rpc: rpcMock }));
  return { rpcMock, schemaMock };
});

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { schema: schemaMock } }));

import { consumePublicCatalogRateLimit, consumeEnumerationRateLimit } from '@/lib/server/public-catalog-rate-limit';
import { recordViolationAndCheckChallenge } from '@/lib/server/ip-challenge';

describe('public edge state uses single atomic RPCs', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    schemaMock.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('rate limiter makes exactly one RPC call with the keyed limit and window', async () => {
    rpcMock.mockResolvedValue({ data: [{ allowed: true, hit_count: 1 }], error: null });
    const result = await consumePublicCatalogRateLimit('1.2.3.4', 'acme', 'browse');
    expect(result).toEqual({ ok: true, retryAfterSec: 0 });
    expect(schemaMock).toHaveBeenCalledWith('app');
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('consume_public_catalog_rate_limit', {
      p_key: 'browse:1.2.3.4:acme',
      p_limit: 180,
      p_window_seconds: 60,
    });
  });

  it('uses the lower per-kind limits for search and enumeration', async () => {
    rpcMock.mockResolvedValue({ data: [{ allowed: true, hit_count: 1 }], error: null });
    await consumePublicCatalogRateLimit('1.2.3.4', 'acme', 'search');
    await consumeEnumerationRateLimit('1.2.3.4');
    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_key: 'search:1.2.3.4:acme', p_limit: 40 });
    expect(rpcMock.mock.calls[1][1]).toMatchObject({ p_key: 'enumeration:1.2.3.4:__enumeration__', p_limit: 20 });
  });

  it('returns 429 info when the RPC reports the window is exhausted', async () => {
    rpcMock.mockResolvedValue({ data: [{ allowed: false, hit_count: 61 }], error: null });
    const result = await consumePublicCatalogRateLimit('1.2.3.4', 'acme', 'browse');
    expect(result).toEqual({ ok: false, retryAfterSec: 60 });
  });

  it('fails open when the RPC errors', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await consumePublicCatalogRateLimit('1.2.3.4', 'acme', 'browse')).toEqual({ ok: true, retryAfterSec: 0 });
    rpcMock.mockRejectedValue(new Error('network'));
    expect(await consumePublicCatalogRateLimit('1.2.3.4', 'acme', 'browse')).toEqual({ ok: true, retryAfterSec: 0 });
  });

  it('challenge escalation is one RPC and maps the result', async () => {
    rpcMock.mockResolvedValue({ data: [{ challenge_required: true, violation_count: 3 }], error: null });
    const result = await recordViolationAndCheckChallenge('9.9.9.9');
    expect(result).toEqual({ challengeRequired: true, violationCount: 3 });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('record_ip_challenge_violation', { p_ip: '9.9.9.9', p_window_seconds: 900, p_threshold: 3 });
  });

  it('challenge escalation fails open on error', async () => {
    rpcMock.mockRejectedValue(new Error('down'));
    expect(await recordViolationAndCheckChallenge('9.9.9.9')).toEqual({ challengeRequired: false, violationCount: 0 });
  });
});
