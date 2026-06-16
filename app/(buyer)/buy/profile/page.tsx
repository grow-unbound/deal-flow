'use client';

import { useEffect, useMemo, useState } from 'react';
import { getStoredBuyerPreviewToken } from '@/lib/auth-session';
import { apiFetch } from '@/lib/api-fetch';

function inr(n: number): string {
  const s = Math.round(n).toString();
  if (s.length <= 3) return '₹' + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return '₹' + rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}

const ChevR = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cream-400)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

function RowIcon({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'ember' | 'danger' }) {
  const bg = variant === 'ember' ? '#FBEFE3' : variant === 'danger' ? '#F6E5DF' : 'var(--cream-100)';
  const fg = variant === 'ember' ? '#874720' : variant === 'danger' ? '#9C3A22' : 'var(--cream-700)';
  return (
    <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: fg, flexShrink: 0 }}>
      {children}
    </div>
  );
}

// ─── BusinessEditSheet ────────────────────────────────────────────────────────

function BusinessEditSheet({
  open,
  onClose,
  businessName,
  contactName,
  phone,
  tier,
}: {
  open: boolean;
  onClose: () => void;
  businessName: string;
  contactName: string;
  phone: string;
  tier: string;
}) {
  const [name, setName] = useState(businessName);
  const [owner, setOwner] = useState(contactName);

  useEffect(() => {
    if (open) { setName(businessName); setOwner(contactName); }
  }, [open, businessName, contactName]);

  if (!open) return null;

  const inputCls = 'w-full rounded-lg px-3 py-2.5 text-sm border focus:outline-none focus:ring-2 transition-colors';

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      />
      {/* Sheet */}
      <div
        style={{
          position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: 468, zIndex: 50,
          background: '#fff', borderRadius: '20px 20px 0 0',
          padding: '0 20px 32px',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.14)',
        }}
      >
        {/* Handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--cream-300)', margin: '12px auto 0' }} />
        {/* Header */}
        <div style={{ padding: '18px 0 16px' }}>
          <h2 style={{ fontSize: 'var(--yk-text-md)', fontWeight: 700, color: 'var(--cream-900)' }}>Business details</h2>
          <p style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--cream-600)', marginTop: 2 }}>Update your business information.</p>
        </div>
        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--yk-text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cream-600)', marginBottom: 6 }}>Business name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} style={{ borderColor: 'var(--border-1)', background: 'var(--cream-50)', color: 'var(--cream-900)' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--yk-text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cream-600)', marginBottom: 6 }}>Owner name</label>
            <input value={owner} onChange={(e) => setOwner(e.target.value)} className={inputCls} style={{ borderColor: 'var(--border-1)', background: 'var(--cream-50)', color: 'var(--cream-900)' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--yk-text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cream-600)', marginBottom: 6 }}>Phone</label>
            <input value={phone} readOnly className={inputCls} style={{ borderColor: 'var(--border-2)', background: 'var(--cream-100)', color: 'var(--cream-600)', cursor: 'not-allowed' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--yk-text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cream-600)', marginBottom: 6 }}>Tier</label>
            <input value={tier} readOnly className={inputCls} style={{ borderColor: 'var(--border-2)', background: 'var(--cream-100)', color: 'var(--cream-600)', cursor: 'not-allowed' }} />
          </div>
        </div>
        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: '1px solid var(--border-1)', background: 'var(--cream-50)', fontSize: 'var(--yk-text-base)', fontWeight: 600, color: 'var(--cream-800)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '12px 0', borderRadius: 12, background: 'var(--teal-500)', border: 'none', fontSize: 'var(--yk-text-base)', fontWeight: 600, color: '#fff', cursor: 'pointer' }}
          >
            Save
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [sellerPreview, setSellerPreview] = useState(false);
  const [creditEnabled, setCreditEnabled] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [meData, setMeData] = useState<null | {
    greeting_name?: string | null;
    business_name: string;
    contact_name: string;
    phone: string;
    gstin: string | null;
    credit_limit: number;
    credit_used: number;
  }>(null);

  useEffect(() => {
    let cancelled = false;
    async function resolveMode() {
      try {
        const response = await apiFetch('/api/buyer/me');
        if (!response.ok) {
          if (!cancelled) setSellerPreview(Boolean(getStoredBuyerPreviewToken()));
          return;
        }
        const data = await response.json() as {
          mode?: 'buyer' | 'preview';
          seller_preview?: boolean;
          greeting_name?: string | null;
          business_name: string;
          contact_name: string;
          phone: string;
          gstin: string | null;
          credit_limit: number;
          credit_used: number;
          business_policy?: { credit_enabled: boolean };
        };
        if (!cancelled) {
          setSellerPreview(data.seller_preview === true);
          setCreditEnabled(data.business_policy?.credit_enabled ?? true);
          setMeData({
            greeting_name: data.greeting_name,
            business_name: data.business_name,
            contact_name: data.contact_name,
            phone: data.phone ?? '—',
            gstin: data.gstin ?? null,
            credit_limit: data.credit_limit,
            credit_used: data.credit_used,
          });
        }
      } catch {
        if (!cancelled) setSellerPreview(Boolean(getStoredBuyerPreviewToken()));
      }
    }
    void resolveMode();
    return () => { cancelled = true; };
  }, []);

  const profile = useMemo(() => ({
    name: sellerPreview ? 'Buyer App Preview' : (meData?.greeting_name || meData?.contact_name || meData?.business_name || 'Buyer'),
    business: sellerPreview ? 'Preview access' : (meData?.business_name || 'Buyer business'),
    phone: meData?.phone ?? '—',
    gstin: meData?.gstin ?? (sellerPreview ? 'Not registered' : '—'),
    tier: sellerPreview ? 'preview' : 'A-class',
    credit: meData?.credit_limit ?? 0,
    used: meData?.credit_used ?? 0,
  }), [sellerPreview, meData]);

  const initials = profile.name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div>
      {/* ── Hero ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1F3A34 0%, #2D5549 100%)',
          padding: '32px 20px 28px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {/* Initials circle */}
        <div style={{
          width: 64, height: 64, borderRadius: 999,
          background: 'rgba(255,255,255,0.18)',
          border: '2px solid rgba(255,255,255,0.28)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: '#fff' }}>{initials}</span>
        </div>
        {/* Name */}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{profile.name}</h1>
          <p style={{ fontSize: 'var(--yk-text-sm)', color: 'rgba(253,251,247,0.65)', marginTop: 4 }}>{profile.business}</p>
        </div>
        {/* Tier badge */}
        <div style={{ borderRadius: 999, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', padding: '4px 12px' }}>
          <span style={{ fontSize: 'var(--yk-text-xs)', fontWeight: 600, color: 'rgba(253,251,247,0.8)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{profile.tier}</span>
        </div>
        {sellerPreview && (
          <div style={{ borderRadius: 999, background: 'rgba(251,239,227,0.18)', border: '1px solid rgba(251,239,227,0.3)', padding: '4px 12px', marginTop: 4 }}>
            <span style={{ fontSize: 'var(--yk-text-xs)', color: 'rgba(253,251,247,0.7)' }}>Preview mode</span>
          </div>
        )}
      </div>

      {/* ── Seller preview banner ── */}
      {sellerPreview && (
        <div style={{ margin: '12px 16px 0', background: '#FBF1DC', border: '1px solid #E8D8A0', borderRadius: 12, padding: '10px 14px' }}>
          <p style={{ fontSize: 'var(--yk-text-sm)', color: '#7A5519', lineHeight: 1.5 }}>
            Previewing as seller — buyers see their business details, GSTIN, credit limit, and delivery locations here.
          </p>
        </div>
      )}

      {/* ── Account ── */}
      <div style={{ padding: '20px 16px 0' }}>
        <p style={{ fontSize: 'var(--yk-text-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-600)', fontFamily: 'var(--font-body)', fontWeight: 500, padding: '0 4px 8px' }}>Account</p>
        <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 14, overflow: 'hidden' }}>
          {[
            {
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
              label: 'Business details', sub: profile.business, right: <ChevR />, onClick: () => setSheetOpen(true),
            },
            {
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
              label: 'GSTIN', sub: profile.gstin, right: <ChevR />, mono: true,
            },
            ...(creditEnabled ? [{
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>,
              variant: 'ember' as const,
              label: 'Credit limit', sub: `${inr(profile.used)} used of ${inr(profile.credit)}`, right: <ChevR />,
            }] : []),
            {
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
              label: 'Delivery locations', sub: sellerPreview ? '—' : 'Manage delivery locations', right: <ChevR />,
            },
          ].map((row, i, arr) => (
            <button
              key={row.label}
              type="button"
              onClick={row.onClick}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--border-1)' : 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
            >
              <RowIcon variant={row.variant}>{row.icon}</RowIcon>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--yk-text-base)', fontWeight: 500, color: 'var(--cream-900)' }}>{row.label}</div>
                <div style={{ fontSize: row.mono ? 'var(--yk-text-base)' : 'var(--yk-text-sm)', color: 'var(--cream-600)', marginTop: 1, fontFamily: row.mono ? 'var(--font-mono)' : 'var(--font-body)' }}>{row.sub}</div>
              </div>
              {row.right}
            </button>
          ))}
        </div>
      </div>

      {/* ── Preferences ── */}
      <div style={{ padding: '20px 16px 0' }}>
        <p style={{ fontSize: 'var(--yk-text-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-600)', fontFamily: 'var(--font-body)', fontWeight: 500, padding: '0 4px 8px' }}>Preferences</p>
        <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 14, overflow: 'hidden' }}>
          {[
            { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>, label: 'Notifications', sub: 'WhatsApp + push', right: <span style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--teal-600)', fontWeight: 600 }}>On</span> },
            { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>, label: 'Catalog view', sub: 'Lookbook or grid', right: <span style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--cream-700)' }}>Lookbook</span> },
            { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>, label: 'Language', sub: 'Display language', right: <span style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--cream-700)' }}>English</span> },
            { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>, label: 'Help & support', sub: 'Chat with us on WhatsApp', right: <ChevR /> },
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

      {/* ── Log out ── */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', cursor: 'pointer' }}>
            <RowIcon variant="danger">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            </RowIcon>
            <div>
              <div style={{ fontSize: 'var(--yk-text-base)', fontWeight: 500, color: '#9C3A22' }}>Log out</div>
              <div style={{ fontSize: 'var(--yk-text-sm)', color: 'var(--cream-600)', marginTop: 1 }}>You&apos;ll need a fresh OTP next time.</div>
            </div>
          </div>
        </div>
        <p style={{ textAlign: 'center', marginTop: 16, marginBottom: 8, fontSize: 'var(--yk-text-xs)', color: 'var(--cream-500)' }}>Yukti buyer · <span className="tabular-inline">v1.0.0</span></p>
      </div>

      {/* ── Business edit sheet ── */}
      <BusinessEditSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        businessName={profile.business}
        contactName={profile.name}
        phone={profile.phone}
        tier={profile.tier}
      />
    </div>
  );
}
