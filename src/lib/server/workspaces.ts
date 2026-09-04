import type { BuyerLoginCandidate } from '@/lib/server/buyer-access';

export interface WorkspaceAccount {
  buyer_id: string;
  business_name: string;
  contact_name: string | null;
  role: string;
}

export interface WorkspaceTenantGroup {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  logo_url: string | null;
  accounts: WorkspaceAccount[];
}

/** One account per buyer_id within each tenant (ignore duplicate delegate rows). */
export function groupBuyerCandidatesByTenant(candidates: BuyerLoginCandidate[]): WorkspaceTenantGroup[] {
  const tenantOrder: string[] = [];
  const groups = new Map<string, WorkspaceTenantGroup>();
  const seenBuyerIds = new Map<string, Set<string>>();

  for (const candidate of candidates) {
    let seen = seenBuyerIds.get(candidate.tenant_id);
    if (!seen) {
      seen = new Set<string>();
      seenBuyerIds.set(candidate.tenant_id, seen);
    }
    if (seen.has(candidate.buyer_id)) continue;
    seen.add(candidate.buyer_id);

    const existing = groups.get(candidate.tenant_id);
    const account: WorkspaceAccount = {
      buyer_id: candidate.buyer_id,
      business_name: candidate.business_name,
      contact_name: candidate.contact_name,
      role: candidate.role,
    };

    if (existing) {
      existing.accounts.push(account);
    } else {
      tenantOrder.push(candidate.tenant_id);
      groups.set(candidate.tenant_id, {
        tenant_id: candidate.tenant_id,
        tenant_name: candidate.tenant_name,
        tenant_slug: candidate.tenant_slug,
        logo_url: candidate.tenant_logo_url,
        accounts: [account],
      });
    }
  }

  return tenantOrder.map((tenantId) => groups.get(tenantId)!);
}
