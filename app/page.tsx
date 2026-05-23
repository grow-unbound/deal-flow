'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/profile', {
          method: 'GET',
          credentials: 'include',
        });

        if (response.ok) {
          router.push('/dashboard');
        } else {
          setChecking(false);
        }
      } catch {
        setChecking(false);
      }
    };

    checkAuth();
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg mb-4">
              DF
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">DealFlow</h1>
            <p className="text-slate-400">Distributor Command Center</p>
            <div className="mt-8 text-slate-500">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-7xl mx-auto px-4 py-20">
        {/* Hero */}
        <div className="text-center space-y-6 mb-12">
          <div className="inline-block">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-2xl">
              DF
            </div>
          </div>
          <h1 className="text-5xl font-bold text-white">DealFlow</h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            Distributor command center. Manage multibrand catalogs, publish cohort-specific pricing,
            capture orders.
          </p>
        </div>

        {/* Auth Links */}
        <div className="flex justify-center gap-4 mb-16">
          <Link
            href="/login"
            className="px-8 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="px-8 py-3 rounded-lg border border-blue-600 text-blue-400 hover:bg-blue-600/10 font-medium transition"
          >
            Sign Up
          </Link>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
            <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center text-blue-400 mb-4">
              📦
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Multi-Brand Catalogs</h3>
            <p className="text-slate-400">
              Manage products across multiple brands and publish tailored catalogs.
            </p>
          </div>

          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
            <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center text-blue-400 mb-4">
              💰
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Cohort Pricing</h3>
            <p className="text-slate-400">
              Set customer-specific and cohort-specific pricing rules dynamically.
            </p>
          </div>

          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
            <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center text-blue-400 mb-4">
              📱
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Buyer PWA</h3>
            <p className="text-slate-400">
              Mobile-first app for buyers to browse catalogs and place orders.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
