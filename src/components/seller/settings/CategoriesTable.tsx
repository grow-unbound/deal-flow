'use client';

import { ArrowUpDown, Pencil, RotateCcw, Tag, UserX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { TenantCategory } from '@/types/tenant-categories';

interface CategoriesTableProps {
  categories: TenantCategory[];
  isAdmin: boolean;
  isBusy: boolean;
  onEdit: (cat: TenantCategory) => void;
  onDeactivate: (cat: TenantCategory) => void;
  onReactivate: (cat: TenantCategory) => void;
}

export function CategoriesTable({
  categories,
  isAdmin,
  isBusy,
  onEdit,
  onDeactivate,
  onReactivate,
}: CategoriesTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-cream-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-cream-50 hover:bg-cream-50">
            <TableHead className="w-[40%] pl-5 text-caption font-semibold uppercase tracking-wide text-cream-600">
              Name
            </TableHead>
            <TableHead className="text-caption font-semibold uppercase tracking-wide text-cream-600">
              <span className="inline-flex items-center gap-1">
                <ArrowUpDown className="h-3 w-3" aria-hidden />
                Order
              </span>
            </TableHead>
            <TableHead className="text-caption font-semibold uppercase tracking-wide text-cream-600">Status</TableHead>
            {isAdmin ? <TableHead className="w-[120px] pr-5 text-right">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((cat) => {
            const inactive = Boolean(cat.deleted_at);
            const thumbUrl = cat.r2_image_thumb_key
              ? `/api/r2/image/${encodeURIComponent(cat.r2_image_thumb_key)}`
              : null;

            return (
              <TableRow key={cat.id} className={cn(inactive && 'bg-cream-50/80 text-cream-600')}>
                <TableCell className="pl-5 align-middle">
                  <div className="flex items-center gap-3">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-cream-200"
                      />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cream-100 text-cream-500">
                        <Tag className="h-4 w-4" aria-hidden />
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="font-medium text-cream-900">{cat.name}</span>
                      <p className="mt-0.5 truncate font-mono text-body-sm text-cream-500">{cat.slug}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="align-middle text-body-sm text-cream-700">
                  <span className="font-mono text-sm">{cat.display_order}</span>
                </TableCell>
                <TableCell className="align-middle">
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
                  <TableCell className="pr-5 text-right align-middle">
                    <div className="flex justify-end gap-1">
                      {inactive ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-cream-700 hover:text-teal-700"
                          disabled={isBusy}
                          onClick={() => onReactivate(cat)}
                          title="Reactivate category"
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
                            onClick={() => onEdit(cat)}
                            title="Edit category"
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
                            onClick={() => onDeactivate(cat)}
                            title="Deactivate category"
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
