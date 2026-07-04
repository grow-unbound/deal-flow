/**
 * WhatsApp Broadcast Phase C — seller-side implicit consent (spec §4.8).
 *
 * Seller users get no checkbox and no blocking UI: app.tenant_users.whatsapp_consent_at
 * is stamped silently the moment a seller's session is first established, same
 * trigger point as any other first-login bookkeeping. This is symmetry/audit
 * completeness only — sellers aren't expected to opt out of their own
 * business's notifications.
 *
 * Called from every path that establishes a seller session:
 *   - app/api/auth/signin/route.ts (email/password login)
 *   - app/api/auth/phone-otp/verify/route.ts (seller OTP login)
 *   - app/api/auth/phone-otp/select-context/route.ts (multi-account picker)
 *
 * Non-blocking by design — failures here must never break login.
 */

export async function stampSellerImplicitWhatsappConsent(
  tenantId: string,
  userId: string,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import('@/lib/supabase');
    if (!supabaseAdmin) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    await db
      .schema('app')
      .from('tenant_users')
      .update({
        whatsapp_consent_at: new Date().toISOString(),
        whatsapp_consent_method: 'implicit_first_login',
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .is('whatsapp_consent_at', null); // one-time stamp, never overwrite
  } catch (error) {
    // Never let consent bookkeeping break a seller login.
    console.error('[whatsapp-consent] failed to stamp seller implicit consent', error);
  }
}
