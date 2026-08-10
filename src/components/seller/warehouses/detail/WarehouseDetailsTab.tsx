'use client';

import type { WarehouseDetailResponse } from '@/types/tenant-warehouses';
import { formatDate } from '@/lib/utils';

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-600">{label}</p>
      <p className={mono ? 'font-mono text-base text-cream-900' : 'text-base text-cream-900'}>{value}</p>
    </div>
  );
}

function formatWarehouseAddress(address: WarehouseDetailResponse['address']) {
  return [address.line1, address.line2, [address.city, address.state].filter(Boolean).join(' '), address.pincode]
    .filter((part) => part && part.trim().length > 0)
    .join(', ');
}

export function WarehouseDetailsTab({ data }: { data: WarehouseDetailResponse }) {
  const mappedUsers = data.linked_location?.associated_users.length
    ? data.linked_location.associated_users
    : data.associated_users;
  const mappedLocationName = data.linked_location?.name ?? 'this warehouse';

  return (
    <section className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
      <article className="rounded-[14px] border border-cream-300 bg-white p-5">
        <h3 className="font-display text-md text-cream-950">Warehouse details</h3>
        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4">
          <Row label="Warehouse name" value={data.name} />
          <Row label="Linked location" value={data.linked_location?.name ?? '—'} />
          <Row label="Status" value={data.status === 'active' ? 'Active' : 'Inactive'} />
          <Row label="Default warehouse" value={data.is_default ? 'Yes' : 'No'} />
          <Row label="Phone" value={data.phone_number ?? '—'} mono />
          <Row label="External reference" value={data.external_ref ?? '—'} mono />
          <div className="col-span-2">
            <Row label="Address" value={formatWarehouseAddress(data.address) || '—'} />
          </div>
          <Row label="Coordinates" value={data.lat != null && data.lng != null ? `${data.lat}, ${data.lng}` : '—'} mono />
          <Row label="Associated users" value={`${mappedUsers.length}`} />
        </div>
      </article>

      <article className="rounded-[14px] border border-cream-300 bg-white p-5">
        <h3 className="font-display text-md text-cream-950">Audit</h3>
        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4">
          <Row label="Created" value={formatDate(data.created_at)} mono />
          <Row label="Updated" value={formatDate(data.updated_at)} mono />
          <Row label="Mapped location" value={mappedLocationName} />
        </div>
      </article>

      <article className="rounded-[14px] border border-cream-300 bg-white p-5 xl:col-span-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-md text-cream-950">Associated users</h3>
            <p className="mt-1 text-sm text-cream-600">Users associated with {mappedLocationName}.</p>
          </div>
          <p className="text-sm text-cream-600">{mappedUsers.length} users</p>
        </div>
        {mappedUsers.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {mappedUsers.map((user) => (
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
          <p className="mt-4 text-sm text-cream-600">No mapped users for this location.</p>
        )}
      </article>
    </section>
  );
}
