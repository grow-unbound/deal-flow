'use client';

import * as React from 'react';
import type { BuyerCatalogSummary } from '@/types/buyer';

interface CatalogPageHeaderProps {
  name: string;
  productCount: number;
  validUntil?: string | null;
  catalogs?: BuyerCatalogSummary[];
  selectedCatalogId?: string | null;
  onSelectCatalog?: (catalogId: string) => void;
}

export function CatalogPageHeader({
  name,
  productCount,
  validUntil,
  catalogs = [],
  selectedCatalogId = null,
  onSelectCatalog,
}: CatalogPageHeaderProps) {
  return (
    <div className="border-b border-[var(--border-1)] bg-[var(--bg-surface)] px-4 py-3" style={{ backgroundColor: 'var(--bg-surface)' }}>
      {catalogs.length > 1 && onSelectCatalog ? (
        <label className="mb-2 block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-[var(--fg-3)]">
            Catalog
          </span>
          <select
            value={selectedCatalogId ?? ''}
            onChange={(event) => onSelectCatalog(event.target.value)}
            className="w-full rounded-md border border-[var(--border-1)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--fg-1)]"
          >
            {catalogs.map((catalog) => (
              <option key={catalog.id} value={catalog.id}>
                {catalog.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
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
