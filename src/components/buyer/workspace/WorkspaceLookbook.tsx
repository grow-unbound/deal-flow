'use client';

import { TenantLogo } from '@/components/brand/TenantLogo';
import { BUYER_CARD_RADIUS_CLASS } from '@/lib/buyer-ui';
import { cn } from '@/lib/utils';
import type { WorkspaceAccount, WorkspaceTenantGroup } from '@/lib/server/workspaces';

const ROLE_LABELS: Record<string, string> = {
  buyer_admin: 'Admin',
  buyer_assistant: 'Team member',
};

function roleBadge(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export interface WorkspaceLookbookProps {
  tenants: WorkspaceTenantGroup[];
  pendingAccountKey?: string | null;
  selectedAccountKey?: string | null;
  onSelectAccount: (tenant: WorkspaceTenantGroup, account: WorkspaceAccount) => void;
}

export function WorkspaceLookbook({
  tenants,
  pendingAccountKey,
  selectedAccountKey,
  onSelectAccount,
}: WorkspaceLookbookProps): React.ReactNode {
  const activeKey = pendingAccountKey ?? selectedAccountKey ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
      {tenants.map((tenant) => (
        <article
          key={tenant.tenant_id}
          className={cn(
            'overflow-hidden border border-cream-300 bg-white shadow-sm',
            BUYER_CARD_RADIUS_CLASS,
          )}
        >
          <div className="flex aspect-[16/9] items-center justify-center border-b border-cream-200 bg-cream-50 px-8 py-6">
            <TenantLogo name={tenant.tenant_name} logoUrl={tenant.logo_url} size={112} />
          </div>
          <div className="px-6 py-5">
            <h2 className="text-body font-semibold text-cream-900">{tenant.tenant_name}</h2>
            <div className="mt-4 space-y-2">
              {tenant.accounts.map((account) => {
                const key = `${tenant.tenant_id}:${account.buyer_id}:${account.role}`;
                const isActive = activeKey === key;
                const isPending = pendingAccountKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={Boolean(pendingAccountKey)}
                    onClick={() => onSelectAccount(tenant, account)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
                      isActive
                        ? 'border-teal-500 bg-teal-50/40 ring-2 ring-teal-500/20'
                        : 'border-cream-200 hover:border-teal-300 hover:bg-teal-50/30',
                      pendingAccountKey ? 'disabled:cursor-not-allowed disabled:opacity-60' : '',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-body-sm font-medium text-cream-900">
                        {account.business_name}
                      </span>
                      {account.contact_name ? (
                        <span className="mt-0.5 block truncate text-caption text-cream-600">
                          {account.contact_name}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 rounded-full bg-cream-100 px-2.5 py-0.5 text-caption font-medium text-cream-700">
                      {isPending ? 'Opening…' : roleBadge(account.role)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
