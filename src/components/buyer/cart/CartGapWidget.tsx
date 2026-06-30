'use client';

import { Package, Plus, Sparkles } from 'lucide-react';
import posthog from 'posthog-js';
import { formatCurrency } from '@/lib/utils';
import type { BuyerCartItem } from '@/contexts/BuyerCartContext';
import type { CartBundle, CartBundleSlot } from '@/hooks/useCartBundles';
import type { BuyerCatalogItem } from '@/types/buyer';

interface CartGapWidgetProps {
  bundles: CartBundle[];
  items: BuyerCartItem[];
  tenantId: string;
  onAddToCart: (product: BuyerCatalogItem, bundleName: string, slotCategory: string) => void;
}

interface GapSlot {
  slot: CartBundleSlot;
  bundleName: string;
}

function getCartGap(items: BuyerCartItem[], bundles: CartBundle[]): { bundleName: string; gaps: GapSlot[] } | null {
  if (bundles.length === 0 || items.length === 0) return null;

  const coveredCategoryIds = new Set(items.map((i) => i.tenant_category_id).filter(Boolean) as string[]);

  // Score each bundle: how many of its required slots are already covered by the cart
  let bestBundle: CartBundle | null = null;
  let bestScore = -1;

  for (const bundle of bundles) {
    const requiredSlots = bundle.slots.filter((s) => s.is_required);
    const covered = requiredSlots.filter((s) => coveredCategoryIds.has(s.tenant_category_id)).length;
    // Only show a bundle if at least one slot is already covered (establishes relevance)
    if (covered > bestScore && covered >= 1) {
      bestScore = covered;
      bestBundle = bundle;
    }
  }

  if (!bestBundle) return null;

  const gaps: GapSlot[] = bestBundle.slots
    .filter((s) => s.is_required && !coveredCategoryIds.has(s.tenant_category_id) && s.top_product !== null)
    .map((s) => ({ slot: s, bundleName: bestBundle!.name }));

  if (gaps.length === 0) return null;

  return { bundleName: bestBundle.name, gaps };
}

export function CartGapWidget({ bundles, items, tenantId, onAddToCart }: CartGapWidgetProps) {
  const result = getCartGap(items, bundles);
  if (!result) return null;

  const { bundleName, gaps } = result;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--teal-100, #ccfbf1)', background: 'var(--teal-50, #f0fdfa)' }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--teal-100, #ccfbf1)' }}>
        <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--teal-500)' }} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold" style={{ fontSize: 'var(--b-text-label)', color: 'var(--teal-800, #134e4a)' }}>
            You might be missing
          </p>
          <p className="truncate" style={{ fontSize: 'var(--b-text-sub)', color: 'var(--teal-600, #0d9488)' }}>
            Complete your {bundleName}
          </p>
        </div>
      </div>

      {/* Gap slots */}
      <div className="divide-y" style={{ '--divide-color': 'var(--teal-100, #ccfbf1)' } as React.CSSProperties}>
        {gaps.map(({ slot }) => {
          const product = slot.top_product!;
          const label = slot.slot_label ?? product.display_name;
          const imageUrl = product.image_urls[0] ?? null;

          return (
            <div key={slot.tenant_category_id} className="flex items-center gap-3 px-4 py-3">
              {/* Thumbnail */}
              <div
                className="rounded-lg flex items-center justify-center overflow-hidden shrink-0"
                style={{ width: 44, height: 44, background: 'var(--teal-100, #ccfbf1)' }}
              >
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt={product.display_name} className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-5 h-5" style={{ color: 'var(--teal-400)' }} />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                {slot.slot_label && (
                  <p className="uppercase mb-0.5" style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.12em', color: 'var(--teal-600, #0d9488)' }}>
                    {slot.slot_label}
                  </p>
                )}
                <p className="font-medium leading-snug truncate" style={{ fontSize: 'var(--b-text-label)', color: 'var(--teal-900, #042f2e)' }}>
                  {product.display_name}
                </p>
                <p style={{ fontSize: 'var(--b-text-sub)', fontFamily: 'var(--font-mono)', color: 'var(--teal-700, #0f766e)' }}>
                  {formatCurrency(product.price)}
                </p>
              </div>

              {/* Add button */}
              <button
                onClick={() => {
                  onAddToCart(product, bundleName, slot.slot_label ?? label);
                  posthog.capture('reco_cart_gap_add', {
                    bundle_name: bundleName,
                    slot_category: slot.slot_label ?? slot.tenant_category_id,
                    added_product_id: product.tenant_product_id,
                    tenant_id: tenantId,
                  });
                }}
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'var(--teal-500)',
                  color: '#fff',
                  border: 'none',
                }}
                aria-label={`Add ${product.display_name} to cart`}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
