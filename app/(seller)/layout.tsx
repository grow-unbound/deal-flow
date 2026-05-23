'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { SellerShell } from '@/components/layout/SellerShell';

export default function SellerLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 bg-teal-500 rounded-md flex items-center justify-center">
            <span className="text-cream-50 font-display font-medium">DF</span>
          </div>
          <p className="text-caption text-cream-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <ThemeProvider surface="seller">
      <SellerShell>{children}</SellerShell>
    </ThemeProvider>
  );
}
