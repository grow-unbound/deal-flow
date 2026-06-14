export interface BuyerOtpContext {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  buyer_id: string;
  role: 'buyer_admin' | 'buyer_assistant';
}

export interface BuyerOtpCandidate extends BuyerOtpContext {
  principal_type: 'buyer' | 'delegate';
  user_id: string | null;
  buyer_user_id: string | null;
  phone: string;
  business_name: string;
  contact_name: string | null;
}

type OtpPendingRecord = {
  kind: 'pending';
  otp: string;
  phone: string;
  expiresAt: number;
  attempts: number;
  candidates: BuyerOtpCandidate[];
};

type OtpVerifiedRecord = {
  kind: 'verified';
  phone: string;
  expiresAt: number;
  candidates: BuyerOtpCandidate[];
};

export type BuyerOtpRecord = OtpPendingRecord | OtpVerifiedRecord;

export const buyerOtpStore = new Map<string, BuyerOtpRecord>();
