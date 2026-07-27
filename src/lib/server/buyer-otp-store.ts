import { supabaseAdmin } from '@/lib/supabase';

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
}

export interface LoginOtpCandidate extends LoginOtpContext {
  principal_type: 'buyer' | 'delegate' | 'seller';
  user_id: string | null;
  buyer_user_id: string | null;
  phone: string;
  business_name: string;
  contact_name: string | null;
  email?: string | null;
  full_name?: string | null;
  membership_id?: string | null;
}

// Legacy aliases — kept for callers that haven't been migrated yet
export type BuyerOtpContext = LoginOtpContext;
export type BuyerOtpCandidate = LoginOtpCandidate;

type OtpPendingRecord = {
  kind: 'pending';
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
        otp: data.otp,
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
        payload.otp = record.otp;
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
        payload.otp = record.otp;
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
