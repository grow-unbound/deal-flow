export type CandidateKind = 'seller' | 'buyer';

export interface LoginOtpContext {
  kind: CandidateKind;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
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

export const buyerOtpStore = new Map<string, BuyerOtpRecord>();
