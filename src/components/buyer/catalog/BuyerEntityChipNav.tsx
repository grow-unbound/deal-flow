'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { LayoutGrid, Store } from 'lucide-react';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import { cn } from '@/lib/utils';
import type { BuyerBrand, BuyerCategory } from '@/types/buyer';

type ChipNavMode = 'landing' | 'detail';
type ChipNavVariant = 'chips' | 'rail';

interface BuyerCategoryChipNavProps {
  kind: 'category';
  categories: BuyerCategory[];
  selectedId: string | null;
  mode: ChipNavMode;
  variant?: ChipNavVariant;
  onSelectId?: (id: string) => void;
}

interface BuyerBrandChipNavProps {
  kind: 'brand';
  brands: BuyerBrand[];
  selectedId: string | null;
  mode: ChipNavMode;
  variant?: ChipNavVariant;
  onSelectId?: (id: string) => void;
}

export type BuyerEntityChipNavProps = BuyerCategoryChipNavProps | BuyerBrandChipNavProps;

type BuyerNavItem = {
  id: string | null;
  label: string;
  imageUrl?: string | null;
};

function storageKeyFor(kind: BuyerEntityChipNavProps['kind'], mode: ChipNavMode, variant: ChipNavVariant): string {
  return `buyer-chip-scroll:${kind}:${mode}:${variant}`;
}

function getItems(props: BuyerEntityChipNavProps): BuyerNavItem[] {
  const allItem: BuyerNavItem = {
    id: null,
    label: props.kind === 'category' ? 'All Categories' : 'All Brands',
  };

  if (props.kind === 'category') {
    return [
      allItem,
      ...props.categories.map((category) => ({
        id: category.id,
        label: category.name,
        imageUrl: category.image_url,
      })),
    ];
  }

  return [
    allItem,
    ...props.brands.map((brand) => ({
      id: brand.id,
      label: brand.name,
      imageUrl: brand.logo_url,
    })),
  ];
}

function useScrollableSelectionSync(
  kind: BuyerEntityChipNavProps['kind'],
  mode: ChipNavMode,
  variant: ChipNavVariant,
  selectedId: string | null,
  itemCount: number,
): React.RefObject<HTMLDivElement | null> {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const restoredRef = React.useRef(false);

  React.useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node || itemCount === 0 || typeof window === 'undefined') return;
    if (variant !== 'chips' || restoredRef.current) return;

    const raw = window.sessionStorage.getItem(storageKeyFor(kind, mode, variant));
    if (raw) {
      const scrollLeft = Number(raw);
      if (!Number.isNaN(scrollLeft)) {
        node.scrollLeft = scrollLeft;
      }
    }
    restoredRef.current = true;
  }, [itemCount, kind, mode, variant]);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof window === 'undefined') return;
    if (variant !== 'chips') return;

    const onScroll = () => {
      window.sessionStorage.setItem(storageKeyFor(kind, mode, variant), String(node.scrollLeft));
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => node.removeEventListener('scroll', onScroll);
  }, [kind, mode, variant]);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || itemCount === 0) return;
    if (variant === 'rail') return;

    const active = node.querySelector<HTMLElement>(`[data-chip-id="${selectedId ?? '__all__'}"]`);
    if (!active || typeof active.scrollIntoView !== 'function') return;

    active.scrollIntoView({
      inline: variant === 'chips' ? 'center' : 'nearest',
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [itemCount, selectedId, variant]);

  return containerRef;
}

export function BuyerEntityChipNav(props: BuyerEntityChipNavProps): React.ReactNode {
  const router = useRouter();
  const variant = props.variant ?? 'chips';
  const items = getItems(props);
  const containerRef = useScrollableSelectionSync(props.kind, props.mode, variant, props.selectedId, items.length);

  const navigateTo = React.useCallback((id: string | null) => {
    if (props.mode === 'detail' && id !== null && props.onSelectId) {
      props.onSelectId(id);
      return;
    }

    let path: string | null = null;
    let replace = false;

    if (props.kind === 'category') {
      if (id === null) {
        if (props.mode === 'detail') path = '/buy/home';
      } else {
        path = `/buy/home/category/${id}`;
        replace = props.mode === 'detail';
      }
    } else {
      if (id === null) {
        if (props.mode === 'detail') path = '/buy/home';
      } else {
        path = `/buy/home/brand/${id}`;
        replace = props.mode === 'detail';
      }
    }

    if (!path) return;
    markBuyerNavigationForward();
    if (replace) {
      router.replace(path);
      return;
    }
    router.push(path);
  }, [props.kind, props.mode, props.onSelectId, router]);

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = Math.min(items.length - 1, index + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = Math.max(0, index - 1);
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = items.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextItem = items[nextIndex];
    if (!nextItem) return;
    navigateTo(nextItem.id);
  }, [items, navigateTo]);

  const navLabel =
    variant === 'rail'
      ? props.kind === 'category' ? 'Category navigation' : 'Brand navigation'
      : props.kind === 'category' ? 'Category filters' : 'Brand filters';

  if (items.length <= 1) return null;

  return (
    <nav
      ref={containerRef}
      className={cn(
        variant === 'chips'
          ? 'flex gap-2 overflow-x-auto px-4 pb-1 pt-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
          : 'flex max-h-[calc(100dvh-14rem)] flex-col overflow-y-auto',
      )}
      aria-label={navLabel}
    >
      {items.map((item, index) => {
        const selected = props.selectedId === item.id || (props.selectedId === null && item.id === null);
        return (
          <button
            key={item.id ?? 'all'}
            type="button"
            data-chip-id={item.id ?? '__all__'}
            onClick={() => navigateTo(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            aria-current={selected ? 'page' : undefined}
            className={
              variant === 'chips'
                ? selected
                  ? 'flex-shrink-0 whitespace-nowrap rounded-full border border-[var(--teal-100)] bg-[var(--teal-50)] px-3 py-1.5 font-medium text-[var(--teal-700)] transition-colors'
                  : 'flex-shrink-0 whitespace-nowrap rounded-full border border-[var(--border-1)] bg-[var(--bg-surface)] px-3 py-1.5 font-medium text-[var(--fg-2)] transition-colors'
                : cn(
                    'border-b border-[var(--border-1)] text-left transition-colors last:border-b-0 [@media(hover:hover)]:hover:bg-[var(--bg-recessed)] focus-visible:bg-[var(--bg-recessed)] focus-visible:outline-none',
                    'flex min-h-[88px] flex-col items-center justify-center gap-2 px-1 py-3 sm:min-h-[96px] sm:px-2',
                    'lg:min-h-[76px] lg:flex-row lg:items-center lg:justify-start lg:gap-3 lg:px-1 lg:py-3',
                    selected
                      ? 'bg-[var(--cream-300)] font-bold text-cream-950'
                      : 'bg-transparent font-medium text-[var(--fg-2)]',
                  )
            }
            style={variant === 'chips' ? { fontSize: 'var(--b-text-label)' } : undefined}
          >
            {variant === 'rail' ? (
              <RailThumb
                label={item.label}
                imageUrl={item.imageUrl ?? null}
                entityKind={props.kind}
              />
            ) : null}
            <span className={cn('min-w-0', variant === 'rail' ? 'flex flex-1 flex-col items-center text-center lg:items-start lg:text-left' : '')}>
              <span
                className={cn(
                  variant === 'rail' ? 'line-clamp-2 text-center font-medium leading-tight lg:text-left' : '',
                )}
                style={variant === 'rail' ? { fontSize: 'clamp(11px, 1.8vw, var(--b-text-label))' } : undefined}
              >
                {item.label}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function RailThumb({
  label,
  imageUrl,
  entityKind,
}: {
  label: string;
  imageUrl: string | null;
  entityKind: 'brand' | 'category';
}) {
  const [imgError, setImgError] = React.useState(false);
  const showImage = Boolean(imageUrl) && !imgError;
  const FallbackIcon = entityKind === 'brand' ? Store : LayoutGrid;

  return (
    <div
      className={cn(
        'relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden border border-[var(--border-1)] bg-[var(--bg-surface)] p-1 sm:h-14 sm:w-14 sm:p-1.5 lg:h-16 lg:w-16 lg:p-2',
        entityKind === 'brand' ? 'rounded-full' : 'rounded-[10px] lg:rounded-[12px]',
      )}
    >
      {showImage ? (
        <Image
          src={imageUrl!}
          alt=""
          fill
          className="object-contain"
          sizes="(max-width: 639px) 48px, (max-width: 1023px) 56px, 64px"
          onError={() => setImgError(true)}
          unoptimized
        />
      ) : (
        <FallbackIcon className="h-6 w-6 text-[var(--fg-3)] lg:h-7 lg:w-7" aria-hidden />
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
}
