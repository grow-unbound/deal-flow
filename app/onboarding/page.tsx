'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { YuktiLogo } from '@/components/brand/YuktiLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBuyerMe } from '@/hooks/useBuyerMe';
import { apiFetch } from '@/lib/api-fetch';
import { buildWhatsAppChatUrl } from '@/constants/auth-login-copy';

/**
 * Self-registration intake form (Yukti_Inbox_Feature-Spec_v1.md §7.1 #1/#2).
 * Shown right after OTP verify for a brand-new-to-this-tenant buyer, before
 * /pending. Submitting fires a correctly-typed app.entries row (business_approval
 * or new_user_login) for the seller — see /api/buyer/onboarding/intake.
 */
export default function BuyerOnboardingPage() {
  const router = useRouter();
  const { data: me, isLoading } = useBuyerMe();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [isBusiness, setIsBusiness] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [gstin, setGstin] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (prefilled || !me?.pending) return;
    if (me.pending.prefill_full_name) setFullName(me.pending.prefill_full_name);
    if (me.pending.prefill_email) setEmail(me.pending.prefill_email);
    setPrefilled(true);
  }, [me?.pending, prefilled]);

  // Not pending (approved, or not a self-registration at all) or intake
  // already submitted — nothing to do here, follow the buyer to where it
  // actually belongs.
  const shouldSkip = !isLoading && (!me || me.mode !== 'pending' || me.pending?.intake_submitted);
  useEffect(() => {
    if (!shouldSkip) return;
    if (!me || me.mode !== 'pending') {
      router.replace('/buy/home');
      return;
    }
    router.replace('/pending');
  }, [shouldSkip, me, router]);
  if (shouldSkip) return null;

  const sellerName = me?.tenant?.name ?? 'the seller';
  const sellerWhatsappNumber = me?.pending?.seller_whatsapp_number ?? null;
  const isReturning = me?.pending?.is_returning_yukti_user ?? false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError('');

    if (!fullName.trim()) {
      setError('Full name is required.');
      return;
    }
    if (isBusiness && !businessName.trim()) {
      setError('Business name is required.');
      return;
    }
    if (gstin.trim() && (!state.trim() || !pincode.trim())) {
      setError('State and pincode are required when GSTIN is provided.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/buyer/onboarding/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          is_business: isBusiness,
          business_name: isBusiness ? businessName.trim() : '',
          gstin: gstin.trim(),
          address_line1: addressLine1.trim(),
          address_line2: addressLine2.trim(),
          city: city.trim(),
          state: state.trim(),
          pincode: pincode.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }
      window.location.assign('/pending');
    } catch {
      setError('Network error. Please check your connection and try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white border border-cream-300 rounded-xl shadow-md p-8">
        <div className="mb-7 flex justify-center">
          <YuktiLogo variant="stacked-lockup" className="h-14 w-[76px]" priority />
        </div>

        <h1 className="text-h3 font-display text-cream-900 mb-1">
          {isReturning ? `You're new here at ${sellerName}` : "Looks like you're new on Yukti"}
        </h1>
        <p className="text-body-sm text-cream-600 mb-6">
          {isReturning
            ? `Share a few details so we can pass them on to ${sellerName}.`
            : `We couldn't find your account — share your details so we can pass them on to ${sellerName}.`}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email (optional)</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </div>

          <label className="flex items-center gap-2.5 rounded-md border border-cream-300 bg-cream-50 px-4 py-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isBusiness}
              onChange={(e) => setIsBusiness(e.target.checked)}
              disabled={submitting}
              className="h-4 w-4 rounded border-cream-400 text-teal-600 focus:ring-teal-400/30"
            />
            <span className="text-body-sm text-cream-800">I'm ordering for a business</span>
          </label>

          {isBusiness && (
            <div className="space-y-4 rounded-md border border-cream-200 bg-cream-50/60 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="business_name">Business name</Label>
                <Input
                  id="business_name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  disabled={submitting}
                  required={isBusiness}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="gstin">GSTIN (optional)</Label>
                <Input
                  id="gstin"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  disabled={submitting}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="address_line1">Address line 1</Label>
                  <Input
                    id="address_line1"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="address_line2">Address line 2 (optional)</Label>
                  <Input
                    id="address_line2"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} disabled={submitting} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="state">
                    State{gstin.trim() ? ' (required)' : ''}
                  </Label>
                  <Input
                    id="state"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    disabled={submitting}
                    required={Boolean(gstin.trim())}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pincode">
                    Pincode{gstin.trim() ? ' (required)' : ''}
                  </Label>
                  <Input
                    id="pincode"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    disabled={submitting}
                    required={Boolean(gstin.trim())}
                  />
                </div>
              </div>
            </div>
          )}

          <p className="text-caption text-cream-600">
            Your request will be sent to {sellerName}. They typically approve within 24 hours
            {sellerWhatsappNumber ? ' — you can also message them on WhatsApp in the meantime.' : '.'}
          </p>

          {error && (
            <p className="text-caption text-danger-500 bg-danger-50 px-3 py-2 rounded-md">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={submitting || isLoading} haptic>
            {submitting ? 'Sending…' : 'Send request'}
          </Button>

          {sellerWhatsappNumber && (
            <button
              type="button"
              onClick={() =>
                window.open(
                  buildWhatsAppChatUrl(
                    sellerWhatsappNumber,
                    `Hi ${sellerName}, I'd like to get access to your Yukti catalog.`,
                  ),
                  '_blank',
                  'noopener,noreferrer',
                )
              }
              className="w-full text-caption text-cream-600 hover:text-cream-800 transition-colors"
            >
              Message {sellerName} on WhatsApp instead
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
