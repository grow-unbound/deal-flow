import { supabaseAdmin } from '@/lib/supabase';

// After this many enumeration-rate-limit hits within the window, escalate
// from a silent 429 to an interactive Turnstile challenge.
const CHALLENGE_THRESHOLD = 3;
const VIOLATION_WINDOW_MS = 15 * 60_000;

/**
 * Records one rate-limit violation for an IP and reports whether it has now
 * crossed the threshold for an interactive challenge. Same sliding-window
 * shape as public-catalog-rate-limit.ts, kept in its own table since this is
 * escalation state, not the rate-limit counter itself.
 */
export async function recordViolationAndCheckChallenge(
  ip: string,
  now = Date.now(),
): Promise<{ challengeRequired: boolean; violationCount: number }> {
  void now;
  if (!supabaseAdmin) return { challengeRequired: false, violationCount: 0 };

  try {
    // One atomic round trip (migration 20260920145507) instead of SELECT + UPSERT.
    const { data, error } = await supabaseAdmin.schema('app').rpc('record_ip_challenge_violation', {
      p_ip: ip,
      p_window_seconds: VIOLATION_WINDOW_MS / 1000,
      p_threshold: CHALLENGE_THRESHOLD,
    });
    if (error) throw error;

    const row = (Array.isArray(data) ? data[0] : data) as
      | { challenge_required?: boolean; violation_count?: number }
      | null
      | undefined;
    return {
      challengeRequired: Boolean(row?.challenge_required),
      violationCount: Number(row?.violation_count ?? 0),
    };
  } catch (error) {
    console.error('[ip-challenge] failed to record violation', error);
    // Fail open — never let a tracking outage turn into an outright block.
    return { challengeRequired: false, violationCount: 0 };
  }
}
