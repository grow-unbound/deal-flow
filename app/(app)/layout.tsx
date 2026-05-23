'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCaptureEvent, usePageView } from '@/hooks/useFeatureFlag';

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { session, loading } = useAuthContext();
  const captureEvent = useCaptureEvent();
  const trackPageView = usePageView();

  useEffect(() => {
    if (!loading && !session) {
      router.push('/login');
    }
  }, [session, loading, router]);

  useEffect(() => {
    if (session) {
      captureEvent('app_layout_viewed', {
        session_id: session.session.user.id,
      });
      trackPageView('app_layout');
    }
  }, [session, captureEvent, trackPageView]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Sidebar Navigation */}
      <nav className="fixed left-0 top-0 h-screen w-64 bg-slate-900 border-r border-slate-700 p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            DF
          </div>
          <span className="text-lg font-bold text-white">DealFlow</span>
        </div>

        <ul className="space-y-2 flex-1">
          <li>
            <a
              href="/dashboard"
              className="block px-4 py-2 rounded-md text-slate-300 hover:bg-slate-800"
            >
              Dashboard
            </a>
          </li>
          <li>
            <a
              href="/brands"
              className="block px-4 py-2 rounded-md text-slate-300 hover:bg-slate-800"
            >
              Brands
            </a>
          </li>
          <li>
            <a
              href="/products"
              className="block px-4 py-2 rounded-md text-slate-300 hover:bg-slate-800"
            >
              Products
            </a>
          </li>
          <li>
            <a
              href="/customers"
              className="block px-4 py-2 rounded-md text-slate-300 hover:bg-slate-800"
            >
              Customers
            </a>
          </li>
          <li>
            <a
              href="/cohorts"
              className="block px-4 py-2 rounded-md text-slate-300 hover:bg-slate-800"
            >
              Cohorts
            </a>
          </li>
          <li>
            <a
              href="/catalogs"
              className="block px-4 py-2 rounded-md text-slate-300 hover:bg-slate-800"
            >
              Catalogs
            </a>
          </li>
          <li>
            <a
              href="/orders"
              className="block px-4 py-2 rounded-md text-slate-300 hover:bg-slate-800"
            >
              Orders
            </a>
          </li>
          <li>
            <a
              href="/settings"
              className="block px-4 py-2 rounded-md text-slate-300 hover:bg-slate-800"
            >
              Settings
            </a>
          </li>
        </ul>

        {/* Footer with user info and logout */}
        <div className="border-t border-slate-700 pt-4">
          <div className="text-sm text-slate-400 mb-3">
            <p className="font-medium text-slate-200">{session.user.email}</p>
          </div>
          <button
            onClick={async () => {
              await fetch('/api/auth/signout', { method: 'POST' });
              router.push('/login');
            }}
            className="w-full px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm"
          >
            Log Out
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main className="ml-64 p-8">{children}</main>
    </div>
  );
}
