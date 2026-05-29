'use client';

import Link from 'next/link';
import { ExternalLink, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SellerGlobalHeader() {
  return (
    <header
      className="fixed right-0 top-0 z-20 flex h-16 items-center gap-4 border-b border-cream-300 bg-cream-100 px-9"
      style={{ left: 'var(--sidebar-w)' }}
    >
      <div className="flex max-w-[36rem] flex-1 items-center gap-2 rounded-[16px] border border-cream-300 bg-white px-4 py-2 shadow-xs">
        <Search size={16} className="text-cream-500" />
        <input
          type="search"
          placeholder="Search brands, products, buyers, orders..."
          className="w-full border-0 bg-transparent p-0 text-sm text-cream-900 outline-none placeholder:text-cream-600"
          aria-label="Search"
        />
        <kbd className="rounded-full border border-cream-300 bg-cream-100 px-2 py-0.5 text-[10px] text-cream-600">
          ⌘K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button asChild variant="ghost" className="rounded-lg text-cream-800">
          <Link href="/shop/home">
            <ExternalLink size={14} />
            Open buyer app
          </Link>
        </Button>
      </div>
    </header>
  );
}
