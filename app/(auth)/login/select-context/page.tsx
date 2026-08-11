'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Store, ShoppingBag } from 'lucide-react';
import { YuktiLogo } from '@/components/brand/YuktiLogo';
import { supabaseBrowser } from '@/lib/supabase-browser';
import type { LoginOtpCandidate } from '@/lib/server/buyer-otp-store';

const SESSION_CONTEXTS_KEY = 'yukti_auth_contexts';

interface SessionPayload {
  access_token: string;
  refresh_token: string;
}

const ROLE_LABELS: Record<string, string> = {
  buyer_admin: 'Admin',
  buyer_assistant: 'Team member',
  seller_admin: 'Admin',
  seller_assistant: 'Assistant',
};

function roleBadge(role: string) {
  return ROLE_LABELS[role] ?? role;
}

// Must be unique per distinct account: two accounts at the same buyer (an owner
// row and a delegate row, or two delegates) can share kind+tenant_id+buyer_id
// and even role — include the underlying user/delegate id so React never
// collapses two real, different accounts onto the same key.
function contextKey(ctx: LoginOtpCandidate) {
  return `${ctx.kind}:${ctx.tenant_id}:${ctx.buyer_id ?? 'no-buyer'}:${ctx.role}:${ctx.user_id ?? ''}:${ctx.buyer_user_id ?? ''}`;
}

// Defensive: dedup exact-duplicate candidates (same account surfaced twice by
// the backend) without ever dropping two genuinely distinct accounts.
function dedupeContexts(contexts: LoginOtpCandidate[]) {
  const seen = new Set<string>();
  return contexts.filter((ctx) => {
    const key = contextKey(ctx);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Seller row: person's name (falls back to role if a legacy account has no
// backfilled full_name). Buyer row: the buying business's name.
function accountDisplayName(ctx: LoginOtpCandidate) {
  if (ctx.kind === 'seller') return ctx.contact_name?.trim() || roleBadge(ctx.role);
  return ctx.business_name?.trim() || roleBadge(ctx.role);
}

// Secondary line: seller's email, or the buyer contact/delegate person's name
// (distinct from the business name shown as the primary line above).
function accountSecondaryLine(ctx: LoginOtpCandidate) {
  if (ctx.kind === 'seller') return ctx.email?.trim() || null;
  return ctx.contact_name?.trim() || null;
}

function groupByTenant(contexts: LoginOtpCandidate[]) {
  const order: string[] = [];
  const groups = new Map<string, { tenantName: string; accounts: LoginOtpCandidate[] }>();
  for (const ctx of contexts) {
    const existing = groups.get(ctx.tenant_id);
    if (existing) {
      existing.accounts.push(ctx);
    } else {
      order.push(ctx.tenant_id);
      groups.set(ctx.tenant_id, { tenantName: ctx.tenant_name, accounts: [ctx] });
    }
  }
  return order.map((tenantId) => ({ tenantId, ...groups.get(tenantId)! }));
}

function SelectContextForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref_id = searchParams.get('ref_id') ?? '';

  const [contexts, setContexts] = useState<LoginOtpCandidate[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load contexts from sessionStorage
  useEffect(() => {
    if (!ref_id) {
      router.replace('/login');
      return;
    }
    try {
      const raw = sessionStorage.getItem(SESSION_CONTEXTS_KEY);
      if (!raw) {
        router.replace('/login');
        return;
      }
      const parsed: LoginOtpCandidate[] = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        router.replace('/login');
        return;
      }
      setContexts(dedupeContexts(parsed));
    } catch {
      router.replace('/login');
    }
  }, [ref_id, router]);

  async function handleSelect(ctx: LoginOtpCandidate) {
    setSelected(contextKey(ctx));
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/phone-otp/select-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref_id,
          kind: ctx.kind,
          tenant_id: ctx.tenant_id,
          buyer_id: ctx.buyer_id,
          role: ctx.role,
        }),
      });

      const data: {
        success?: boolean;
        redirect?: string;
        session?: SessionPayload;
        error?: string;
      } = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error ?? 'Selection failed. Please try again.');
        setSelected(null);
        setLoading(false);
        return;
      }

      if (data.session?.access_token && data.session?.refresh_token) {
        await supabaseBrowser.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      try { sessionStorage.removeItem(SESSION_CONTEXTS_KEY); } catch { /* ignore */ }

      // Deliberately leave `loading` true — we're navigating away, and resetting
      // it here would flash the picker back to its interactive state for a frame
      // before the navigation unmounts it.
      //
      // Hard navigation, not router.replace()/router.refresh(): switching accounts
      // frequently re-lands on a pathname already visited in this tab (e.g. /dashboard
      // for a different tenant). Next's client Router Cache can serve that cached RSC
      // payload back — embedding the PREVIOUS tenant's data — and router.refresh()
      // racing immediately after replace() doesn't reliably bust it. A full page load
      // guarantees a clean slate, same as signOut()'s window.location.replace(...).
      window.location.assign(data.redirect ?? '/login');
    } catch {
      setError('Network error. Please check your connection and try again.');
      setSelected(null);
      setLoading(false);
    }
  }

  if (!contexts) {
    return (
      <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8">
        <div className="mb-6 flex justify-center">
          <div className="h-14 w-[76px] rounded-xl bg-cream-200 animate-pulse" />
        </div>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-cream-200 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8">
      <div className="mb-7 flex justify-center">
        <YuktiLogo variant="stacked-lockup" className="h-14 w-[76px]" priority />
      </div>

      <h1 className="text-h3 font-display text-cream-900 mb-1">Choose account</h1>
      <p className="text-body-sm text-cream-600 mb-6">
        Your number is linked to multiple accounts. Select one to continue.
      </p>

      <div className="space-y-5">
        {groupByTenant(contexts).map((group) => (
          <div key={group.tenantId}>
            <p className="text-caption font-semibold uppercase tracking-wide text-cream-500 mb-2 truncate">
              {group.tenantName}
            </p>
            <div className="space-y-2">
              {group.accounts.map((ctx) => {
                const key = contextKey(ctx);
                const isSelected = selected === key;
                const isDisabled = loading;
                const Icon = ctx.kind === 'seller' ? Store : ShoppingBag;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => !isDisabled && handleSelect(ctx)}
                    disabled={isDisabled}
                    className={[
                      'w-full text-left px-4 py-3.5 rounded-lg border transition-all duration-base',
                      'bg-[var(--bg-surface)] hover:bg-cream-50',
                      isSelected
                        ? 'border-teal-500 ring-2 ring-teal-500/20 shadow-sm'
                        : 'border-cream-300 hover:border-cream-400',
                      isDisabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-cream-100 text-cream-700">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-body-sm font-semibold text-cream-900 truncate">
                            {accountDisplayName(ctx)}
                          </p>
                          {accountSecondaryLine(ctx) && (
                            <p className="text-caption text-cream-600 mt-0.5 truncate">{accountSecondaryLine(ctx)}</p>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200">
                        {roleBadge(ctx.role)}
                      </span>
                    </div>
                    {isSelected && loading && (
                      <p className="text-caption text-teal-600 mt-1.5">Signing you in…</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="mt-4 text-caption text-danger-500 bg-danger-50 px-3 py-2 rounded-md">
          {error}
        </p>
      )}

      <div className="mt-6 pt-4 border-t border-cream-200 text-center">
        <button
          type="button"
          onClick={() => router.replace('/login')}
          className="text-caption text-ember-400 hover:text-ember-500 font-medium transition-colors"
        >
          ← Back to login
        </button>
      </div>
    </div>
  );
}

function SelectContextFallback() {
  return (
    <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8">
      <div className="mb-7 flex justify-center">
        <div className="h-14 w-[76px] rounded-xl bg-cream-200 animate-pulse" />
      </div>
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-cream-200 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default function SelectContextPage() {
  return (
    <Suspense fallback={<SelectContextFallback />}>
      <SelectContextForm />
    </Suspense>
  );
}
