'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { INDIAN_STATES } from '@/constants';

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    businessName: '',
    slug: '',
    city: '',
    state: 'KA',
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

  return (
    <Card className="border-slate-700">
      <CardHeader className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            DF
          </div>
          <span className="text-lg font-bold text-white">DealFlow</span>
        </div>
        <CardTitle className="text-white">Create Your Account</CardTitle>
        <CardDescription>Set up your distributor account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">
              Email
            </label>
            <Input
              type="email"
              name="email"
              placeholder="your@company.com"
              value={formData.email}
              onChange={handleChange}
              disabled={loading}
              required
              className="bg-slate-800 border-slate-600 text-white placeholder-slate-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">
              Password
            </label>
            <Input
              type="password"
              name="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              disabled={loading}
              required
              className="bg-slate-800 border-slate-600 text-white placeholder-slate-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">
              Business Name
            </label>
            <Input
              type="text"
              name="businessName"
              placeholder="Your Business Ltd."
              value={formData.businessName}
              onChange={handleChange}
              disabled={loading}
              required
              className="bg-slate-800 border-slate-600 text-white placeholder-slate-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">
              Subdomain (slug)
            </label>
            <Input
              type="text"
              name="slug"
              placeholder="your-business"
              value={formData.slug}
              onChange={handleChange}
              disabled={loading}
              required
              className="bg-slate-800 border-slate-600 text-white placeholder-slate-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1">
                City
              </label>
              <Input
                type="text"
                name="city"
                placeholder="Bangalore"
                value={formData.city}
                onChange={handleChange}
                disabled={loading}
                required
                className="bg-slate-800 border-slate-600 text-white placeholder-slate-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1">
                State
              </label>
              <select
                name="state"
                value={formData.state}
                onChange={handleChange}
                disabled={loading}
                required
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-white rounded-md"
              >
                {INDIAN_STATES.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">
              GST Number
            </label>
            <Input
              type="text"
              name="gstNumber"
              placeholder="18AABCT1234H1Z0"
              value={formData.gstNumber}
              onChange={handleChange}
              disabled={loading}
              required
              className="bg-slate-800 border-slate-600 text-white placeholder-slate-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">
              Contact Email
            </label>
            <Input
              type="email"
              name="contactEmail"
              placeholder="contact@company.com"
              value={formData.contactEmail}
              onChange={handleChange}
              disabled={loading}
              required
              className="bg-slate-800 border-slate-600 text-white placeholder-slate-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">
              Contact Phone
            </label>
            <Input
              type="tel"
              name="contactPhone"
              placeholder="+91-9876543210"
              value={formData.contactPhone}
              onChange={handleChange}
              disabled={loading}
              required
              className="bg-slate-800 border-slate-600 text-white placeholder-slate-400"
            />
          </div>
          {error && <div className="text-sm text-red-400">{error}</div>}
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </Button>
        </form>
        <div className="mt-4 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-400 hover:text-blue-300">
            Log in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
