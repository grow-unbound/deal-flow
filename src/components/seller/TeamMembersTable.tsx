'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, MailCheck, Trash2, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from './DataTable';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { InviteUserDialog } from './InviteUserDialog';
import { supabaseBrowser } from '@/lib/supabase-browser';
import type { TeamMember } from '@/types/team';

interface Props {
  tenantId: string;
  isAdmin: boolean;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabaseBrowser.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

export function TeamMembersTable({ tenantId, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const [editMember, setEditMember] = useState<TeamMember | null>(null);

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

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const r = await fetch(`/api/team/members/${id}`, { method: 'DELETE', headers });
      if (!r.ok) throw new Error('Failed to remove member');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team'] }),
  });

  const resendMutation = useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const r = await fetch(`/api/team/members/${id}/resend-invite`, { method: 'PUT', headers });
      if (!r.ok) throw new Error('Failed to resend invite');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team'] }),
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
      <DataTable
        data={members}
        loading={isLoading}
        loadingMessage="Loading team members..."
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
                  Pending
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
                      title="Edit role"
                    >
                      <Pencil size={14} />
                    </Button>
                    {member.status === 'pending' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-cream-600 hover:text-teal-600"
                        onClick={() => resendMutation.mutate(member.id)}
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
                        if (confirm(`Remove ${member.email} from your team?`)) {
                          removeMutation.mutate(member.id);
                        }
                      }}
                      disabled={removeMutation.isPending}
                      title="Remove member"
                    >
                      <Trash2 size={14} />
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
