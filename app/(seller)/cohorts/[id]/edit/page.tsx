'use client';

import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Trash2, MoreVertical } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { CohortForm } from '@/components/seller/cohorts/CohortForm';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { ROLES } from '@/constants';
import type { CohortRules } from '@/lib/zod';

interface Cohort {
  id: string;
  name: string;
  description: string | null;
  is_static: boolean;
  rules: CohortRules | null;
  cached_member_count: number | null;
}

async function fetchCohort(id: string): Promise<Cohort> {
  const { data: { session } } = await supabaseBrowser.auth.getSession();
  const headers: Record<string, string> = {};
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
  const res = await fetch(`/api/cohorts/${id}`, { headers });
  if (!res.ok) throw new Error('Cohort not found');
  const body = await res.json();
  return body.cohort as Cohort;
}

export default function EditCohortPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: cohort, isLoading } = useQuery({
    queryKey: ['cohort', id],
    queryFn: () => fetchCohort(id),
  });

  async function handleDelete() {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      const res = await fetch(`/api/cohorts/${id}`, { method: 'DELETE', headers });
      const body = await res.json();
      if (!res.ok) {
        setDeleteError(body.error ?? 'Failed to delete cohort');
        return;
      }
      setDeleteDialogOpen(false);
      router.push('/cohorts');
    } catch {
      setDeleteError('Network error. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  }

  const kebabMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="p-2">
          <MoreVertical size={16} className="text-cream-600" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-cream-50 border-cream-200">
        <DropdownMenuItem
          onClick={() => {
            setDeleteError(null);
            setDeleteDialogOpen(true);
          }}
          className="text-danger-600 hover:bg-danger-50 cursor-pointer flex items-center gap-2"
        >
          <Trash2 size={14} />
          Delete cohort
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <div className="px-8 py-6">
        <SellerTopbar
          title={isLoading ? 'Edit Cohort' : `Edit: ${cohort?.name ?? ''}`}
          action={kebabMenu}
        />
        <FeatureGate flag="COHORTS">
          <RoleGuard roles={[ROLES.SELLER_ADMIN]}>
            <div>
              {isLoading && (
                <p className="text-cream-600 text-center py-12">Loading cohort…</p>
              )}
              {!isLoading && cohort && (
                <CohortForm
                  mode="edit"
                  cohortId={id}
                  defaultValues={{
                    name: cohort.name,
                    description: cohort.description ?? '',
                    is_static: cohort.is_static,
                    rules: cohort.rules ?? undefined,
                  }}
                />
              )}
            </div>
          </RoleGuard>
        </FeatureGate>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-cream-50 border-cream-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-cream-900 font-display">
              Delete cohort?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="text-cream-700 mb-3">
                  This will remove <strong>{cohort?.name}</strong> from your workspace. This action cannot be undone.
                </p>
                {deleteError && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-3 text-sm">
                    {deleteError}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => { setDeleteDialogOpen(false); setDeleteError(null); }}
              className="bg-cream-100 border-cream-300 text-cream-800 hover:bg-cream-200"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting || !!deleteError}
              className="bg-danger-500 hover:bg-danger-600 text-white"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
