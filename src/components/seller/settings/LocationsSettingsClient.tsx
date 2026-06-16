'use client';

import { useMemo, useState } from 'react';
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
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FilterBar, LandingTable } from '@/components/seller/layout';
import { useTenantLocations } from '@/hooks/useTenantLocations';
import { useRole } from '@/hooks/useRole';
import type { TenantLocation } from '@/types/tenant-locations';

import { LocationFormSheet } from './LocationFormSheet';
import { LocationsTableRows } from './LocationsTable';

type TypeChip = 'All' | 'Warehouse' | 'Dispatch Point' | 'Branch';
type StatusSort = 'All statuses' | 'Active only' | 'Inactive only';

const TYPE_CHIPS: TypeChip[] = ['All', 'Warehouse', 'Dispatch Point', 'Branch'];
const STATUS_SORT: StatusSort[] = ['All statuses', 'Active only', 'Inactive only'];

export function LocationsSettingsClient() {
  const { isSellerAdmin } = useRole();
  const { data, isLoading, isError, error, refetch, deactivateLocation, updateLocation, isDeactivating } =
    useTenantLocations();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<TenantLocation | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<TenantLocation | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeChip>('All');
  const [statusSort, setStatusSort] = useState<StatusSort>('All statuses');
  const [search, setSearch] = useState('');

  const allLocations = data?.locations ?? [];
  const busy = isDeactivating;

  const locations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allLocations.filter((loc) => {
      if (typeFilter === 'Warehouse' && loc.type !== 'warehouse') return false;
      if (typeFilter === 'Dispatch Point' && loc.type !== 'dispatch_point') return false;
      if (typeFilter === 'Branch' && loc.type !== 'branch') return false;
      if (statusSort === 'Active only' && loc.deleted_at) return false;
      if (statusSort === 'Inactive only' && !loc.deleted_at) return false;
      if (q && !loc.name.toLowerCase().includes(q) && !loc.address?.city?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allLocations, search, typeFilter, statusSort]);

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

  const addAction = isSellerAdmin ? (
    <Button type="button" onClick={openAdd} className="flex items-center gap-2">
      <Plus size={16} />
      Add location
    </Button>
  ) : null;

  const columnCount = isSellerAdmin ? 6 : 5;

  return (
    <>
      <SellerTopbar
        eyebrow="Settings"
        title="Locations"
        subtitle="Warehouses, dispatch points, and branches. Inventory is tracked per location where enabled."
        action={addAction}
      />

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
      ) : allLocations.length === 0 ? (
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
        <>
          <FilterBar
            count={`Showing ${locations.length} of ${allLocations.length} locations`}
            searchPlaceholder="Search locations…"
            chips={TYPE_CHIPS}
            activeChip={typeFilter}
            sortBy={statusSort}
            hideViewToggle
            searchValue={search}
            onSearchChange={setSearch}
            onChipChange={(chip) => setTypeFilter(chip as TypeChip)}
            sortOptions={STATUS_SORT}
            onSortChange={(option) => setStatusSort(option as StatusSort)}
          />
          <LandingTable
            columns={[
              { label: 'Name', width: 260, className: 'px-4' },
              { label: 'Type', className: 'px-4' },
              { label: 'City', className: 'px-4' },
              { label: 'Inventory', className: 'px-4' },
              { label: 'Status', className: 'px-4' },
              ...(isSellerAdmin ? [{ label: 'Actions', align: 'right' as const, className: 'px-4' }] : []),
            ]}
          >
            {locations.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-16 text-center text-base text-cream-500">
                  No locations match your filters.
                </td>
              </tr>
            ) : (
              <LocationsTableRows
                locations={locations}
                isAdmin={isSellerAdmin}
                isBusy={busy}
                onEdit={openEdit}
                onDeactivate={(loc) => setDeactivateTarget(loc)}
                onReactivate={(loc) => void handleReactivate(loc)}
              />
            )}
          </LandingTable>
        </>
      )}

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
            <div className="rounded-md border border-warning-500/30 bg-warning-50 px-4 py-3 text-base text-warning-800">
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
