import { PageWrap } from '@/components/seller/layout';
import { RecommendationsSettingsClient } from '@/components/seller/settings/RecommendationsSettingsClient';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';
import { supabaseAdmin } from '@/lib/supabase';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.settingsRecommendations);

export default async function RecommendationsSettingsPage() {
  const tenantId = await requireSellerServerTenantId();
  if (!supabaseAdmin) return null;

  const db = supabaseAdmin as any;

  const [categoriesRes, suggestionsRes, bundlesRes] = await Promise.all([
    db.schema('app').rpc('reco_get_category_roles', { p_tenant_id: tenantId }),
    db
      .schema('app')
      .from('reco_bundle_suggestions')
      .select('id, suggested_name, category_ids, avg_co_occurrence, confidence_score, status, computed_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .order('confidence_score', { ascending: false }),
    db
      .schema('app')
      .from('reco_bundles')
      .select(`id, name, description, is_active, source, created_at,
        reco_bundle_slots ( id, tenant_category_id, slot_label, is_required, display_order )`)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
  ]);

  // Hydrate category names for bundle suggestions
  const suggestionCategoryIds = Array.from(
    new Set((suggestionsRes.data ?? []).flatMap((s: any) => s.category_ids ?? [])),
  );
  let categoryNames: Record<string, string> = {};
  if (suggestionCategoryIds.length > 0) {
    const { data: cats } = await db
      .schema('app')
      .from('tenant_categories')
      .select('id, name')
      .in('id', suggestionCategoryIds)
      .eq('tenant_id', tenantId);
    categoryNames = Object.fromEntries((cats ?? []).map((c: any) => [c.id, c.name]));
  }

  // Hydrate category names for bundle slots
  const slotCategoryIds = Array.from(
    new Set(
      (bundlesRes.data ?? []).flatMap((b: any) =>
        (b.reco_bundle_slots ?? []).map((s: any) => s.tenant_category_id),
      ),
    ),
  );
  if (slotCategoryIds.length > 0) {
    const { data: slotCats } = await db
      .schema('app')
      .from('tenant_categories')
      .select('id, name')
      .in('id', slotCategoryIds)
      .eq('tenant_id', tenantId);
    (slotCats ?? []).forEach((c: any) => { categoryNames[c.id] = c.name; });
  }

  const suggestions = (suggestionsRes.data ?? []).map((s: any) => ({
    ...s,
    category_names: (s.category_ids ?? []).map((id: string) => categoryNames[id] ?? id),
  }));

  const bundles = (bundlesRes.data ?? []).map((b: any) => ({
    ...b,
    slots: (b.reco_bundle_slots ?? [])
      .sort((a: any, z: any) => a.display_order - z.display_order)
      .map((s: any) => ({ ...s, category_name: categoryNames[s.tenant_category_id] ?? null })),
  }));

  const roleCategoryIds = (categoriesRes.data ?? []).map((c: { category_id: string }) => c.category_id);
  let categoryThumbKeys: Record<string, string | null> = {};
  if (roleCategoryIds.length > 0) {
    const { data: roleCats } = await db
      .schema('app')
      .from('tenant_categories')
      .select('id, r2_image_thumb_key')
      .in('id', roleCategoryIds)
      .eq('tenant_id', tenantId);
    categoryThumbKeys = Object.fromEntries(
      (roleCats ?? []).map((c: { id: string; r2_image_thumb_key: string | null }) => [
        c.id,
        c.r2_image_thumb_key,
      ]),
    );
  }

  const categories = (categoriesRes.data ?? []).map((c: { category_id: string }) => ({
    ...c,
    r2_image_thumb_key: categoryThumbKeys[c.category_id] ?? null,
  }));

  return (
    <PageWrap>
      <RecommendationsSettingsClient
        initialCategories={categories}
        initialSuggestions={suggestions}
        initialBundles={bundles}
      />
    </PageWrap>
  );
}
