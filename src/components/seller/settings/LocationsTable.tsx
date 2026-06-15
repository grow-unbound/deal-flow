'use client';

import { Check, MapPin, Pencil, RotateCcw, UserX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TenantLocation } from '@/types/tenant-locations';

import { LocationTypeBadge, LocationTypeIcon } from './LocationTypeBadge';

interface LocationsTableProps {
  locations: TenantLocation[];
  isAdmin: boolean;
  isBusy: boolean;
  onEdit: (loc: TenantLocation) => void;
  onDeactivate: (loc: TenantLocation) => void;
  onReactivate: (loc: TenantLocation) => void;
}

export function LocationsTable({
  locations,
  isAdmin,
  isBusy,
  onEdit,
  onDeactivate,
  onReactivate,
}: LocationsTableProps) {
  return (
    <div className="overflow-x-auto rounded-[14px] border border-cream-300 bg-white shadow-xs">
      <table className="min-w-max border-collapse text-base text-cream-900">
        <thead>
          <tr className="border-b border-cream-400 bg-cream-50">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-cream-700 whitespace-nowrap">
              Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-cream-700 whitespace-nowrap">Type</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-cream-700 whitespace-nowrap">City</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-cream-700 whitespace-nowrap">Inventory</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-cream-700 whitespace-nowrap">Status</th>
            {isAdmin ? (
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-cream-700 whitespace-nowrap">
                Actions
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {locations.map((loc, i) => {
            const inactive = Boolean(loc.deleted_at);
            const line1 = loc.address?.line1?.trim() ?? '';
            return (
              <tr
                key={loc.id}
                className={cn(
                  'border-b border-cream-300 transition-colors duration-fast hover:bg-cream-50',
                  i === locations.length - 1 && 'border-b-0',
                  inactive && 'bg-cream-50/80 text-cream-600',
                )}
              >
                <td className="px-4 py-[13px] align-top">
                  <div className="flex gap-3">
                    <div
                      className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        loc.type === 'warehouse' ? 'bg-teal-50 text-teal-600' : 'bg-cream-100 text-cream-600',
                      )}
                    >
                      <LocationTypeIcon type={loc.type} className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 max-w-[220px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-cream-900">{loc.name}</span>
                        {loc.is_default && !inactive ? (
                          <span className="rounded-full border border-ember-200 bg-ember-50 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-ember-800">
                            Default
                          </span>
                        ) : null}
                      </div>
                      {line1 ? (
                        <p className="mt-0.5 truncate text-body-sm text-cream-600">{line1}</p>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-[13px] align-top">
                  <LocationTypeBadge type={loc.type} />
                </td>
                <td className="px-4 py-[13px] align-top text-body-sm text-cream-700 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-cream-500" aria-hidden />
                    {[loc.address?.city, loc.address?.state].filter(Boolean).join(', ') || '—'}
                  </span>
                </td>
                <td className="px-4 py-[13px] align-top text-body-sm whitespace-nowrap">
                  {loc.inventory_tracking ? (
                    <span className="inline-flex items-center gap-1 text-success-700">
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                      Tracked
                    </span>
                  ) : (
                    <span className="text-cream-500">Not tracked</span>
                  )}
                </td>
                <td className="px-4 py-[13px] align-top whitespace-nowrap">
                  {inactive ? (
                    <span className="rounded-sm bg-cream-200 px-2 py-0.5 text-caption font-medium text-cream-700">
                      Inactive
                    </span>
                  ) : (
                    <span className="rounded-sm bg-success-50 px-2 py-0.5 text-caption font-medium text-success-800">
                      Active
                    </span>
                  )}
                </td>
                {isAdmin ? (
                  <td className="px-4 py-[13px] text-right align-top">
                    <div className="flex justify-end gap-1">
                      {inactive ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-cream-700 hover:text-teal-700"
                          disabled={isBusy}
                          onClick={() => onReactivate(loc)}
                          title="Reactivate location"
                        >
                          <RotateCcw className="h-4 w-4" />
                          <span className="sr-only">Reactivate</span>
                        </Button>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-cream-600 hover:text-cream-900"
                            disabled={isBusy}
                            onClick={() => onEdit(loc)}
                            title="Edit location"
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-cream-600 hover:text-danger-500"
                            disabled={isBusy}
                            onClick={() => onDeactivate(loc)}
                            title="Deactivate location"
                          >
                            <UserX className="h-4 w-4" />
                            <span className="sr-only">Deactivate</span>
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
