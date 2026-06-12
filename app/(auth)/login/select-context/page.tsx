'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const SESSION_CONTEXTS_KEY = 'yukti_auth_contexts';

interface BuyerContext {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  buyer_id: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  buyer_admin: 'Admin',
  buyer_assistant: 'Team member',
};

function roleBadge(role: string) {
  return ROLE_LABELS[role] ?? role;
}

function SelectContextForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref_id = searchParams.get('ref_id') ?? '';

  const [contexts, setContexts] = useState<BuyerContext[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load contexts from sessionStorage
  useEffect(() => {
    if (!ref_id) {
      router.replace('/login/phone');
      return;
    }
    try {
      const raw = sessionStorage.getItem(SESSION_CONTEXTS_KEY);
      if (!raw) {
        router.replace('/login/phone');
        return;
      }
      const parsed: BuyerContext[] = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        router.replace('/login/phone');
        return;
      }
      setContexts(parsed);
    } catch {
      router.replace('/login/phone');
    }
  }, [ref_id, router]);

  async function handleSelect(ctx: BuyerContext) {
    setSelected(ctx.tenant_id);
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/phone-otp/select-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref_id,
          tenant_id: ctx.tenant_id,
          role: ctx.role,
        }),
      });

      const data: { success?: boolean; redirect?: string; error?: string } = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error ?? 'Selection failed. Please try again.');
        setSelected(null);
        return;
      }

      // Clean up sessionStorage
      try { sessionStorage.removeItem(SESSION_CONTEXTS_KEY); } catch { /* ignore */ }

      router.replace(data.redirect ?? '/shop');
    } catch {
      setError('Network error. Please check your connection and try again.');
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }

  if (!contexts) {
    // Loading/redirecting state
    return (
      <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-teal-300 rounded-md animate-pulse" />
          <div className="h-6 w-28 rounded bg-cream-200 animate-pulse" />
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
      {/* Logo */}
      <div className="flex items-center gap-3 mb-7">
        <div className="w-9 h-9 bg-teal-500 rounded-md flex items-center justify-center shrink-0">
          <span className="text-cream-50 font-display font-medium text-sm">yk</span>
        </div>
        <span className="font-display font-medium text-teal-500 text-xl">yukti</span>
      </div>

      <h1 className="text-h3 font-display text-cream-900 mb-1">Choose account</h1>
      <p className="text-body-sm text-cream-600 mb-6">
        Your number is linked to multiple businesses. Select one to continue.
      </p>

      <div className="space-y-3">
        {contexts.map((ctx) => {
          const isSelected = selected === ctx.tenant_id;
          const isDisabled = loading;

          return (
            <button
              key={ctx.tenant_id}
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
                <div className="min-w-0">
                  <p className="text-body-sm font-semibold text-cream-900 truncate">
                    {ctx.tenant_name}
                  </p>
                  <p className="text-caption text-cream-600 mt-0.5">{ctx.tenant_slug}</p>
                </div>
                <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-teal-50 text-teal-700 border border-teal-200">
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

      {error && (
        <p className="mt-4 text-caption text-danger-500 bg-danger-50 px-3 py-2 rounded-md">
          {error}
        </p>
      )}

      <div className="mt-6 pt-4 border-t border-cream-200 text-center">
        <button
          type="button"
          onClick={() => router.replace('/login/phone')}
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
      <div className="flex items-center gap-3 mb-7">
        <div className="w-9 h-9 bg-teal-300 rounded-md animate-pulse" />
        <div className="h-6 w-28 rounded bg-cream-200 animate-pulse" />
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
