'use client';

import { useEffect, useMemo, useState } from 'react';
import { getStoredBuyerPreviewToken } from '@/lib/auth-session';
import { apiFetch } from '@/lib/api-fetch';

function inr(n: number): string {
  const s = Math.round(n).toString();
  if (s.length <= 3) return '₹' + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return '₹' + grouped + ',' + last3;
}

function RowIcon({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'ember' | 'danger' }) {
  const bg = variant === 'ember' ? '#FBEFE3' : variant === 'danger' ? '#F6E5DF' : 'var(--cream-100)';
  const fg = variant === 'ember' ? '#874720' : variant === 'danger' ? '#9C3A22' : 'var(--cream-700)';
  return (
    <div style={{ width: 32, height: 32, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: fg, flexShrink: 0 }}>
      {children}
    </div>
  );
}

const ChevR = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cream-500)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
);

export default function ProfilePage() {
  const [isPreview, setIsPreview] = useState(false);
  const [meData, setMeData] = useState<null | {
    greeting_name?: string | null;
    business_name: string;
    contact_name: string;
    credit_limit: number;
    credit_used: number;
  }>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveMode() {
      try {
        const response = await apiFetch('/api/buyer/me');
        if (!response.ok) {
          if (!cancelled) setIsPreview(Boolean(getStoredBuyerPreviewToken()));
          return;
        }

        const data = await response.json() as {
          mode?: 'buyer' | 'preview';
          greeting_name?: string | null;
          business_name: string;
          contact_name: string;
          credit_limit: number;
          credit_used: number;
        };
        if (!cancelled) {
          setIsPreview(data.mode === 'preview');
          setMeData({
            greeting_name: data.greeting_name,
            business_name: data.business_name,
            contact_name: data.contact_name,
            credit_limit: data.credit_limit,
            credit_used: data.credit_used,
          });
        }
      } catch {
        if (!cancelled) setIsPreview(Boolean(getStoredBuyerPreviewToken()));
      }
    }

    void resolveMode();
    return () => {
      cancelled = true;
    };
  }, []);

  const profile = useMemo(() => ({
    name: isPreview ? 'Buyer App Preview' : (meData?.greeting_name || meData?.contact_name || meData?.business_name || 'Buyer'),
    business: isPreview ? 'Preview access' : (meData?.business_name || 'Buyer business'),
    phone: isPreview ? 'Uses your seller session in a new tab' : '+91 98103 47281',
    gstin: isPreview ? 'No buyer GSTIN in preview mode' : '07AABCR1234M1Z5',
    tier: isPreview ? 'buyer_admin preview' : 'A-class',
    credit: isPreview ? 0 : (meData?.credit_limit ?? 0),
    used: isPreview ? 0 : (meData?.credit_used ?? 0),
  }), [isPreview, meData]);

  const initials = profile.name.split(' ').map((s) => s[0]).join('').slice(0, 2);

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 18px 20px' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--teal-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--yk-text-xl)', fontWeight: 700, color: '#fff', marginBottom: 12 }}>
          {initials}
        </div>
        <div style={{ fontSize: 'var(--yk-text-lg)', fontWeight: 700, color: 'var(--cream-900)', fontFamily: 'var(--font-display)' }}>{profile.name}</div>
        <div style={{ fontSize: 'var(--yk-text-base)', color: 'var(--cream-600)', marginTop: 4 }}>{profile.business} · {profile.tier}</div>
        {isPreview ? (
          <div style={{ marginTop: 12, borderRadius: 999, background: 'var(--cream-50)', border: '1px solid var(--border-1)', padding: '6px 10px', fontSize: 'var(--yk-text-sm)', color: 'var(--cream-700)' }}>
            Preview mode is active. Buyer-specific values are shown as placeholders.
          </div>
        ) : null}
      </div>

      <div style={{ padding: '0 16px' }}>
        <p style={{ fontSize: 'var(--yk-text-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-600)', fontFamily: 'var(--font-body)', fontWeight: 500, padding: '0 4px 8px' }}>Account</p>
        <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 14, overflow: 'hidden' }}>
          {[
            {
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
              label: 'Business details', sub: profile.business, right: <ChevR />,
            },
            {
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
              label: 'GSTIN', sub: profile.gstin, right: <ChevR />, mono: true,
            },
            {
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>,
              variant: 'ember' as const,
              label: 'Credit limit', sub: `${inr(profile.used)} used of ${inr(profile.credit)}`, right: <ChevR />,
            },
            {
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
              label: 'Delivery locations', sub: isPreview ? 'No buyer delivery profile in preview mode' : '2 saved · Delhi, Gurugram', right: <ChevR />,
            },
          ].map((row, i, arr) => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--border-1)' : 'none', cursor: 'pointer' }}>
              <RowIcon variant={row.variant}>{row.icon}</RowIcon>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--yk-text-base)', fontWeight: 500, color: 'var(--cream-900)' }}>{row.label}</div>
                <div
                  style={{
                    fontSize: row.mono ? 'var(--yk-text-base)' : 'var(--yk-text-sm)',
                    color: 'var(--cream-600)',
                    marginTop: 1,
                    fontFamily: row.mono ? 'var(--font-mono)' : 'var(--font-body)',
                  }}
                >
                  {row.sub}
                </div>
              </div>
              {row.right}
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px 16px 0' }}>
        <p style={{ fontSize: 'var(--yk-text-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-600)', fontFamily: 'var(--font-body)', fontWeight: 500, padding: '0 4px 8px' }}>Preferences</p>
        <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 14, overflow: 'hidden' }}>
          {[
            {
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>,
              label: 'Notifications', sub: 'WhatsApp + push', right: <span style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--teal-600)', fontWeight: 600 }}>On</span>,
            },
            {
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>,
              label: 'Catalog view', sub: 'Lookbook or grid', right: <span style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--cream-700)' }}>Lookbook</span>,
            },
            {
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
              label: 'Language', sub: 'Display language', right: <span style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--cream-700)' }}>English</span>,
            },
            {
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
              label: 'Help & support', sub: 'Chat with us on WhatsApp', right: <ChevR />,
            },
          ].map((row, i, arr) => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--border-1)' : 'none', cursor: 'pointer' }}>
              <RowIcon>{row.icon}</RowIcon>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--yk-text-base)', fontWeight: 500, color: 'var(--cream-900)' }}>{row.label}</div>
                <div style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--cream-600)', marginTop: 1 }}>{row.sub}</div>
              </div>
              {row.right}
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', cursor: 'pointer' }}>
            <RowIcon variant="danger">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            </RowIcon>
            <div>
              <div style={{ fontSize: 'var(--yk-text-base)', fontWeight: 500, color: '#9C3A22' }}>Log out</div>
              <div style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--cream-600)', marginTop: 1 }}>You'll need a fresh OTP next time.</div>
            </div>
          </div>
        </div>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 'var(--yk-text-xs)', color: 'var(--cream-600)', fontFamily: 'var(--font-body)' }}>Yukti buyer · <span className="tabular-inline">v1.0.0</span></p>
      </div>
    </div>
  );
}
