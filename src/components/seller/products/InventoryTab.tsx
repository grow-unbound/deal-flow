'use client';

import { useState } from 'react';
import { MapPin, Plus, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useLocations,
  useInventoryByProduct,
  useUpsertInventory,
  useCreateLocation,
  computeSellable,
  isLowStock,
  type Location,
  type InventoryRow,
} from '@/hooks/useInventory';
import { useRole } from '@/hooks/useRole';
import { cn } from '@/lib/utils';

interface LocationRowProps {
  location: Location;
  inventoryRow: InventoryRow | undefined;
  productId: string;
}

function LocationRow({ location, inventoryRow, productId }: LocationRowProps) {
  const [qtyAvailable, setQtyAvailable] = useState<number>(inventoryRow?.qty_available ?? 0);
  const [qtyReserved, setQtyReserved] = useState<number>(inventoryRow?.qty_reserved ?? 0);
  const [reorderPoint, setReorderPoint] = useState<number | ''>(inventoryRow?.reorder_point ?? '');
  const upsert = useUpsertInventory();

  const sellable = computeSellable({ qty_available: qtyAvailable, qty_reserved: qtyReserved });
  const lowStock = isLowStock({
    qty_available: qtyAvailable,
    qty_reserved: qtyReserved,
    reorder_point: reorderPoint === '' ? null : reorderPoint,
  });

  const handleSave = async () => {
    try {
      await upsert.mutateAsync({
        tenant_product_id: productId,
        location_id: location.id,
        qty_available: qtyAvailable,
        qty_reserved: qtyReserved,
        reorder_point: reorderPoint === '' ? null : reorderPoint,
      });
      toast.success(`Inventory updated for ${location.name}`);
    } catch {
      toast.error('Failed to update inventory');
    }
  };

  return (
    <div className="bg-cream-100 rounded-md border border-cream-200 p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-cream-500 shrink-0" />
          <span className="font-sans text-cream-900 text-sm font-medium">{location.name}</span>
          {location.is_default && (
            <span className="inline-flex items-center rounded-full bg-teal-50 text-teal-700 px-2 py-0.5 text-xs font-medium">
              Default
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-cream-600">Sellable:</span>
          <span
            className={cn(
              'font-mono font-semibold text-sm',
              lowStock ? 'text-danger-600' : 'text-teal-600',
            )}
          >
            {sellable}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 items-end">
        <div>
          <Label className="text-xs text-cream-600 mb-1 block">Available</Label>
          <Input
            type="number"
            min={0}
            className="font-mono text-sm w-full"
            value={qtyAvailable}
            onChange={(e) => setQtyAvailable(Number(e.target.value))}
          />
        </div>
        <div>
          <Label className="text-xs text-cream-600 mb-1 block">Reserved</Label>
          <Input
            type="number"
            min={0}
            className="font-mono text-sm w-full"
            value={qtyReserved}
            onChange={(e) => setQtyReserved(Number(e.target.value))}
          />
        </div>
        <div>
          <Label className="text-xs text-cream-600 mb-1 block">Reorder point</Label>
          <Input
            type="number"
            min={0}
            className="font-mono text-sm w-full"
            placeholder="—"
            value={reorderPoint}
            onChange={(e) => setReorderPoint(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            className="bg-teal-500 text-cream-50 gap-1.5"
            onClick={handleSave}
            disabled={upsert.isPending}
          >
            <Save size={13} />
            {upsert.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface AddLocationFormProps {
  onCancel: () => void;
}

function AddLocationForm({ onCancel }: AddLocationFormProps) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const createLocation = useCreateLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      await createLocation.mutateAsync({
        name: name.trim(),
        address:
          city || state
            ? { city: city.trim() || undefined, state: state.trim() || undefined }
            : undefined,
      });
      toast.success(`Location "${name.trim()}" created`);
      onCancel();
    } catch {
      toast.error('Failed to create location');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-cream-100 rounded-md border border-cream-200 p-4 mb-3"
    >
      <p className="text-sm font-medium text-cream-900 mb-3">New location</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-4">
        <div>
          <Label className="text-xs text-cream-600 mb-1 block">
            Name <span className="text-danger-600">*</span>
          </Label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Main Warehouse"
            className="text-sm"
            required
            autoFocus
          />
        </div>
        <div>
          <Label className="text-xs text-cream-600 mb-1 block">City</Label>
          <Input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Mumbai"
            className="text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-cream-600 mb-1 block">State</Label>
          <Input
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="e.g. Maharashtra"
            className="text-sm"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="gap-1.5"
        >
          <X size={13} />
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          className="bg-teal-500 text-cream-50 gap-1.5"
          disabled={createLocation.isPending || !name.trim()}
        >
          <Plus size={13} />
          {createLocation.isPending ? 'Creating…' : 'Add location'}
        </Button>
      </div>
    </form>
  );
}

interface InventoryTabProps {
  productId: string;
}

export function InventoryTab({ productId }: InventoryTabProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const { isSellerAdmin } = useRole();
  const { data: locationsData, isLoading: locationsLoading } = useLocations();
  const { data: inventoryData, isLoading: inventoryLoading } = useInventoryByProduct(productId);

  const locations = locationsData?.locations ?? [];
  const inventory = inventoryData?.inventory ?? [];

  const isLoading = locationsLoading || inventoryLoading;

  // Build a map from location_id → inventory row
  const inventoryByLocation = Object.fromEntries(
    inventory.map((row) => [row.location_id, row]),
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 bg-cream-200 animate-pulse rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Add location button — seller_admin only */}
      {isSellerAdmin && !showAddForm && (
        <div className="mb-4">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowAddForm(true)}
          >
            <MapPin size={14} />
            Add location
          </Button>
        </div>
      )}

      {/* Inline add form */}
      {showAddForm && <AddLocationForm onCancel={() => setShowAddForm(false)} />}

      {/* Empty state */}
      {locations.length === 0 && !showAddForm && (
        <div className="flex flex-col items-center justify-center min-h-[28vh] text-center px-6">
          <span className="w-14 h-14 rounded-full bg-cream-200 flex items-center justify-center mb-4">
            <MapPin size={24} className="text-cream-500" />
          </span>
          <p className="font-display text-lg text-cream-900 mb-1">No warehouse locations yet</p>
          <p className="text-cream-600 text-sm max-w-sm">
            {isSellerAdmin
              ? 'Add your first location to start tracking inventory.'
              : 'No warehouse locations have been configured for this tenant.'}
          </p>
          {isSellerAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 mt-4"
              onClick={() => setShowAddForm(true)}
            >
              <MapPin size={14} />
              Add location
            </Button>
          )}
        </div>
      )}

      {/* Location rows */}
      {locations.map((location) => (
        <LocationRow
          key={location.id}
          location={location}
          inventoryRow={inventoryByLocation[location.id]}
          productId={productId}
        />
      ))}
    </div>
  );
}
