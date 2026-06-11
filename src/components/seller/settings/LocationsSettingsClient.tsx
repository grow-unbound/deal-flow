'use client';

import { useState } from 'react';
import { MapPin, Plus } from 'lucide-react';

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
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { useTenantLocations } from '@/hooks/useTenantLocations';
import { useRole } from '@/hooks/useRole';
import type { TenantLocation } from '@/types/tenant-locations';

import { LocationFormSheet } from './LocationFormSheet';
import { LocationsTable } from './LocationsTable';
import { SettingsSectionCard } from './SettingsSectionCard';

export function LocationsSettingsClient() {
  const { isSellerAdmin } = useRole();
  const { data, isLoading, isError, error, refetch, deactivateLocation, updateLocation, isDeactivating } =
    useTenantLocations();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<TenantLocation | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<TenantLocation | null>(null);

  const locations = data?.locations ?? [];
  const busy = isDeactivating;

  function openAdd() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(loc: TenantLocation) {
    setEditing(loc);
    setSheetOpen(true);
  }

  async function handleReactivate(loc: TenantLocation) {
    await updateLocation({ id: loc.id, patch: { reactivate: true } });
  }

  return (
    <>
      <SettingsSectionCard
        title="Locations"
        subtitle="Warehouses, dispatch points, and branches. Inventory is tracked per location where enabled."
        icon={MapPin}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cream-200 bg-cream-50 px-4 py-3">
            <div className="text-sm font-semibold text-cream-900">
              All locations
              <span className="ml-2 font-mono text-xs font-normal text-cream-600">{locations.length}</span>
            </div>
            {isSellerAdmin ? (
              <Button type="button" size="sm" onClick={openAdd}>
                <Plus className="mr-2 h-4 w-4" />
                Add location
              </Button>
            ) : null}
          </div>

          {isLoading ? (
            <div className="space-y-2" aria-busy>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-md border border-cream-100 bg-cream-50" />
              ))}
            </div>
          ) : isError ? (
            <ErrorState
              heading="Could not load locations"
              description={error instanceof Error ? error.message : 'Something went wrong.'}
              onRetry={() => void refetch()}
            />
          ) : locations.length === 0 ? (
            <EmptyState
              icon={<MapPin className="h-7 w-7" strokeWidth={1.5} />}
              heading="No locations yet"
              description="Add your first warehouse or branch to start tracking stock by location."
              action={
                isSellerAdmin ? (
                  <Button type="button" onClick={openAdd}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add location
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <LocationsTable
              locations={locations}
              isAdmin={isSellerAdmin}
              isBusy={busy}
              onEdit={openEdit}
              onDeactivate={(loc) => setDeactivateTarget(loc)}
              onReactivate={(loc) => void handleReactivate(loc)}
            />
          )}
        </div>
      </SettingsSectionCard>

      <LocationFormSheet open={sheetOpen} onOpenChange={setSheetOpen} editingLocation={editing} />

      <AlertDialog
        open={Boolean(deactivateTarget)}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
      >
        <AlertDialogContent className="border-cream-200 bg-cream-50">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-cream-900">Deactivate location?</AlertDialogTitle>
            <AlertDialogDescription className="text-cream-700">
              The location will be hidden from day-to-day flows. You cannot deactivate while stock remains here, or
              while it is the only inventory-tracked location with inventory rows.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deactivateTarget ? (
            <div className="rounded-md border border-warning-500/30 bg-warning-50 px-4 py-3 text-body-sm text-warning-800">
              <span className="font-medium text-warning-900">{deactivateTarget.name}</span>
              {deactivateTarget.address?.city ? (
                <span className="text-warning-700/90"> — {deactivateTarget.address.city}</span>
              ) : null}
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger-500 text-white hover:bg-danger-600"
              disabled={!deactivateTarget || busy}
              onClick={(e) => {
                e.preventDefault();
                if (!deactivateTarget) return;
                void deactivateLocation(deactivateTarget.id).then(() => setDeactivateTarget(null));
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
