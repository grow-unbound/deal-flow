'use client';

import type { WarehouseDetailResponse } from '@/types/tenant-warehouses';
import { formatDate } from '@/lib/utils';

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">{label}</p>
      <p className={mono ? 'font-mono text-base text-cream-900' : 'text-base text-cream-900'}>{value}</p>
    </div>
  );
}

export function WarehouseDetailsTab({ data }: { data: WarehouseDetailResponse }) {
  return (
    <section className="mt-5 space-y-4">
      <article className="rounded-[14px] border border-cream-300 bg-white p-5">
        <h3 className="font-display text-md text-cream-950">Warehouse details</h3>
        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4">
          <Row label="Warehouse name" value={data.name} />
          <Row label="Linked location" value={data.linked_location?.name ?? '—'} />
          <Row label="Status" value={data.status === 'active' ? 'Active' : 'Inactive'} />
          <Row label="Default warehouse" value={data.is_default ? 'Yes' : 'No'} />
          <Row label="Phone" value={data.phone_number ?? '—'} mono />
          <Row label="External reference" value={data.external_ref ?? '—'} mono />
          <Row label="Coordinates" value={data.lat != null && data.lng != null ? `${data.lat}, ${data.lng}` : '—'} mono />
          <Row label="Associated users" value={`${data.details.associated_users_count}`} />
        </div>
      </article>

      <div className="grid grid-cols-2 gap-4">
        <article className="rounded-[14px] border border-cream-300 bg-white p-5">
          <h3 className="font-display text-md text-cream-950">Address</h3>
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4">
            <Row label="Line 1" value={data.address.line1 || '—'} />
            <Row label="Line 2" value={data.address.line2 || '—'} />
            <Row label="City" value={data.address.city || '—'} />
            <Row label="State" value={data.address.state || '—'} />
            <Row label="PIN code" value={data.address.pincode || '—'} mono />
          </div>
        </article>

        <article className="rounded-[14px] border border-cream-300 bg-white p-5">
          <h3 className="font-display text-md text-cream-950">Audit</h3>
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4">
            <Row label="Created" value={formatDate(data.created_at)} mono />
            <Row label="Updated" value={formatDate(data.updated_at)} mono />
            <Row label="Last inventory update" value={data.details.last_inventory_update ? formatDate(data.details.last_inventory_update) : '—'} mono />
          </div>
        </article>
      </div>

      <article className="rounded-[14px] border border-cream-300 bg-white p-5">
        <h3 className="font-display text-md text-cream-950">Associated users</h3>
        {data.associated_users.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {data.associated_users.map((user) => (
              <span
                key={`${user.user_id ?? user.email}`}
                className="inline-flex items-center rounded-full border border-cream-200 bg-cream-50 px-2.5 py-1 text-xs font-medium text-cream-800"
                title={user.email}
              >
                {user.user_name ?? user.email}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-cream-600">No associated users.</p>
        )}
      </article>
    </section>
  );
}
