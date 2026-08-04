'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MailCheck, Pencil, UserPlus, UserX } from 'lucide-react';
import { toast } from 'sonner';
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
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { InviteUserDialog } from './InviteUserDialog';
import { FilterBar, LandingTable, StatusTag } from '@/components/seller/layout';
import { apiFetch } from '@/lib/api-fetch';
import { cn } from '@/lib/utils';
import type { TeamMember } from '@/types/team';

interface Props {
  tenantId: string;
  isAdmin: boolean;
}

type TeamChip = 'All users' | 'Admin' | 'Assistant' | 'Active' | 'Invited' | 'Deactivated';
type TeamSort = 'Name (A → Z)' | 'Role' | 'Status';

const TEAM_CHIPS: TeamChip[] = ['All users', 'Admin', 'Assistant', 'Active', 'Invited', 'Deactivated'];
const TEAM_SORT_OPTIONS: TeamSort[] = ['Name (A → Z)', 'Role', 'Status'];

function formatLocationSummary(member: TeamMember) {
  if (member.role === 'seller_admin') {
    return 'All locations';
  }

  const visibleNames = member.locations.map((location) => location.name);
  if (visibleNames.length === 0) {
    return '—';
  }

  if (visibleNames.length <= 2) {
    return visibleNames.join(', ');
  }

  return `${visibleNames.slice(0, 2).join(', ')} +${visibleNames.length - 2} more`;
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
      const res = await apiFetch('/api/team/members');
      if (!res.ok) throw new Error('Failed to load team members');
      const data = (await res.json()) as { members?: TeamMember[] };
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
      const r = await apiFetch(`/api/team/members/${id}`, { method: 'DELETE' });
      const body = (await r.json().catch(() => ({}))) as { error?: string; details?: { message?: string } };
      if (!r.ok) throw new Error(body.error ?? body.details?.message ?? 'Failed to deactivate member');
    },
    onSuccess: () => {
      setDeactivateMember(null);
      setDeactivateError(null);
      toast.success('Member deactivated');
      queryClient.invalidateQueries({ queryKey: ['team'] });
    },
    onError: (error: Error) => {
      setDeactivateError(error.message);
      toast.error(error.message);
    },
  });

  const resendMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiFetch(`/api/team/members/${id}/resend-invite`, { method: 'PUT' });
      const body = (await r.json().catch(() => ({}))) as { error?: string; details?: { message?: string } };
      if (!r.ok) throw new Error(body.error ?? body.details?.message ?? 'Failed to resend invite');
    },
    onSuccess: () => {
      setResendMember(null);
      setResendError(null);
      toast.success('Invite resent');
      queryClient.invalidateQueries({ queryKey: ['team'] });
    },
    onError: (error: Error) => {
      setResendError(error.message);
      toast.error(error.message);
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

  const columnCount = isAdmin ? 7 : 6;

  return (
    <>
      <div>
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

        <LandingTable
          columns={[
            { label: 'Full name', width: 220, className: 'px-5' },
            { label: 'Email', className: 'px-5' },
            { label: 'Phone', className: 'px-5' },
            { label: 'Role', className: 'px-5' },
            { label: 'Locations', className: 'px-5' },
            { label: 'Status', className: 'px-5' },
            ...(isAdmin ? [{ label: 'Actions', align: 'right' as const, className: 'px-5' }] : []),
          ]}
        >
          {isLoading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <tr key={`loading-${index}`} className="border-b border-cream-300 bg-white">
                <td colSpan={columnCount} className="px-3 py-3">
                  <div className="h-5 animate-pulse rounded bg-cream-100" aria-hidden="true" />
                </td>
              </tr>
            ))
          ) : filteredMembers.length === 0 ? (
            <tr>
              <td colSpan={columnCount} className="px-5 py-16 text-center text-base text-cream-500">
                No users match your filters.
              </td>
            </tr>
          ) : (
            filteredMembers.map((member) => (
              <tr
                key={member.id}
                className="border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
              >
                <td className="px-3 py-3 text-base text-cream-900">
                  {member.full_name ?? <span className="text-cream-400">—</span>}
                </td>
                <td className="px-3 py-3 text-base text-cream-700">{member.email}</td>
                <td className="px-3 py-3 text-base text-cream-700">{member.phone ?? '—'}</td>
                <td className="px-3 py-3">
                  <RoleChip role={member.role} />
                </td>
                <td className="px-3 py-3 text-base text-cream-700">
                  {formatLocationSummary(member)}
                </td>
                <td className="px-3 py-3">
                  <StatusChip status={member.status} />
                </td>
                {isAdmin ? (
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <RowActionButton
                        label="Edit access"
                        className="text-cream-600 hover:text-cream-900"
                        onClick={() => setEditMember(member)}
                      >
                        <Pencil size={14} />
                      </RowActionButton>
                      {member.status === 'pending' ? (
                        <RowActionButton
                          label="Resend invite"
                          className="text-cream-w600 hover:text-teal-600"
                          disabled={resendMutation.isPending}
                          onClick={() => {
                            setResendError(null);
                            setResendMember(member);
                          }}
                        >
                          <MailCheck size={14} />
                        </RowActionButton>
                      ) : null}
                      <RowActionButton
                        label="Deactivate user"
                        className="text-cream-600 hover:text-danger-500"
                        disabled={removeMutation.isPending}
                        onClick={() => {
                          setDeactivateError(null);
                          setDeactivateMember(member);
                        }}
                      >
                        <UserX size={14} />
                      </RowActionButton>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))
          )}
        </LandingTable>
      </div>

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
      <Badge className="rounded-sm border-0 bg-teal-100 text-caption font-medium text-teal-700 hover:bg-teal-100">
        Admin
      </Badge>
    );
  }
  return (
    <Badge className="rounded-sm border-0 bg-cream-200 text-caption font-medium text-cream-700 hover:bg-cream-200">
      Assistant
    </Badge>
  );
}

function StatusChip({ status }: { status: TeamMember['status'] }) {
  if (status === 'pending') {
    return <StatusTag label="Invited" tone="warning" className="text-caption" />;
  }
  if (status === 'inactive') {
    return <StatusTag label="Deactivated" tone="neutral" className="text-caption" />;
  }
  return <StatusTag label="Active" tone="success" className="text-caption" />;
}

interface RowActionButtonProps {
  label: string;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function RowActionButton({ label, className, disabled, onClick, children }: RowActionButtonProps) {
  return (
    <div className="group relative">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        aria-label={label}
        className={cn('h-7 w-7 p-0', className)}
        onClick={onClick}
      >
        {children}
      </Button>
    </div>
  );
}
