import { describe, expect, it } from 'vitest';
import { groupBuyerCandidatesByTenant } from '@/lib/server/workspaces';
import type { BuyerLoginCandidate } from '@/lib/server/buyer-access';

function makeCandidate(overrides: Partial<BuyerLoginCandidate> & Pick<BuyerLoginCandidate, 'tenant_id' | 'buyer_id'>): BuyerLoginCandidate {
  return {
    tenant_id: overrides.tenant_id,
    tenant_name: overrides.tenant_name ?? 'Tenant',
    tenant_slug: overrides.tenant_slug ?? 'tenant',
    tenant_whatsapp_number: null,
    tenant_whatsapp_display_name: null,
    tenant_logo_url: overrides.tenant_logo_url ?? null,
    buyer_id: overrides.buyer_id,
    role: overrides.role ?? 'buyer_admin',
    principal_type: overrides.principal_type ?? 'buyer',
    user_id: overrides.user_id ?? 'user-1',
    buyer_user_id: overrides.buyer_user_id ?? null,
    phone: overrides.phone ?? '+919999999999',
    business_name: overrides.business_name ?? 'Business',
    contact_name: overrides.contact_name ?? 'Contact',
    buyer_app_enabled: true,
    tenant_app_enabled: true,
  };
}

describe('groupBuyerCandidatesByTenant', () => {
  it('groups accounts under tenants and dedupes duplicate buyer_id rows', () => {
    const candidates = [
      makeCandidate({ tenant_id: 't1', buyer_id: 'b1', tenant_name: 'Alpha', business_name: 'Alpha Retail' }),
      makeCandidate({ tenant_id: 't1', buyer_id: 'b1', tenant_name: 'Alpha', business_name: 'Alpha Retail', buyer_user_id: 'delegate-1', role: 'buyer_assistant' }),
      makeCandidate({ tenant_id: 't1', buyer_id: 'b2', tenant_name: 'Alpha', business_name: 'Alpha Wholesale' }),
      makeCandidate({ tenant_id: 't2', buyer_id: 'b3', tenant_name: 'Beta', business_name: 'Beta Store' }),
    ];

    const groups = groupBuyerCandidatesByTenant(candidates);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.tenant_id).toBe('t1');
    expect(groups[0]?.accounts).toHaveLength(2);
    expect(groups[1]?.tenant_id).toBe('t2');
    expect(groups[1]?.accounts).toHaveLength(1);
  });
});
