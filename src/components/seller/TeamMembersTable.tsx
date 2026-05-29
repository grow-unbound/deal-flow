'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MailCheck, Pencil, UserPlus, UserX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DialogBody } from '@/components/ui/dialog';
import { DataTable } from './DataTable';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { InviteUserDialog } from './InviteUserDialog';
import { FilterBar } from '@/components/seller/layout';
import { supabaseBrowser } from '@/lib/supabase-browser';
import type { TeamMember } from '@/types/team';

interface Props {
  tenantId: string;
  isAdmin: boolean;
}

type TeamChip = 'All users' | 'Admin' | 'Assistant' | 'Active' | 'Invited' | 'Deactivated';
type TeamSort = 'Name (A → Z)' | 'Role' | 'Status';

const TEAM_CHIPS: TeamChip[] = ['All users', 'Admin', 'Assistant', 'Active', 'Invited', 'Deactivated'];
const TEAM_SORT_OPTIONS: TeamSort[] = ['Name (A → Z)', 'Role', 'Status'];

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabaseBrowser.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

export function TeamMembersTable({ tenantId, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [activeChip, setActiveChip] = useState<TeamChip>('All users');
  const [sortBy, setSortBy] = useState<TeamSort>('Name (A → Z)');
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [resendMember, setResendMember] = useState<TeamMember | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [deactivateMember, setDeactivateMember] = useState<TeamMember | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const { data: members = [], isLoading, isError } = useQuery({
    queryKey: ['team', tenantId],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/team/members', { headers });
      if (!res.ok) throw new Error('Failed to load team members');
      const data = await res.json();
      return data.members as TeamMember[];
    },
  });

  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const statusWeight: Record<'active' | 'pending' | 'inactive', number> = {
      active: 0,
      pending: 1,
      inactive: 2,
    };
    const roleWeight: Record<'seller_admin' | 'seller_assistant', number> = {
      seller_admin: 0,
      seller_assistant: 1,
    };

    return members
      .filter((member) => {
        const fullName = member.full_name?.toLowerCase() ?? '';
        const matchesQuery = !q
          || fullName.includes(q)
          || member.email.toLowerCase().includes(q)
          || (member.phone ?? '').toLowerCase().includes(q)
          || member.role.toLowerCase().includes(q)
          || member.status.toLowerCase().includes(q);
        const matchesChip =
          activeChip === 'All users'
          || (activeChip === 'Admin' && member.role === 'seller_admin')
          || (activeChip === 'Assistant' && member.role === 'seller_assistant')
          || (activeChip === 'Active' && member.status === 'active')
          || (activeChip === 'Invited' && member.status === 'pending')
          || (activeChip === 'Deactivated' && member.status === 'inactive');
        return matchesQuery && matchesChip;
      })
      .sort((a, b) => {
        if (sortBy === 'Name (A → Z)') {
          return (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email);
        }
        if (sortBy === 'Role') {
          const roleDiff = roleWeight[a.role] - roleWeight[b.role];
          if (roleDiff !== 0) return roleDiff;
          return (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email);
        }
        const statusDiff = statusWeight[a.status] - statusWeight[b.status];
        if (statusDiff !== 0) return statusDiff;
        return (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email);
      });
  }, [activeChip, members, query, sortBy]);

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const r = await fetch(`/api/team/members/${id}`, { method: 'DELETE', headers });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? body.details?.message ?? 'Failed to deactivate member');
    },
    onSuccess: () => {
      setDeactivateMember(null);
      setDeactivateError(null);
      queryClient.invalidateQueries({ queryKey: ['team'] });
    },
    onError: (error: Error) => {
      setDeactivateError(error.message);
    },
  });

  const resendMutation = useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const r = await fetch(`/api/team/members/${id}/resend-invite`, { method: 'PUT', headers });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? body.details?.message ?? 'Failed to resend invite');
    },
    onSuccess: () => {
      setResendMember(null);
      setResendError(null);
      queryClient.invalidateQueries({ queryKey: ['team'] });
    },
    onError: (error: Error) => {
      setResendError(error.message);
    },
  });

  if (isError) {
    return (
      <ErrorState
        heading="Couldn't load team members"
        description="There was a problem fetching your workspace users. Please try again."
      />
    );
  }

  if (!isLoading && members.length === 0) {
    return (
      <EmptyState
        icon={<UserPlus size={28} strokeWidth={1.5} />}
        heading="No team members yet"
        description="Invite your first teammate to start collaborating inside this tenant workspace."
      />
    );
  }

  return (
    <>
      <FilterBar
        count={`Showing ${filteredMembers.length} of ${members.length} users`}
        searchPlaceholder="Search name, email, phone…"
        chips={TEAM_CHIPS}
        activeChip={activeChip}
        sortBy={sortBy}
        hideViewToggle
        searchValue={query}
        onSearchChange={setQuery}
        onChipChange={(chip) => setActiveChip(chip as TeamChip)}
        sortOptions={TEAM_SORT_OPTIONS}
        onSortChange={(option) => setSortBy(option as TeamSort)}
      />
      <DataTable
        data={filteredMembers}
        loading={isLoading}
        loadingMessage="Loading team members..."
        className="-mt-px"
        columns={[
          {
            key: 'full_name',
            header: 'Full Name',
            accessor: (member) => member.full_name ?? <span className="text-cream-400">—</span>,
          },
          {
            key: 'email',
            header: 'Email',
            accessor: (member) => <span className="text-cream-700">{member.email}</span>,
          },
          {
            key: 'phone',
            header: 'Phone',
            accessor: (member) => <span className="text-cream-700">{member.phone ?? '—'}</span>,
          },
          {
            key: 'role',
            header: 'Role',
            accessor: (member) => <RoleChip role={member.role} />,
          },
          {
            key: 'status',
            header: 'Status',
            accessor: (member) =>
              member.status === 'pending' ? (
                <span className="inline-flex items-center rounded-sm bg-amber-100 px-2 py-0.5 text-caption font-medium text-amber-700">
                  Invited
                </span>
              ) : member.status === 'inactive' ? (
                <span className="inline-flex items-center rounded-sm bg-cream-200 px-2 py-0.5 text-caption font-medium text-cream-700">
                  Deactivated
                </span>
              ) : (
                <span className="inline-flex items-center rounded-sm bg-success-50 px-2 py-0.5 text-caption font-medium text-success-700">
                  Active
                </span>
              ),
          },
          ...(isAdmin
            ? [{
              key: 'actions',
              header: 'Actions',
              accessor: (member: TeamMember) => (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-cream-600 hover:text-cream-900"
                    onClick={() => setEditMember(member)}
                    title="Edit User"
                  >
                    <Pencil size={14} />
                  </Button>
                  {member.status === 'pending' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-cream-600 hover:text-teal-600"
                      onClick={() => {
                        setResendError(null);
                        setResendMember(member);
                      }}
                      disabled={resendMutation.isPending}
                      title="Resend invite"
                    >
                      <MailCheck size={14} />
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-cream-600 hover:text-danger-500"
                    onClick={() => {
                      setDeactivateError(null);
                      setDeactivateMember(member);
                    }}
                    disabled={removeMutation.isPending}
                    title="Deactivate user"
                  >
                    <UserX size={14} />
                  </Button>
                </div>
              ),
              }]
            : []),
        ]}
      />

      {editMember && (
        <InviteUserDialog
          open={!!editMember}
          onOpenChange={(v) => { if (!v) setEditMember(null); }}
          member={editMember}
        />
      )}

      <AlertDialog
        open={!!resendMember}
        onOpenChange={(open) => {
          if (!open) {
            setResendMember(null);
            setResendError(null);
          }
        }}
      >
        <AlertDialogContent className="bg-cream-50 border-cream-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-cream-900">
              Resend invite?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-cream-700">
              Confirm that you want to send the invite again to this user.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <DialogBody className="space-y-4">
            {resendError && (
              <Alert variant="danger">
                <AlertDescription>{resendError}</AlertDescription>
              </Alert>
            )}

            {resendMember && (
              <div className="space-y-2 rounded-md border border-cream-300 bg-white p-4 text-body-sm text-cream-800">
                <div>
                  <span className="text-cream-600">Name: </span>
                  {resendMember.full_name ?? '—'}
                </div>
                <div>
                  <span className="text-cream-600">Email: </span>
                  {resendMember.email}
                </div>
                <div>
                  <span className="text-cream-600">Phone: </span>
                  {resendMember.phone ? `+91 ${resendMember.phone}` : '—'}
                </div>
              </div>
            )}
          </DialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={resendMutation.isPending}
              onClick={() => {
                setResendMember(null);
                setResendError(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!resendMember || resendMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (resendMember) {
                  resendMutation.mutate(resendMember.id);
                }
              }}
            >
              <MailCheck size={16} />
              {resendMutation.isPending ? 'Sending…' : 'Resend invite'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deactivateMember}
        onOpenChange={(open) => {
          if (!open) {
            setDeactivateMember(null);
            setDeactivateError(null);
          }
        }}
      >
        <AlertDialogContent className="bg-cream-50 border-cream-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-cream-900">
              Deactivate user?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-cream-700">
              This will soft-delete the user by marking their membership inactive. They will no longer be able to sign in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <DialogBody className="space-y-4">
            {deactivateError && (
              <Alert variant="danger">
                <AlertDescription>{deactivateError}</AlertDescription>
              </Alert>
            )}

            {deactivateMember && (
              <div className="space-y-2 rounded-md border border-warning-500/30 bg-warning-50 p-4 text-body-sm text-warning-700">
                <div>
                  <span className="text-warning-700/80">Name: </span>
                  {deactivateMember.full_name ?? '—'}
                </div>
                <div>
                  <span className="text-warning-700/80">Email: </span>
                  {deactivateMember.email}
                </div>
                <div>
                  <span className="text-warning-700/80">Phone: </span>
                  {deactivateMember.phone ? `+91 ${deactivateMember.phone}` : '—'}
                </div>
              </div>
            )}
          </DialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={removeMutation.isPending}
              onClick={() => {
                setDeactivateMember(null);
                setDeactivateError(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!deactivateMember || removeMutation.isPending}
              className="bg-danger-500 text-cream-50 hover:bg-danger-600"
              onClick={(event) => {
                event.preventDefault();
                if (deactivateMember) {
                  removeMutation.mutate(deactivateMember.id);
                }
              }}
            >
              <UserX size={16} />
              {removeMutation.isPending ? 'Deactivating…' : 'Deactivate user'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RoleChip({ role }: { role: 'seller_admin' | 'seller_assistant' }) {
  if (role === 'seller_admin') {
    return (
      <Badge className="bg-teal-100 text-teal-700 hover:bg-teal-100 rounded-sm text-caption font-medium border-0">
        Admin
      </Badge>
    );
  }
  return (
    <Badge className="bg-cream-200 text-cream-700 hover:bg-cream-200 rounded-sm text-caption font-medium border-0">
      Assistant
    </Badge>
  );
}
