'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import type { BuyerBrand, BuyerCategory } from '@/types/buyer';

type ChipNavMode = 'landing' | 'detail';

interface BuyerCategoryChipNavProps {
  kind: 'category';
  categories: BuyerCategory[];
  selectedId: string | null;
  mode: ChipNavMode;
}

interface BuyerBrandChipNavProps {
  kind: 'brand';
  brands: BuyerBrand[];
  selectedId: string | null;
  mode: ChipNavMode;
}

export type BuyerEntityChipNavProps = BuyerCategoryChipNavProps | BuyerBrandChipNavProps;

function useChipScrollIntoView(selectedId: string | null): React.RefObject<HTMLDivElement> {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!selectedId || !containerRef.current) return;
    const active = containerRef.current.querySelector<HTMLElement>(`[data-chip-id="${selectedId}"]`);
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedId]);

  return containerRef;
}

export function BuyerEntityChipNav(props: BuyerEntityChipNavProps): React.ReactNode {
  const router = useRouter();
  const containerRef = useChipScrollIntoView(props.selectedId);

  function navigateTo(path: string, replace: boolean): void {
    markBuyerNavigationForward();
    if (replace) {
      router.replace(path);
      return;
    }
    router.push(path);
  }

  function handleCategoryChange(id: string | null): void {
    if (id === null) {
      if (props.mode === 'detail') navigateTo('/buy/catalog', false);
      return;
    }
    const path = `/buy/catalog/category/${id}`;
    navigateTo(path, props.mode === 'detail');
  }

  function handleBrandChange(id: string | null): void {
    if (id === null) {
      if (props.mode === 'detail') navigateTo('/buy/catalog', false);
      return;
    }
    const path = `/buy/catalog/brand/${id}`;
    navigateTo(path, props.mode === 'detail');
  }

  if (props.kind === 'category') {
    if (props.categories.length === 0) return null;
    return (
      <div ref={containerRef}>
        <CategoryFilterWithDataAttrs
          categories={props.categories}
          selected={props.selectedId}
          onChange={handleCategoryChange}
        />
      </div>
    );
  }

  if (props.brands.length === 0) return null;
  return (
    <div ref={containerRef}>
      <BrandFilterWithDataAttrs
        brands={props.brands}
        selected={props.selectedId}
        onChange={handleBrandChange}
      />
    </div>
  );
}

function CategoryFilterWithDataAttrs({
  categories,
  selected,
  onChange,
}: {
  categories: BuyerCategory[];
  selected: string | null;
  onChange: (id: string | null) => void;
}): React.ReactNode {
  return (
    <div
      className="flex gap-2 overflow-x-auto px-4 pb-1 pt-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Filter by category"
    >
      <ChipButton dataChipId="all" pressed={selected === null} onClick={() => onChange(null)}>
        All
      </ChipButton>
      {categories.map((cat) => (
        <ChipButton
          key={cat.id}
          dataChipId={cat.id}
          pressed={selected === cat.id}
          onClick={() => onChange(cat.id)}
        >
          {cat.name}
          {cat.product_count > 0 ? (
            <span
              className={selected === cat.id ? 'ml-1.5 text-[var(--teal-600)]' : 'ml-1.5 text-[var(--fg-3)]'}
              style={{ fontSize: 'var(--b-text-eyebrow)' }}
            >
              {cat.product_count}
            </span>
          ) : null}
        </ChipButton>
      ))}
    </div>
  );
}

function BrandFilterWithDataAttrs({
  brands,
  selected,
  onChange,
}: {
  brands: Array<{ id: string; name: string }>;
  selected: string | null;
  onChange: (id: string | null) => void;
}): React.ReactNode {
  return (
    <div
      className="flex gap-2 overflow-x-auto px-4 pb-1 pt-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Filter by brand"
    >
      <ChipButton dataChipId="all" pressed={selected === null} onClick={() => onChange(null)}>
        All
      </ChipButton>
      {brands.map((brand) => (
        <ChipButton
          key={brand.id}
          dataChipId={brand.id}
          pressed={selected === brand.id}
          onClick={() => onChange(brand.id)}
        >
          {brand.name}
        </ChipButton>
      ))}
    </div>
  );
}

function ChipButton({
  children,
  pressed,
  onClick,
  dataChipId,
}: {
  children: React.ReactNode;
  pressed: boolean;
  onClick: () => void;
  dataChipId: string;
}): React.ReactNode {
  return (
    <button
      type="button"
      data-chip-id={dataChipId}
      onClick={onClick}
      className={
        pressed
          ? 'flex-shrink-0 whitespace-nowrap rounded-full border border-[var(--teal-100)] bg-[var(--teal-50)] px-3 py-1.5 font-medium text-[var(--teal-700)] transition-colors'
          : 'flex-shrink-0 whitespace-nowrap rounded-full border border-[var(--border-1)] bg-[var(--bg-surface)] px-3 py-1.5 font-medium text-[var(--fg-2)] transition-colors'
      }
      style={{ fontSize: 'var(--b-text-label)' }}
      aria-pressed={pressed}
    >
      {children}
    </button>
  );
}
