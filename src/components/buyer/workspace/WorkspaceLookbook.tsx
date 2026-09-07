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
    <div className="mx-auto grid w-full max-w-[1120px] grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3 xl:gap-6">
      {tenants.map((tenant) => (
        <article
          key={tenant.tenant_id}
          className={cn(
            'min-w-0 overflow-hidden border border-cream-300 bg-white shadow-sm',
            BUYER_CARD_RADIUS_CLASS,
          )}
        >
          <div className="flex min-h-[168px] items-center justify-center border-b border-cream-200 bg-cream-50 px-8 py-8">
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-cream-200 bg-white p-2 shadow-sm">
              <TenantLogo name={tenant.tenant_name} logoUrl={tenant.logo_url} size={96} shape="square" className="max-h-full max-w-full" />
            </div>
          </div>
          <div className="px-6 py-5">
            <h2 className="line-clamp-2 min-h-[2.4em] text-body font-semibold leading-snug text-cream-900">{tenant.tenant_name}</h2>
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
                      'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-4 py-3.5 text-left transition-colors',
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
