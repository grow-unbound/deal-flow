'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailCheck, Pencil, Plus, Trash2, UserRound, UserRoundX } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { apiDelete, apiFetch, apiPost } from '@/lib/api-fetch';
import { LandingTable, StatusTag } from '@/components/seller/layout';
import { BuyerUserDialog, type BuyerUserRow } from './BuyerUserDialog';

interface BuyerUsersSectionProps {
  buyerId: string;
  users: BuyerUserRow[];
}

function StatusPill({ status }: { status: BuyerUserRow['status'] }) {
  if (status === 'Active') {
    return <StatusTag label="Active" tone="success" className="text-caption" />;
  }
  if (status === 'Pending invite') {
    return <StatusTag label="Pending invite" tone="warning" className="text-caption" />;
  }
  return <StatusTag label="Inactive" tone="neutral" className="text-caption" />;
}

export function BuyerUsersSection({ buyerId, users }: BuyerUsersSectionProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<BuyerUserRow | null>(null);
  const [deleteUser, setDeleteUser] = useState<BuyerUserRow | null>(null);

  const { data: liveUsers = [], isLoading, isError } = useQuery({
    queryKey: ['customer-buyer-users', buyerId],
    queryFn: async () => {
      const res = await apiFetch(`/api/customers/${buyerId}/users`);
      if (!res.ok) {
        throw new Error('Failed to load buyer users');
      }
      const body = (await res.json()) as { users?: BuyerUserRow[] };
      return body.users ?? [];
    },
    initialData: users,
  });

  const inviteMutation = useMutation({
    mutationFn: async (user: BuyerUserRow) => {
      const res = await apiPost(`/api/customers/${buyerId}/users/${user.id}/invite`, {});
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        throw new Error(body.error ?? 'Failed to send invite');
      }
      return body;
    },
    onSuccess: (_data, user) => {
      toast.success(user.status === 'Pending invite' ? 'Invite sent' : 'Invite resent');
      queryClient.invalidateQueries({ queryKey: ['tenant-customer-detail', buyerId] });
      queryClient.invalidateQueries({ queryKey: ['customer-buyer-users', buyerId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to send invite');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (user: BuyerUserRow) => {
      const res = await apiDelete(`/api/customers/${buyerId}/users/${user.id}`);
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? 'Failed to delete buyer user');
      }
    },
    onSuccess: () => {
      toast.success('Buyer user deleted');
      setDeleteUser(null);
      queryClient.invalidateQueries({ queryKey: ['tenant-customer-detail', buyerId] });
      queryClient.invalidateQueries({ queryKey: ['customer-buyer-users', buyerId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete buyer user');
    },
  });

  const emptyState = useMemo(
    () => (
      <EmptyState
        icon={<UserRound size={28} strokeWidth={1.5} />}
        heading="No buyer users yet"
        description="Add the first buyer contact so this account has a visible user list."
      />
    ),
    [],
  );

  if (isError) {
    return (
      <ErrorState
        heading="Couldn't load buyer users"
        description="There was a problem fetching buyer users for this customer."
      />
    );
  }

  return (
    <>
      <article className="rounded-[14px] border border-cream-300 bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-lg text-cream-950">Buyer users</h3>
            <p className="mt-1 text-sm text-cream-700">Manage the contacts linked to this buyer account.</p>
          </div>
          <Button type="button" size="sm" onClick={() => { setEditUser(null); setDialogOpen(true); }}>
            <Plus size={16} />
            Add User
          </Button>
        </div>

        <div className="mt-4">
          <LandingTable
            columns={[
              { label: 'Full name', className: 'px-4' },
              { label: 'Phone', className: 'px-4' },
              { label: 'Email', className: 'px-4' },
              { label: 'Designation', className: 'px-4' },
              { label: 'Status', className: 'px-4' },
              { label: 'Actions', align: 'right', className: 'px-4' },
            ]}
            showEmptyState={!isLoading && liveUsers.length === 0}
            emptyState={emptyState}
            tableMinWidth={1200}
          >
            {liveUsers.map((user) => (
              <tr key={user.id} className="border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50">
                <td className="px-3 py-2 text-base text-cream-900">{user.first_name || '—'} {user.last_name || '—'}</td>
                <td className="px-3 py-2 font-mono text-base text-cream-700">{user.phone ?? '—'}</td>
                <td className="px-3 py-2 text-base text-cream-700">{user.email ?? '—'}</td>
                <td className="px-3 py-2 text-base text-cream-700">{user.designation ?? '—'}</td>
                <td className="px-3 py-2">
                  <StatusPill status={user.is_active ? 'Active' : 'Inactive'} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => { setEditUser(user); setDialogOpen(true); }}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      disabled={!user.email || inviteMutation.isPending}
                      onClick={() => inviteMutation.mutate(user)}
                    >
                      <MailCheck size={14} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-danger-600 hover:text-danger-700"
                      disabled={deleteMutation.isPending}
                      onClick={() => setDeleteUser(user)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </LandingTable>
        </div>
      </article>

      <BuyerUserDialog
        buyerId={buyerId}
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) {
            setEditUser(null);
          }
        }}
        user={editUser}
      />

      <AlertDialog
        open={Boolean(deleteUser)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteUser(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete buyer user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete the contact and mark them inactive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 rounded-[12px] border border-cream-200 bg-cream-50 p-4 text-sm text-cream-800">
            <div><span className="text-cream-600">Name: </span>{deleteUser?.full_name ?? '—'}</div>
            <div><span className="text-cream-600">Phone: </span>{deleteUser?.phone ?? '—'}</div>
            <div><span className="text-cream-600">Email: </span>{deleteUser?.email ?? '—'}</div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteUser || deleteMutation.isPending}
              onClick={() => {
                if (deleteUser) {
                  deleteMutation.mutate(deleteUser);
                }
              }}
            >
              <UserRoundX size={16} />
              {deleteMutation.isPending ? 'Deleting…' : 'Delete buyer user'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
