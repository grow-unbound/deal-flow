'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { INDIAN_STATES } from '@/constants';
import posthog from 'posthog-js';

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    businessName: '',
    slug: '',
    city: '',
    state: 'Karnataka',
    gstNumber: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'slug'
        ? value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
        : value,
      // Auto-generate slug from business name
      ...(name === 'businessName' && !formData.slug
        ? { slug: value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }
        : {}),
    }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const distinctId = posthog.get_distinct_id();
      const sessionId = posthog.get_session_id();
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(distinctId && { 'X-POSTHOG-DISTINCT-ID': distinctId }),
          ...(sessionId && { 'X-POSTHOG-SESSION-ID': sessionId }),
        },
        body: JSON.stringify({
          email: formData.email,
          phone: formData.phone,
          password: formData.password,
          confirm_password: formData.confirmPassword,
          business_name: formData.businessName,
          slug: formData.slug,
          gstin: formData.gstNumber || undefined,
          primary_state: formData.state,
          plan: 'starter',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMsg = data.error || 'Signup failed';
        setError(errorMsg);
        posthog.capture('signup_failed', { reason: errorMsg });
        return;
      }
      posthog.identify(data.user.id, { email: data.user.email });
      posthog.capture('user_signed_up', {
        tenant_slug: data.tenant?.slug,
        business_name: data.tenant?.business_name,
        primary_state: formData.state,
        plan: 'starter',
      });
      router.push('/login?registered=1');
    } catch (err) {
      posthog.captureException(err);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    'w-full px-3 py-2.5 rounded-md bg-cream-50 border border-cream-300 text-cream-900 placeholder:text-cream-500 text-body-sm focus:outline-none focus:border-ember-400 focus:ring-2 focus:ring-ember-400/20 transition-colors disabled:opacity-50';
  const labelCls =
    'block text-cream-700 font-semibold mb-1.5 uppercase tracking-wide';

  return (
    <div className="bg-white border border-cream-300 rounded-xl shadow-md p-8">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-7">
        <div className="w-9 h-9 bg-teal-500 rounded-md flex items-center justify-center shrink-0">
          <span className="text-cream-50 font-display font-medium text-sm">DF</span>
        </div>
        <span className="font-display font-medium text-teal-500 text-xl">DealFlow</span>
      </div>

      <h1 className="text-h3 font-display text-cream-900 mb-1">Create your account</h1>
      <p className="text-body-sm text-cream-600 mb-6">Set up your distributor workspace</p>

      <form onSubmit={handleSubmit} className="space-y-4 max-h-[calc(100vh-260px)] overflow-y-auto pr-1">
        {/* Account section */}
        <p className="text-caption font-semibold text-cream-500 uppercase tracking-widest" style={{ fontSize: '10px' }}>
          Account
        </p>

        <div>
          <label className={labelCls} style={{ fontSize: '11px', letterSpacing: '0.08em' }}>Email</label>
          <input
            type="email"
            name="email"
            placeholder="you@company.com"
            value={formData.email}
            onChange={handleChange}
            disabled={loading}
            required
            autoComplete="email"
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls} style={{ fontSize: '11px', letterSpacing: '0.08em' }}>Phone</label>
          <div className="flex gap-2">
            <span className="flex items-center px-3 rounded-md bg-cream-100 border border-cream-300 text-cream-600 text-body-sm select-none">
              +91
            </span>
            <input
              type="tel"
              name="phone"
              placeholder="9876543210"
              value={formData.phone}
              onChange={handleChange}
              disabled={loading}
              required
              maxLength={10}
              pattern="[0-9]{10}"
              autoComplete="tel"
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} style={{ fontSize: '11px', letterSpacing: '0.08em' }}>Password</label>
            <input
              type="password"
              name="password"
              placeholder="Min 8 characters"
              value={formData.password}
              onChange={handleChange}
              disabled={loading}
              required
              minLength={8}
              autoComplete="new-password"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} style={{ fontSize: '11px', letterSpacing: '0.08em' }}>Confirm password</label>
            <input
              type="password"
              name="confirmPassword"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={handleChange}
              disabled={loading}
              required
              autoComplete="new-password"
              className={inputCls}
            />
          </div>
        </div>

        {/* Business section */}
        <p className="text-caption font-semibold text-cream-500 uppercase tracking-widest pt-2" style={{ fontSize: '10px' }}>
          Business
        </p>

        <div>
          <label className={labelCls} style={{ fontSize: '11px', letterSpacing: '0.08em' }}>Business name</label>
          <input
            type="text"
            name="businessName"
            placeholder="Your Business Ltd."
            value={formData.businessName}
            onChange={handleChange}
            disabled={loading}
            required
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls} style={{ fontSize: '11px', letterSpacing: '0.08em' }}>Subdomain</label>
          <div className="flex gap-0 rounded-md overflow-hidden border border-cream-300 focus-within:border-ember-400 focus-within:ring-2 focus-within:ring-ember-400/20 transition-colors bg-cream-50">
            <input
              type="text"
              name="slug"
              placeholder="your-business"
              value={formData.slug}
              onChange={handleChange}
              disabled={loading}
              required
              className="flex-1 px-3 py-2.5 bg-transparent text-cream-900 placeholder:text-cream-500 text-body-sm focus:outline-none"
            />
            <span className="flex items-center px-3 text-cream-500 text-body-sm bg-cream-100 border-l border-cream-300 select-none">
              .dealflow.in
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} style={{ fontSize: '11px', letterSpacing: '0.08em' }}>City</label>
            <input
              type="text"
              name="city"
              placeholder="Bangalore"
              value={formData.city}
              onChange={handleChange}
              disabled={loading}
              required
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} style={{ fontSize: '11px', letterSpacing: '0.08em' }}>State</label>
            <select
              name="state"
              value={formData.state}
              onChange={handleChange}
              disabled={loading}
              required
              className={inputCls}
            >
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls} style={{ fontSize: '11px', letterSpacing: '0.08em' }}>
            GST number <span className="text-cream-400 normal-case font-normal">(optional)</span>
          </label>
          <input
            type="text"
            name="gstNumber"
            placeholder="18AABCT1234H1Z0"
            value={formData.gstNumber}
            onChange={handleChange}
            disabled={loading}
            className={inputCls}
          />
        </div>

        {error && (
          <p className="text-caption text-danger-500 bg-danger-50 px-3 py-2 rounded-md">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2.5 rounded-md bg-teal-500 hover:bg-teal-600 text-cream-50 text-body-sm font-semibold transition-colors duration-base disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-5 text-center text-caption text-cream-600">
        Already have an account?{' '}
        <Link href="/login" className="text-ember-400 hover:text-ember-500 font-medium transition-colors">
          Log in
        </Link>
      </p>
    </div>
  );
}
