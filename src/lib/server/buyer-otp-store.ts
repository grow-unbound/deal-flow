import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

export function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

export type CandidateKind = 'seller' | 'buyer';

export interface LoginOtpContext {
  kind: CandidateKind;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  tenant_whatsapp_number: string | null;
  tenant_whatsapp_display_name: string | null;
  role: string;
  buyer_id: string | null;
  // Disambiguates accounts that share a phone number but belong to different
  // auth users (currently only populated for seller candidates).
  email?: string | null;
}

export interface LoginOtpCandidate extends LoginOtpContext {
  principal_type: 'buyer' | 'delegate' | 'seller';
  user_id: string | null;
  buyer_user_id: string | null;
  phone: string;
  business_name: string;
  contact_name: string | null;
  full_name?: string | null;
  membership_id?: string | null;
}

// Legacy aliases — kept for callers that haven't been migrated yet
export type BuyerOtpContext = LoginOtpContext;
export type BuyerOtpCandidate = LoginOtpCandidate;

type OtpPendingRecord = {
  kind: 'pending';
  // Plaintext when constructed fresh by the send route (needed to dispatch via
  // WhatsApp); once round-tripped through the store, holds sha256(otp) — insert()/
  // set() hash it on write, get() returns the hash under this same field name, and
  // verify compares hashOtp(userInput) against it. Kept as one field rather than
  // splitting plaintext/hash types to avoid touching every call site.
  otp: string;
  phone: string;
  expiresAt: number;
  attempts: number;
  candidates: LoginOtpCandidate[];
};

type OtpVerifiedRecord = {
  kind: 'verified';
  phone: string;
  expiresAt: number;
  candidates: LoginOtpCandidate[];
};

export type BuyerOtpRecord = OtpPendingRecord | OtpVerifiedRecord;

// Supabase-backed OTP store
export const buyerOtpStore = {
  async get(ref_id: string): Promise<BuyerOtpRecord | null> {
    if (!supabaseAdmin) return null;
    try {
      const { data } = await supabaseAdmin.schema('app')
        .from('otp_sessions')
        .select('*')
        .eq('ref_id', ref_id)
        .is('deleted_at', null)
        .maybeSingle();

      if (!data) return null;

      return {
        kind: data.kind as 'pending' | 'verified',
        otp: data.otp_hash ?? data.otp,
        phone: data.phone,
        expiresAt: data.expires_at,
        attempts: data.attempts,
        candidates: data.candidates,
      };
    } catch (err) {
      console.error('[otp_store.get] error:', err);
      return null;
    }
  },

  async set(ref_id: string, record: BuyerOtpRecord): Promise<void> {
    if (!supabaseAdmin) return;
    try {
      const payload: Record<string, any> = {
        ref_id,
        phone: record.phone,
        kind: record.kind,
        expires_at: record.expiresAt,
        candidates: record.candidates,
      };
      if (record.kind === 'pending') {
        // record.otp here is always already-hashed — set() is only ever called
        // with a record previously returned by get() (verify route re-persisting
        // an updated attempt count), never with a freshly-generated plaintext OTP.
        // Only insert() (send route, brand-new record) hashes plaintext input.
        payload.otp_hash = record.otp;
        payload.attempts = record.attempts;
      }
      await supabaseAdmin.schema('app')
        .from('otp_sessions')
        .upsert(payload, { onConflict: 'ref_id' });
    } catch (err) {
      console.error('[otp_store.set] error:', err);
    }
  },

  async delete(ref_id: string): Promise<void> {
    if (!supabaseAdmin) return;
    try {
      await supabaseAdmin.schema('app')
        .from('otp_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('ref_id', ref_id);
    } catch (err) {
      console.error('[otp_store.delete] error:', err);
    }
  },

  /**
   * Returns milliseconds remaining before a new OTP may be sent to this phone, or 0
   * if none is pending / the cooldown has elapsed. Backs the OTP-send rate limit —
   * one indexed lookup (idx_otp_sessions_phone_kind) against the table already read
   * on every send, no separate infra.
   */
  async sendCooldownRemainingMs(phone: string, cooldownMs: number, otpTtlMs: number): Promise<number> {
    if (!supabaseAdmin) return 0;
    try {
      const { data } = await supabaseAdmin.schema('app')
        .from('otp_sessions')
        .select('expires_at')
        .eq('phone', phone)
        .eq('kind', 'pending')
        .is('deleted_at', null)
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return 0;
      const issuedAt = Number(data.expires_at) - otpTtlMs;
      const remaining = issuedAt + cooldownMs - Date.now();
      return remaining > 0 ? remaining : 0;
    } catch (err) {
      console.error('[otp_store.sendCooldownRemainingMs] error:', err);
      return 0;
    }
  },

  async insert(record: BuyerOtpRecord): Promise<string | null> {
    if (!supabaseAdmin) return null;
    try {
      const payload: Record<string, any> = {
        phone: record.phone,
        kind: record.kind,
        expires_at: record.expiresAt,
        candidates: record.candidates,
      };
      if (record.kind === 'pending') {
        // Only insert() ever receives a freshly-generated plaintext OTP (from the
        // send route) — hash it before it touches the DB.
        payload.otp_hash = hashOtp(record.otp);
        payload.attempts = record.attempts;
      }
      const { data } = await supabaseAdmin.schema('app')
        .from('otp_sessions')
        .insert(payload)
        .select('ref_id')
        .single();
      return data?.ref_id ?? null;
    } catch (err) {
      console.error('[otp_store.insert] error:', err);
      return null;
    }
  },
};

const VERIFIED_RECORD_TTL_MS = 5 * 60 * 1000;

/**
 * Writes a short-lived `verified` handoff record for the multi-account picker
 * and returns its ref_id (or null on failure). Shared by the OTP verify route
 * (candidates.length > 1) and the authenticated switch-account route — both
 * hand the resulting ref_id to the same /login/select-context picker.
 */
export async function writeVerifiedCandidatesRecord(
  phone: string,
  candidates: LoginOtpCandidate[],
): Promise<string | null> {
  return buyerOtpStore.insert({
    kind: 'verified',
    phone,
    expiresAt: Date.now() + VERIFIED_RECORD_TTL_MS,
    candidates,
  });
}
