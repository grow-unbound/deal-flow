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
  if (!supabaseAdmin) return { challengeRequired: false, violationCount: 0 };

  try {
    const { data: existing } = await supabaseAdmin
      .schema('app')
      .from('ip_challenge_state')
      .select('violation_count, window_start')
      .eq('ip', ip)
      .maybeSingle();

    const windowStart = existing?.window_start ? new Date(existing.window_start as string).getTime() : 0;
    const inWindow = windowStart > now - VIOLATION_WINDOW_MS;
    const nextCount = inWindow ? Number(existing?.violation_count ?? 0) + 1 : 1;
    const nowIso = new Date(now).toISOString();

    await supabaseAdmin
      .schema('app')
      .from('ip_challenge_state')
      .upsert(
        {
          ip,
          violation_count: nextCount,
          window_start: inWindow && existing?.window_start ? existing.window_start : nowIso,
          updated_at: nowIso,
        },
        { onConflict: 'ip' },
      );

    return { challengeRequired: nextCount >= CHALLENGE_THRESHOLD, violationCount: nextCount };
  } catch (error) {
    console.error('[ip-challenge] failed to record violation', error);
    // Fail open — never let a tracking outage turn into an outright block.
    return { challengeRequired: false, violationCount: 0 };
  }
}
