'use client';

import { useState, type FormEvent } from 'react';
import { Plus, RefreshCw, Warehouse as WarehouseIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ErrorState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader, PageWrap } from '@/components/seller/layout';
import { useCreateWarehouse, useWarehouses } from '@/hooks/useInventory';
import { formatDate } from '@/lib/utils';

function WarehouseStats({
  total,
  active,
  defaultCount,
  linkedLocations,
}: {
  total: number;
  active: number;
  defaultCount: number;
  linkedLocations: number;
}) {
  const cards = [
    { label: 'Total warehouses', value: total },
    { label: 'Active', value: active },
    { label: 'Default', value: defaultCount },
    { label: 'Linked locations', value: linkedLocations },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-[14px] border border-cream-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-500">{card.label}</p>
          <p className="mt-2 font-display text-3xl font-bold tracking-[-0.02em] text-cream-900">{card.value}</p>
        </div>
      ))}
    </div>
  );
}

function WarehouseCreateForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [phone, setPhone] = useState('');
  const createWarehouse = useCreateWarehouse();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;

    await createWarehouse.mutateAsync({
      name: name.trim(),
      phone_number: phone.trim() || undefined,
      address:
        city.trim() || state.trim()
          ? { city: city.trim(), state: state.trim() }
          : undefined,
    });

    toast.success(`Warehouse "${name.trim()}" created`);
    setName('');
    setCity('');
    setState('');
    setPhone('');
    onCreated();
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-[14px] border border-cream-200 bg-white p-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="warehouse-name">Name</Label>
          <Input
            id="warehouse-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Main warehouse"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="warehouse-city">City</Label>
          <Input
            id="warehouse-city"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="Mumbai"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="warehouse-state">State</Label>
          <Input
            id="warehouse-state"
            value={state}
            onChange={(event) => setState(event.target.value)}
            placeholder="MH"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="warehouse-phone">Phone</Label>
          <Input
            id="warehouse-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="10 digit phone"
            inputMode="numeric"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} className="gap-1.5">
          <RefreshCw size={14} />
          Cancel
        </Button>
        <Button type="submit" disabled={createWarehouse.isPending || !name.trim()} className="gap-1.5">
          <Plus size={14} />
          {createWarehouse.isPending ? 'Creating…' : 'Add warehouse'}
        </Button>
      </div>
    </form>
  );
}

export function WarehousesLandingClient() {
  const [formOpen, setFormOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useWarehouses();
  const warehouses = data?.warehouses ?? [];

  const total = warehouses.length;
  const active = warehouses.filter((warehouse) => warehouse.status === 'active' && warehouse.deleted_at === null).length;
  const defaultCount = warehouses.filter((warehouse) => warehouse.is_default).length;
  const linkedLocations = warehouses.filter((warehouse) => warehouse.location_id != null).length;

  if (isLoading && warehouses.length === 0) {
    return (
      <PageWrap>
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="h-7 w-44 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-[34rem] animate-pulse rounded bg-cream-200" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
            ))}
          </div>
          <div className="h-28 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
            ))}
          </div>
        </div>
      </PageWrap>
    );
  }

  if (isError && warehouses.length === 0) {
    return (
      <PageWrap>
        <ErrorState
          heading="Couldn't load warehouses"
          description="There was a problem fetching your warehouses. Please try again."
          onRetry={() => refetch()}
        />
      </PageWrap>
    );
  }

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Inventory"
        title="Warehouses"
        subtitle="Manage stock locations, default fulfillment routing, and the warehouse records linked to your tenant."
        horizon="All time"
        primary="Add warehouse"
        onPrimaryClick={() => setFormOpen(true)}
      />

      <WarehouseStats
        total={total}
        active={active}
        defaultCount={defaultCount}
        linkedLocations={linkedLocations}
      />

      {formOpen ? (
        <div className="mt-4">
          <WarehouseCreateForm onCancel={() => setFormOpen(false)} onCreated={() => setFormOpen(false)} />
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {warehouses.length === 0 ? (
          <div className="flex min-h-[18rem] items-center justify-center rounded-[14px] border border-dashed border-cream-300 bg-cream-50 px-8 py-10 text-center">
            <div className="max-w-md">
              <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cream-200 text-cream-500">
                <WarehouseIcon size={22} />
              </span>
              <p className="font-display text-xl font-medium tracking-[-0.01em] text-cream-900">No warehouses yet</p>
              <p className="mt-2 text-sm leading-6 text-cream-700">
                Create a warehouse to start routing inventory and tracking stock at this level.
              </p>
              {!formOpen ? (
                <Button className="mt-6 gap-1.5" onClick={() => setFormOpen(true)}>
                  <Plus size={14} />
                  Add warehouse
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          warehouses.map((warehouse) => (
            <div key={warehouse.id} className="rounded-[14px] border border-cream-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-cream-200 bg-cream-100 text-cream-700">
                      <WarehouseIcon size={16} />
                    </span>
                    <h3 className="font-display text-lg font-semibold tracking-[-0.01em] text-cream-900">{warehouse.name}</h3>
                    {warehouse.is_default ? (
                      <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">Default</span>
                    ) : null}
                    <span
                      className={[
                        'rounded-full px-2.5 py-1 text-xs font-semibold',
                        warehouse.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-cream-100 text-cream-600',
                      ].join(' ')}
                    >
                      {warehouse.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="space-y-1 text-sm text-cream-700">
                    <p>
                      {[
                        warehouse.address.line1,
                        warehouse.address.line2,
                        warehouse.address.city,
                        warehouse.address.state,
                        warehouse.address.pincode,
                      ]
                        .filter(Boolean)
                        .join(', ') || 'No address set'}
                    </p>
                    <p>Phone: {warehouse.phone_number ?? '—'}</p>
                    <p>External ref: {warehouse.external_ref ?? '—'}</p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2 text-right text-sm text-cream-700">
                  <p>Linked location: {warehouse.location?.name ?? '—'}</p>
                  <p>Associated users: {warehouse.associated_users.length}</p>
                  <p>Updated {formatDate(warehouse.updated_at)}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </PageWrap>
  );
}
