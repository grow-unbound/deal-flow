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
      <div className="min-h-screen bg-cream-200 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 bg-teal-500 rounded-lg flex items-center justify-center">
            <span className="text-cream-50 font-display font-medium text-lg">DF</span>
          </div>
          <p className="text-caption text-cream-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-100">
      <div className="max-w-5xl mx-auto px-6 py-20">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-teal-500 rounded-xl flex items-center justify-center">
              <span className="text-cream-50 font-display font-medium text-lg">DF</span>
            </div>
            <span className="font-display font-medium text-teal-500 text-2xl">DealFlow</span>
          </div>
          <h1 className="text-display-sm font-display text-cream-900 mb-4">
            Distributor command center
          </h1>
          <p className="text-body text-cream-600 max-w-xl mx-auto">
            Manage multibrand catalogs, publish cohort-specific pricing, capture orders from your buyers.
          </p>
        </div>

        {/* Auth Links */}
        <div className="flex justify-center gap-3 mb-16">
          <Link
            href="/login"
            className="px-6 py-2.5 rounded-md bg-teal-500 hover:bg-teal-600 text-cream-50 text-body-sm font-semibold transition-colors duration-base"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="px-6 py-2.5 rounded-md border border-cream-400 text-cream-800 hover:bg-cream-200 text-body-sm font-medium transition-colors duration-base"
          >
            Create account
          </Link>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-5">
          {[
            {
              title: 'Multi-brand catalogs',
              body: 'Manage products across all your brands and publish tailored catalogs per cohort.',
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
              ),
            },
            {
              title: 'Cohort pricing',
              body: 'Set buyer-specific and cohort-specific pricing rules. Let the engine resolve the best price.',
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
              ),
            },
            {
              title: 'Buyer PWA',
              body: 'Mobile-first ordering app for your retailers. WhatsApp OTP, catalog browse, place orders.',
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
                </svg>
              ),
            },
          ].map(({ title, body, icon }) => (
            <div key={title} className="bg-white border border-cream-300 rounded-lg p-6 shadow-xs">
              <div className="w-9 h-9 bg-teal-50 rounded-md flex items-center justify-center text-teal-500 mb-4">
                {icon}
              </div>
              <h3 className="text-h4 font-sans font-semibold text-cream-900 mb-2">{title}</h3>
              <p className="text-body-sm text-cream-600">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
