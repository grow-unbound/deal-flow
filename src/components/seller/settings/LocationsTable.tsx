'use client';

import { Building2, MapPin, Pencil, RotateCcw, UserX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TenantLocation } from '@/types/tenant-locations';

interface LocationsTableRowsProps {
  locations: TenantLocation[];
  isAdmin: boolean;
  isBusy: boolean;
  onEdit: (loc: TenantLocation) => void;
  onDeactivate: (loc: TenantLocation) => void;
  onReactivate: (loc: TenantLocation) => void;
}

/** Table body rows for use inside {@link LandingTable} (FilterBar + LandingTable pattern). */
export function LocationsTableRows({
  locations,
  isAdmin,
  isBusy,
  onEdit,
  onDeactivate,
  onReactivate,
}: LocationsTableRowsProps) {
  return (
    <>
      {locations.map((loc, i) => {
        const inactive = Boolean(loc.deleted_at);
        const line1 = loc.address?.line1?.trim() ?? '';
        return (
          <tr
            key={loc.id}
            className={cn(
              'border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50',
              i === locations.length - 1 && 'border-b-0',
              inactive && 'bg-cream-50/80 text-cream-600',
            )}
          >
            <td className="px-4 py-3.5 align-top">
              <div className="flex gap-3">
                <div
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cream-100 text-cream-600"
                >
                  <Building2 className="h-4 w-4" />
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
                    <p className="mt-0.5 truncate text-base text-cream-600">{line1}</p>
                  ) : null}
                </div>
              </div>
            </td>
            <td className="px-4 py-3.5 align-top text-base text-cream-700 whitespace-nowrap">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-cream-500" aria-hidden />
                {[loc.address?.city, loc.address?.state].filter(Boolean).join(', ') || '—'}
              </span>
            </td>
            <td className="px-4 py-3.5 align-top whitespace-nowrap">
              {inactive ? (
                <span className="rounded-sm bg-cream-200 px-2 py-0.5 text-sm font-medium text-cream-700">
                  Inactive
                </span>
              ) : (
                <span className="rounded-sm bg-success-50 px-2 py-0.5 text-sm font-medium text-success-800">
                  Active
                </span>
              )}
            </td>
            {isAdmin ? (
              <td className="px-4 py-3.5 text-right align-top">
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
    </>
  );
}
