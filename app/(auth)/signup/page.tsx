'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { INDIAN_STATES } from '@/constants';

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    businessName: '',
    slug: '',
    city: '',
    state: 'Karnataka',
    gstNumber: '',
    contactEmail: '',
    contactPhone: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Signup failed');
        return;
      }

      // Redirect to tenant's subdomain
      window.location.href = `https://${data.tenant.slug}.dealflow.in`;
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const inputCls = 'w-full px-3 py-2.5 rounded-md bg-cream-50 border border-cream-300 text-cream-900 placeholder:text-cream-500 text-body-sm focus:outline-none focus:border-ember-400 focus:ring-2 focus:ring-ember-400/20 transition-colors disabled:opacity-50';
  const labelCls = 'block mb-1.5 font-semibold text-cream-700 uppercase tracking-wide';

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
        {[
          { name: 'email',        label: 'Email',             type: 'email', placeholder: 'you@company.com' },
          { name: 'password',     label: 'Password',          type: 'password', placeholder: '••••••••' },
          { name: 'businessName', label: 'Business name',     type: 'text', placeholder: 'Your Business Ltd.' },
          { name: 'slug',         label: 'Subdomain',         type: 'text', placeholder: 'your-business' },
          { name: 'gstNumber',    label: 'GST number',        type: 'text', placeholder: '18AABCT1234H1Z0' },
          { name: 'contactEmail', label: 'Contact email',     type: 'email', placeholder: 'contact@company.com' },
          { name: 'contactPhone', label: 'Contact phone',     type: 'tel', placeholder: '+91-9876543210' },
        ].map(({ name, label, type, placeholder }) => (
          <div key={name}>
            <label className={labelCls} style={{ fontSize: '11px', letterSpacing: '0.08em' }}>{label}</label>
            <input
              type={type}
              name={name}
              placeholder={placeholder}
              value={formData[name as keyof typeof formData]}
              onChange={handleChange}
              disabled={loading}
              required
              className={inputCls}
            />
          </div>
        ))}

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

        {error && (
          <p className="text-caption text-danger-500 bg-danger-50 px-3 py-2 rounded-md">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2.5 rounded-md bg-teal-500 hover:bg-teal-600 text-cream-50 text-body-sm font-semibold transition-colors duration-base disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating account...' : 'Create account'}
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
