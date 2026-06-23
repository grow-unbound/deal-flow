'use client';

import * as React from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { CatalogLookbookCard } from '@/components/buyer/catalog/CatalogLookbookCard';
import { DiscoveryThumbTile } from '@/components/buyer/catalog/DiscoveryThumbTile';
import { ProductGrid } from '@/components/buyer/catalog/ProductGrid';
import { BuyerCatalogLandingHeader } from '@/components/buyer/layout/BuyerCatalogLandingHeader';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import type { BuyerBrand, BuyerCatalogItem, BuyerCatalogSummary, BuyerCategory } from '@/types/buyer';

export function CatalogDiscoveryLanding(): React.ReactNode {
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [items, setItems] = React.useState<BuyerCatalogItem[]>([]);
  const [categories, setCategories] = React.useState<BuyerCategory[]>([]);
  const [brands, setBrands] = React.useState<BuyerBrand[]>([]);
  const [catalogs, setCatalogs] = React.useState<BuyerCatalogSummary[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    setError(false);
    setLoading(true);

    Promise.all([
      apiFetch('/api/buyer/catalog?limit=48&offset=0').then((r) => r.json() as Promise<{ items?: BuyerCatalogItem[]; catalogs?: BuyerCatalogSummary[] }>),
      apiFetch('/api/buyer/categories').then((r) => r.json() as Promise<{ categories?: BuyerCategory[] }>),
      apiFetch('/api/buyer/brands').then((r) => r.json() as Promise<{ brands?: BuyerBrand[] }>),
    ])
      .then(([catalogBody, catBody, brandBody]) => {
        if (cancelled) return;
        setItems(catalogBody.items ?? []);
        setCatalogs(catalogBody.catalogs ?? []);
        setCategories(catBody.categories ?? []);
        setBrands(brandBody.brands ?? []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const featured = React.useMemo(() => items.filter((i) => i.is_featured).slice(0, 8), [items]);
  const restPreview = React.useMemo(() => {
    const ids = new Set(featured.map((i) => i.tenant_product_id));
    return items.filter((i) => !ids.has(i.tenant_product_id)).slice(0, 8);
  }, [items, featured]);

  return (
    <div className="flex flex-col pb-[var(--tab-bar)]">
      <BuyerCatalogLandingHeader searchValue={search} onSearchChange={setSearch} />

      <div className="space-y-6 px-4 pt-4">
        {loading ? (
          <div className="space-y-4" role="status" aria-label="Loading catalog">
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <div className="aspect-square animate-pulse rounded-xl bg-cream-100" />
                  <div className="mx-auto h-3 w-12 animate-pulse rounded bg-cream-200" />
                </div>
              ))}
            </div>
            <div className="-mx-4 flex gap-2 overflow-hidden px-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="w-[88px] shrink-0">
                  <div className="mx-auto h-[72px] w-[72px] animate-pulse rounded-xl bg-cream-100" />
                  <div className="mx-auto mt-2 h-3 w-14 animate-pulse rounded bg-cream-200" />
                </div>
              ))}
            </div>
            <div className="-mx-4 flex gap-2 overflow-hidden px-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="w-[200px] shrink-0 overflow-hidden rounded-xl border border-cream-200">
                  <div className="h-[90px] animate-pulse bg-cream-100" />
                  <div className="h-10 animate-pulse bg-cream-50" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-[4/5] animate-pulse rounded-xl" style={{ background: 'var(--cream-100)' }} />
              ))}
            </div>
          </div>
        ) : error ? (
          <p className="text-center text-sm" style={{ color: 'var(--danger-500, #dc2626)' }}>
            Could not load catalog. Pull to retry or open search.
          </p>
        ) : (
          <>
            {/* Categories — 3-column grid */}
            {categories.length > 0 && (
              <section>
                <SectionHeader title="Categories" />
                <div className="grid grid-cols-3 gap-2">
                  {categories.slice(0, 9).map((cat, idx) => (
                    <DiscoveryThumbTile
                      key={cat.id}
                      href={`/buy/catalog/category/${cat.id}`}
                      label={cat.name}
                      imageUrl={cat.image_url}
                      subtitle={String(cat.product_count)}
                      colorIndex={idx}
                      onNavigate={() => markBuyerNavigationForward()}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Brands — horizontal scroll with avatar chips */}
            {brands.length > 0 && (
              <section>
                <SectionHeader title="Brands" />
                <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none">
                  {brands.slice(0, 24).map((b, idx) => (
                    <DiscoveryThumbTile
                      key={b.id}
                      href={`/buy/catalog/brand/${b.id}`}
                      label={b.name}
                      imageUrl={b.logo_url}
                      colorIndex={idx}
                      variant="scroll"
                      onNavigate={() => markBuyerNavigationForward()}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Catalog lists */}
            {catalogs.length > 0 && (
              <section>
                <SectionHeader title="Catalogs" />
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
                  {catalogs.map((c, idx) => (
                    <CatalogLookbookCard
                      key={c.id}
                      id={c.id}
                      name={c.name}
                      productCount={c.product_count}
                      href={`/buy/catalog/list/${c.id}`}
                      validUntil={c.valid_until}
                      heroImageUrl={c.hero_image_url}
                      hueIndex={idx}
                    />
                  ))}
                </div>
              </section>
            )}

            {featured.length > 0 && (
              <section>
                <SectionHeader title="Featured" />
                <ProductGrid items={featured} />
              </section>
            )}

            {restPreview.length > 0 && (
              <section>
                <SectionHeader title="The Picks · This Week" />
                <ProductGrid items={restPreview} />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="mb-2 font-semibold uppercase" style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.18em', color: 'var(--cream-600)' }}>
      {title}
    </h2>
  );
}
