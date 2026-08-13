'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVisibleItemEnrichment } from '@/hooks/useVisibleItemEnrichment';
import { useBuyerCatalogEnrichment } from '@/hooks/useBuyerProducts';
import type { BuyerCatalogItem, BuyerCatalogTextItem } from '@/types/buyer';

/** Text-only result rendered as a placeholder card while phase-2 price/stock enrichment is pending. */
function toPlaceholderItem(item: BuyerCatalogTextItem): BuyerCatalogItem {
  return {
    id: item.id,
    tenant_product_id: item.tenant_product_id,
    campaign_id: null,
    campaign_name: null,
    campaign_valid_until: null,
    internal_sku: item.internal_sku,
    display_name: item.display_name,
    brand_id: item.brand_id,
    brand_name: item.brand_name,
    category_id: item.category_id,
    category_name: item.category_name,
    mrp: 0,
    price: 0,
    resolved_price: 0,
    has_campaign_price: false,
    gst_rate: null,
    default_uom: null,
    pack_size: null,
    image_urls: item.image_urls ?? [],
    brand_logo_url: item.brand_logo_url ?? null,
    category_image_url: item.category_image_url ?? null,
    stock_status: 'available',
    on_hand: 0,
    is_featured: false,
    is_enriched: false,
  };
}

/**
 * Shared phase-1 (text) + phase-2 (viewport-gated price/stock enrichment)
 * merge logic for any buyer catalog grid. Pass the flattened text-phase
 * items and a `resetKey` (e.g. the active query/filter signature) that
 * clears the enrichment cache when the underlying list changes.
 */
export function useTwoPhaseProductGrid(textItems: BuyerCatalogTextItem[], resetKey: string) {
  const [enrichedById, setEnrichedById] = useState<Map<string, BuyerCatalogItem>>(new Map());
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const enrichedByIdRef = useRef(enrichedById);
  enrichedByIdRef.current = enrichedById;

  useEffect(() => {
    setEnrichedById(new Map());
    setPendingIds([]);
  }, [resetKey]);

  const enrichmentQuery = useBuyerCatalogEnrichment(pendingIds);

  useEffect(() => {
    if (!enrichmentQuery.data || enrichmentQuery.data.length === 0) return;
    setEnrichedById((prev) => {
      const next = new Map(prev);
      for (const item of enrichmentQuery.data!) next.set(item.tenant_product_id, item);
      return next;
    });
  }, [enrichmentQuery.data]);

  const handleBatchVisible = useCallback((ids: string[]) => {
    const toFetch = ids.filter((id) => !enrichedByIdRef.current.has(id));
    if (toFetch.length === 0) return;
    setPendingIds((prev) => {
      const merged = new Set(prev);
      let changed = false;
      for (const id of toFetch) {
        if (!merged.has(id)) {
          merged.add(id);
          changed = true;
        }
      }
      return changed ? Array.from(merged) : prev;
    });
  }, []);

  const enrichedIds = useMemo(() => new Set(enrichedById.keys()), [enrichedById]);
  const { registerRef } = useVisibleItemEnrichment({
    enrichedIds,
    onBatchVisible: handleBatchVisible,
  });

  const shownItems = useMemo(
    () => textItems.map((item) => enrichedById.get(item.tenant_product_id) ?? toPlaceholderItem(item)),
    [textItems, enrichedById],
  );

  return { shownItems, registerItemRef: registerRef };
}
