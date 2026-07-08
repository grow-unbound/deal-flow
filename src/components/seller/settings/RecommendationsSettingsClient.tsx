'use client';

import { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { DetailTabs } from '@/components/seller/detail';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DialogBody } from '@/components/ui/dialog';
import { CategoryRolesTable, type CategoryRoleRow } from './CategoryRolesTable';
import { BundleSuggestionsInbox, type BundleSuggestion } from './BundleSuggestionsInbox';
import { BundleEditorDialog, type BundleRecord } from './BundleEditorDialog';
import { BundlesTable } from './BundlesTable';

type Tab = 'category-roles' | 'bundle-suggestions' | 'bundles';

interface RecommendationsSettingsClientProps {
  initialCategories: CategoryRoleRow[];
  initialSuggestions: BundleSuggestion[];
  initialBundles: BundleRecord[];
}

function TabSection({ title, helpText, children }: {
  title: string;
  helpText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-cream-900">{title}</h2>
        <p className="mt-2 max-w-[180ch] text-md text-cream-700">{helpText}</p>
      </div>
      {children}
    </div>
  );
}

export function RecommendationsSettingsClient({
  initialCategories,
  initialSuggestions,
  initialBundles,
}: RecommendationsSettingsClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>('category-roles');
  const [bundles, setBundles] = useState<BundleRecord[]>(initialBundles);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingBundle, setEditingBundle] = useState<BundleRecord | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<BundleRecord | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingCount, setPendingCount] = useState(initialSuggestions.length);

  const availableCategories = initialCategories.map((c) => ({ id: c.category_id, name: c.category_name }));

  function openCreateBundle() {
    setEditingBundle(null);
    setEditorOpen(true);
  }

  function openEditBundle(bundle: BundleRecord) {
    setEditingBundle(bundle);
    setEditorOpen(true);
  }

  function handleBundleSaved() {
    window.location.reload();
  }

  function handleSuggestionAccepted() {
    setPendingCount((n) => Math.max(0, n - 1));
    setActiveTab('bundles');
    window.location.reload();
  }

  async function handleRefreshRecommendations() {
    setRefreshing(true);
    try {
      const res = await fetch('/api/tenant/reco/refresh', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Failed to refresh recommendations');
      toast.success('Product recommendations refreshed');
      window.location.reload();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to refresh recommendations';
      toast.error(message);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDeactivateBundle(bundleId: string) {
    setDeactivating(true);
    try {
      const res = await fetch(`/api/tenant/reco/bundles/${bundleId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      setBundles((prev) => prev.filter((b) => b.id !== bundleId));
      setDeactivateTarget(null);
      toast.success('Bundle deactivated');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to deactivate bundle';
      toast.error(message);
    } finally {
      setDeactivating(false);
    }
  }

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => void handleRefreshRecommendations()}
        disabled={refreshing}
        className="flex items-center gap-2"
      >
        <RefreshCw size={16} className={refreshing ? 'animate-spin' : undefined} />
        Refresh product recommendations
      </Button>
      <Button type="button" onClick={openCreateBundle} className="flex items-center gap-2">
        <Plus size={16} />
        Create bundle
      </Button>
    </div>
  );

  return (
    <div className="w-full">
      <SellerTopbar
        eyebrow="Settings"
        title="Product Recommendations"
        subtitle="Control category discovery roles, review auto-detected bundle suggestions, and manage cart-completion kits."
        action={headerActions}
      />

      <DetailTabs
        tabs={[
          { id: 'category-roles', label: 'Category Roles', badge: initialCategories.length || undefined },
          { id: 'bundle-suggestions', label: 'Suggestions', badge: pendingCount || undefined },
          { id: 'bundles', label: 'Bundles', badge: bundles.length || undefined },
        ]}
        active={activeTab}
        onChange={(tabId) => setActiveTab(tabId as Tab)}
      />

      {activeTab === 'category-roles' && (
        <TabSection
          title="Category roles"
          helpText="Control which categories appear in Bestsellers. Companions (accessories) are excluded from global discovery but still shown in add-to-cart suggestions. Roles are auto-detected weekly from order data. Override any row to lock in your preference — overrides survive batch job reruns."
        >
          <CategoryRolesTable initialCategories={initialCategories} />
        </TabSection>
      )}

      {activeTab === 'bundle-suggestions' && (
        <TabSection
          title="Bundle suggestions"
          helpText="These category clusters were detected in your order data. Accept to create a bundle that powers the Complete Your Cart widget for buyers."
        >
          <BundleSuggestionsInbox
            initialSuggestions={initialSuggestions}
            onBundleCreated={handleSuggestionAccepted}
          />
        </TabSection>
      )}

      {activeTab === 'bundles' && (
        <TabSection
          title="Bundles"
          helpText="Define product kits that drive the Complete Your Cart widget on the buyer cart page."
        >
          <BundlesTable
            bundles={bundles}
            deactivating={deactivating}
            onCreateBundle={openCreateBundle}
            onEditBundle={openEditBundle}
            onDeactivateBundle={setDeactivateTarget}
          />
        </TabSection>
      )}

      <BundleEditorDialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        bundle={editingBundle}
        availableCategories={availableCategories}
        onSaved={handleBundleSaved}
      />

      <AlertDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
      >
        <AlertDialogContent className="border-cream-200 bg-cream-50">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-cream-900">
              Deactivate bundle?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-cream-700">
              This bundle will no longer appear in the Complete Your Cart widget. You can create a new bundle later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deactivateTarget ? (
            <DialogBody className="space-y-2 rounded-md border border-cream-300 bg-white p-4 text-body-sm text-cream-800">
              <div>
                <span className="text-cream-600">Name: </span>
                {deactivateTarget.name}
              </div>
              {deactivateTarget.slots.length > 0 ? (
                <div>
                  <span className="text-cream-600">Categories: </span>
                  {deactivateTarget.slots
                    .map((s) => s.category_name ?? s.tenant_category_id)
                    .join(', ')}
                </div>
              ) : null}
            </DialogBody>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivating} onClick={() => setDeactivateTarget(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!deactivateTarget || deactivating}
              className="bg-danger-500 text-cream-50 hover:bg-danger-600"
              onClick={(event) => {
                event.preventDefault();
                if (deactivateTarget) {
                  void handleDeactivateBundle(deactivateTarget.id);
                }
              }}
            >
              {deactivating ? 'Deactivating…' : 'Deactivate bundle'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
