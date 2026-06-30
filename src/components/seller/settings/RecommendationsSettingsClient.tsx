'use client';

import { useState } from 'react';
import { Layers, Package, Plus, Sparkles, Tag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SettingsSectionCard } from './SettingsSectionCard';
import { CategoryRolesTable, type CategoryRoleRow } from './CategoryRolesTable';
import { BundleSuggestionsInbox, type BundleSuggestion } from './BundleSuggestionsInbox';
import { BundleEditorDialog, type BundleRecord } from './BundleEditorDialog';

type Tab = 'category-roles' | 'bundle-suggestions' | 'bundles';

interface RecommendationsSettingsClientProps {
  tenantId: string;
  initialCategories: CategoryRoleRow[];
  initialSuggestions: BundleSuggestion[];
  initialBundles: BundleRecord[];
}

export function RecommendationsSettingsClient({
  tenantId,
  initialCategories,
  initialSuggestions,
  initialBundles,
}: RecommendationsSettingsClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>('category-roles');
  const [bundles, setBundles] = useState<BundleRecord[]>(initialBundles);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingBundle, setEditingBundle] = useState<BundleRecord | null>(null);
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(initialSuggestions.length);

  // Derive category list for bundle slot picker
  const availableCategories = initialCategories.map((c) => ({ id: c.category_id, name: c.category_name }));

  function openCreateBundle() {
    setEditingBundle(null);
    setEditorOpen(true);
  }

  function openEditBundle(bundle: BundleRecord) {
    setEditingBundle(bundle);
    setEditorOpen(true);
  }

  function handleBundleSaved(bundleId: string, name: string) {
    // Optimistic: reload page to get fresh data
    // A full refetch would be ideal but page reload is safe here
    window.location.reload();
  }

  function handleSuggestionAccepted(bundleId: string) {
    setPendingCount((n) => Math.max(0, n - 1));
    setActiveTab('bundles');
    window.location.reload();
  }

  async function handleDeactivateBundle(bundleId: string) {
    setDeactivating(bundleId);
    try {
      const res = await fetch(`/api/tenant/reco/bundles/${bundleId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      setBundles((prev) => prev.filter((b) => b.id !== bundleId));
      toast.success('Bundle deactivated');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to deactivate bundle');
    } finally {
      setDeactivating(null);
    }
  }

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'category-roles', label: 'Category Roles', count: initialCategories.length },
    { id: 'bundle-suggestions', label: 'Suggestions', count: pendingCount },
    { id: 'bundles', label: 'Bundles', count: bundles.length },
  ];

  return (
    <>
      <SellerTopbar title="Product Recommendations" />

      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* Tab bar */}
        <div className="mb-6 flex gap-1 rounded-xl border border-cream-200 bg-cream-50 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-white text-cream-900 shadow-sm ring-1 ring-cream-200'
                  : 'text-cream-500 hover:text-cream-700',
              ].join(' ')}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <Badge variant={tab.id === 'bundle-suggestions' ? 'teal' : 'default'} className="text-xs px-1.5 py-0">
                  {tab.count}
                </Badge>
              )}
            </button>
          ))}
        </div>

        {/* Category Roles tab */}
        {activeTab === 'category-roles' && (
          <SettingsSectionCard
            icon={Tag}
            title="Category Roles"
            subtitle="Control which categories appear in Bestsellers. Companions (accessories) are excluded from global discovery but still shown in 'add to cart' suggestions."
          >
            <CategoryRolesTable tenantId={tenantId} initialCategories={initialCategories} />
            <p className="mt-3 text-xs text-cream-400">
              Roles are auto-detected weekly from order data. Override any row to lock in your preference — overrides survive batch job reruns.
            </p>
          </SettingsSectionCard>
        )}

        {/* Bundle Suggestions tab */}
        {activeTab === 'bundle-suggestions' && (
          <SettingsSectionCard
            icon={Sparkles}
            title="Bundle Suggestions"
            subtitle="These category clusters were detected in your order data. Accept to create a bundle that powers the 'Complete Your Cart' widget for buyers."
          >
            <BundleSuggestionsInbox
              initialSuggestions={initialSuggestions}
              onBundleCreated={handleSuggestionAccepted}
            />
          </SettingsSectionCard>
        )}

        {/* Bundles tab */}
        {activeTab === 'bundles' && (
          <SettingsSectionCard
            icon={Layers}
            title="Bundles"
            subtitle="Define product kits that drive the 'Complete Your Cart' widget on the buyer cart page."
            footer={
              <Button size="sm" onClick={openCreateBundle} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Create bundle
              </Button>
            }
          >
            {bundles.length === 0 ? (
              <div className="rounded-lg border border-dashed border-cream-300 bg-cream-50 py-10 text-center">
                <Package className="mx-auto mb-2 h-8 w-8 text-cream-300" />
                <p className="text-sm font-medium text-cream-600">No bundles yet</p>
                <p className="mt-1 text-xs text-cream-400">
                  Accept a suggestion above or create a bundle manually.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {bundles.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-start justify-between gap-4 rounded-xl border border-cream-200 bg-white px-4 py-3 shadow-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-cream-900 text-sm">{b.name}</p>
                        <Badge variant="outline" className="text-xs">{b.source}</Badge>
                      </div>
                      {b.description && (
                        <p className="mt-0.5 text-xs text-cream-500">{b.description}</p>
                      )}
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {b.slots.map((s, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {(s as any).category_name ?? s.tenant_category_id}
                            {s.is_required ? '' : ' (opt)'}
                          </Badge>
                        ))}
                        {b.slots.length === 0 && (
                          <span className="text-xs text-cream-400">No slots defined</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditBundle(b)}
                        className="text-cream-500 hover:text-cream-700"
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeactivateBundle(b.id)}
                        disabled={deactivating === b.id}
                        className="text-cream-400 hover:text-red-500 transition-colors"
                        aria-label="Deactivate bundle"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SettingsSectionCard>
        )}
      </div>

      <BundleEditorDialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        bundle={editingBundle}
        availableCategories={availableCategories}
        onSaved={handleBundleSaved}
      />
    </>
  );
}
