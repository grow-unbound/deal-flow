'use client';

import * as React from 'react';

interface CatalogPageHeaderProps {
  name: string;
  productCount: number;
  validUntil?: string | null;
}

export function CatalogPageHeader({ name, productCount, validUntil }: CatalogPageHeaderProps) {
  return (
    <div className="bg-[var(--bg-surface)] border-b border-[var(--border-1)] px-4 py-3">
      <h1 className="font-[var(--font-display)] text-xl font-semibold text-[var(--fg-1)] leading-tight">
        {name}
      </h1>
      <p className="text-[var(--fg-3)] text-sm mt-0.5">
        {productCount} {productCount === 1 ? 'product' : 'products'}
        {validUntil && (
          <span className="ml-2">
            · Valid until{' '}
            {new Date(validUntil).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        )}
      </p>
    </div>
  );
}
