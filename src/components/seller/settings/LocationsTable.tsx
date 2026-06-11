'use client';

import { Check, MapPin, Pencil, RotateCcw, UserX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
    <div className="overflow-hidden rounded-lg border border-cream-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-cream-50 hover:bg-cream-50">
            <TableHead className="w-[38%] pl-5 text-caption font-semibold uppercase tracking-wide text-cream-600">
              Name
            </TableHead>
            <TableHead className="text-caption font-semibold uppercase tracking-wide text-cream-600">Type</TableHead>
            <TableHead className="text-caption font-semibold uppercase tracking-wide text-cream-600">City</TableHead>
            <TableHead className="text-caption font-semibold uppercase tracking-wide text-cream-600">Inventory</TableHead>
            <TableHead className="text-caption font-semibold uppercase tracking-wide text-cream-600">Status</TableHead>
            {isAdmin ? <TableHead className="w-[120px] pr-5 text-right">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {locations.map((loc) => {
            const inactive = Boolean(loc.deleted_at);
            const line1 = loc.address?.line1?.trim() ?? '';
            return (
              <TableRow
                key={loc.id}
                className={cn(inactive && 'bg-cream-50/80 text-cream-600')}
              >
                <TableCell className="pl-5 align-top">
                  <div className="flex gap-3">
                    <div
                      className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        loc.type === 'warehouse' ? 'bg-teal-50 text-teal-600' : 'bg-cream-100 text-cream-600',
                      )}
                    >
                      <LocationTypeIcon type={loc.type} className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-cream-900">{loc.name}</span>
                        {loc.is_default && !inactive ? (
                          <span className="rounded-full border border-ember-200 bg-ember-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ember-800">
                            Default
                          </span>
                        ) : null}
                      </div>
                      {line1 ? (
                        <p className="mt-0.5 truncate text-body-sm text-cream-600">{line1}</p>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <LocationTypeBadge type={loc.type} />
                </TableCell>
                <TableCell className="align-top text-body-sm text-cream-700">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-cream-500" aria-hidden />
                    {[loc.address?.city, loc.address?.state].filter(Boolean).join(', ') || '—'}
                  </span>
                </TableCell>
                <TableCell className="align-top text-body-sm">
                  {loc.inventory_tracking ? (
                    <span className="inline-flex items-center gap-1 text-success-700">
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                      Tracked
                    </span>
                  ) : (
                    <span className="text-cream-500">Not tracked</span>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  {inactive ? (
                    <span className="rounded-sm bg-cream-200 px-2 py-0.5 text-caption font-medium text-cream-700">
                      Inactive
                    </span>
                  ) : (
                    <span className="rounded-sm bg-success-50 px-2 py-0.5 text-caption font-medium text-success-800">
                      Active
                    </span>
                  )}
                </TableCell>
                {isAdmin ? (
                  <TableCell className="pr-5 text-right align-top">
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
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
