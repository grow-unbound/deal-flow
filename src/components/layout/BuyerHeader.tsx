'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { navigateBuyerBack } from '@/hooks/useBuyerNavigationDirection';

interface BuyerHeaderProps {
  title: string;
  showBack?: boolean;
  action?: ReactNode;
}

export function BuyerHeader({ title, showBack = false, action }: BuyerHeaderProps) {
  const router = useRouter();

  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between px-4"
      style={{
        height: 'var(--header-h)',
        background: 'rgba(253, 251, 247, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-1)',
      }}
    >
      <div className="flex items-center gap-2">
        {showBack && (
          <button
            onClick={() => navigateBuyerBack(router)}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-cream-200 transition-colors duration-fast"
            aria-label="Go back"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
        )}
        <h1 className="text-h4 font-sans font-semibold text-cream-900">{title}</h1>
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </header>
  );
}
