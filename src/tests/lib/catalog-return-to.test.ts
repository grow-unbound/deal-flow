import { describe, expect, it } from 'vitest';
import {
  filterBuyerCandidatesForReturnTo,
  pickPreferredBuyerCandidate,
  tenantSlugFromReturnTo,
} from '@/lib/server/catalog-return-to';
import type { LoginOtpCandidate } from '@/lib/server/buyer-otp-store';

function candidate(overrides: Partial<LoginOtpCandidate>): LoginOtpCandidate {
  return {
    kind: 'buyer',
    tenant_id: 't1',
    tenant_name: 'Tenant One',
    tenant_slug: 'tenant-one',
    tenant_whatsapp_number: null,
    tenant_whatsapp_display_name: null,
    tenant_logo_url: null,
    role: 'buyer_admin',
    buyer_id: 'b1',
    principal_type: 'buyer',
    user_id: 'u1',
    buyer_user_id: null,
    phone: '9876543210',
    business_name: 'Biz One',
    contact_name: null,
    ...overrides,
  };
}

describe('catalog-return-to', () => {
  it('extracts tenant slug from return_to', () => {
    expect(tenantSlugFromReturnTo('https://wineyard.useyukti.in/product/1')).toBe('wineyard');
    expect(tenantSlugFromReturnTo('https://catalog.useyukti.in/login')).toBeNull();
  });

  it('filters buyer candidates for return_to tenant', () => {
    const wineyard = candidate({ tenant_slug: 'wineyard', buyer_id: 'b1' });
    const other = candidate({ tenant_slug: 'other', tenant_id: 't2', buyer_id: 'b2' });
    const filtered = filterBuyerCandidatesForReturnTo(
      [wineyard, other],
      'https://wineyard.useyukti.in/',
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.tenant_slug).toBe('wineyard');
  });

  it('prefers buyer_admin when multiple accounts at same tenant', () => {
    const assistant = candidate({ role: 'buyer_assistant', buyer_id: 'b2', business_name: 'A' });
    const admin = candidate({ role: 'buyer_admin', buyer_id: 'b1', business_name: 'Z' });
    const picked = pickPreferredBuyerCandidate([assistant, admin]);
    expect(picked.role).toBe('buyer_admin');
  });
});
