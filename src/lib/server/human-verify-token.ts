// Edge-runtime-safe (middleware.ts imports this) — signed cookie proving an
// IP passed a Turnstile challenge recently, so a real human who trips the
// enumeration rate limit isn't stuck re-solving a challenge on every request
// for the rest of their session. Same signing primitive as tenant-flags-token.ts.
import { createSignedToken, verifySignedToken } from '@/lib/server/signed-token';

export const HUMAN_VERIFIED_COOKIE = 'df_human_verified';
const TOKEN_TYPE = 'human_verified_v1';
export const HUMAN_VERIFIED_TTL_SECONDS = 60 * 60; // 1 hour

interface HumanVerifiedPayload {
  typ: typeof TOKEN_TYPE;
  ip: string;
  iat: number;
  exp: number;
}

function getSecret(): string {
  return (
    process.env.TENANT_FLAGS_TOKEN_SECRET
    ?? process.env.SUPABASE_SERVICE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ?? 'yukti-human-verify-dev-secret'
  );
}

export async function createHumanVerifiedToken(ip: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const payload: HumanVerifiedPayload = {
    typ: TOKEN_TYPE,
    ip,
    iat: now,
    exp: now + HUMAN_VERIFIED_TTL_SECONDS,
  };
  return createSignedToken(getSecret(), payload);
}

/** Bound to the requesting IP — a token stolen/replayed from another IP doesn't verify. */
export async function verifyHumanVerifiedToken(
  token: string,
  ip: string,
  now = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const payload = await verifySignedToken(getSecret(), token) as HumanVerifiedPayload | null;
  if (!payload) return false;
  if (payload.typ !== TOKEN_TYPE) return false;
  if (payload.ip !== ip) return false;
  if (!payload.exp || payload.exp <= now) return false;
  return true;
}
