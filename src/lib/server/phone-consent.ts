import { normalizeIndianPhone } from '@/lib/phone';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * WhatsApp/TRAI consent is phone-level, not per-tenant-buyer-row: a phone
 * consents once, ever, across every tenant relationship it will ever have.
 * app.phone_consents is the source of truth; app.buyers.whatsapp_consent_at
 * is kept as a dual-write for the other existing readers of that column
 * (profile display, etc.) — not read here.
 */

export async function hasPhoneConsented(phone: string): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const normalized = normalizeIndianPhone(phone);

  try {
    const { data, error } = await supabaseAdmin
      .schema('app')
      .from('phone_consents')
      .select('phone')
      .eq('phone', normalized)
      .maybeSingle();

    if (error) {
      console.error('[phone-consent] lookup failed', error);
      return false;
    }

    return Boolean(data);
  } catch (err) {
    // Never let a consent lookup failure break login — same defensive
    // posture as the buyer-row check this replaced.
    console.error('[phone-consent] lookup threw', err);
    return false;
  }
}

/** Returns '/consent' if this phone has never consented, else null. */
export async function requirePhoneConsentRedirect(phone: string | null): Promise<string | null> {
  if (!phone) return null;
  const consented = await hasPhoneConsented(phone);
  return consented ? null : '/consent';
}

export async function stampPhoneConsent(
  phone: string,
  method: string,
  buyerId?: string | null,
): Promise<void> {
  if (!supabaseAdmin) return;
  const normalized = normalizeIndianPhone(phone);
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .schema('app')
    .from('phone_consents')
    .upsert(
      { phone: normalized, consented_at: now, method, updated_at: now },
      { onConflict: 'phone', ignoreDuplicates: true },
    );
  if (error) {
    console.error('[phone-consent] failed to stamp phone_consents', error);
  }

  // Dual-write the legacy per-buyer-row column so existing readers (profile
  // display, etc.) stay correct without a wider migration.
  if (buyerId) {
    const { error: buyerError } = await supabaseAdmin
      .schema('app')
      .from('buyers')
      .update({
        whatsapp_consent_at: now,
        whatsapp_consent_method: method,
        updated_at: now,
      })
      .eq('id', buyerId)
      .is('whatsapp_consent_at', null);
    if (buyerError) {
      console.error('[phone-consent] failed to dual-write buyers.whatsapp_consent_at', buyerError);
    }
  }
}
