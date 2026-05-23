'use client';

import { ReactNode } from 'react';

interface SellerTopbarProps {
  title: string;
  action?: ReactNode;
}

export function SellerTopbar({ title, action }: SellerTopbarProps) {
  return (
    <header
      className="fixed top-0 right-0 flex items-center justify-between bg-cream-50 border-b border-cream-300 px-8 z-10"
      style={{
        left: 'var(--sidebar-w)',
        height: 'var(--topbar-h)',
      }}
    >
      <h1 className="text-h3 font-display font-medium text-cream-900">{title}</h1>
      {action && <div className="flex items-center gap-3">{action}</div>}
    </header>
  );
}
