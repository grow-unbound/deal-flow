'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, MailCheck, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InviteUserDialog } from './InviteUserDialog';
import type { TeamMember } from '@/types/team';

interface Props {
  tenantId: string;
  isAdmin: boolean;
}

async function fetchMembers(): Promise<TeamMember[]> {
  const res = await fetch('/api/team/members');
  if (!res.ok) throw new Error('Failed to load team members');
  const data = await res.json();
  return data.members as TeamMember[];
}

export function TeamMembersTable({ tenantId, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const [editMember, setEditMember] = useState<TeamMember | null>(null);

  const { data: members = [], isLoading, isError } = useQuery({
    queryKey: ['team', tenantId],
    queryFn: fetchMembers,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/team/members/${id}`, { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error('Failed to remove member');
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team'] }),
  });

  const resendMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/team/members/${id}/resend-invite`, { method: 'PUT' }).then((r) => {
        if (!r.ok) throw new Error('Failed to resend invite');
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team'] }),
  });

  if (isLoading) {
    return (
      <div className="py-12 text-center text-caption text-cream-600">
        Loading team members…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-12 text-center text-caption text-danger-500">
        Failed to load team members.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-cream-300 overflow-hidden">
        <table className="w-full text-body-sm">
          <thead>
            <tr className="bg-cream-200 border-b border-cream-300">
              <th className="text-left px-4 py-3 font-medium text-cream-700">Full Name</th>
              <th className="text-left px-4 py-3 font-medium text-cream-700">Email</th>
              <th className="text-left px-4 py-3 font-medium text-cream-700">Phone</th>
              <th className="text-left px-4 py-3 font-medium text-cream-700">Role</th>
              <th className="text-left px-4 py-3 font-medium text-cream-700">Status</th>
              {isAdmin && (
                <th className="text-left px-4 py-3 font-medium text-cream-700">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr>
                <td
                  colSpan={isAdmin ? 6 : 5}
                  className="text-center py-10 text-cream-500 text-caption"
                >
                  No team members yet.
                </td>
              </tr>
            )}
            {members.map((member, idx) => (
              <tr
                key={member.id}
                className={`border-b border-cream-200 last:border-0 ${
                  idx % 2 === 0 ? 'bg-cream-50' : 'bg-cream-100'
                }`}
              >
                <td className="px-4 py-3 text-cream-900">
                  {member.full_name ?? <span className="text-cream-400">—</span>}
                </td>
                <td className="px-4 py-3 text-cream-700">{member.email}</td>
                <td className="px-4 py-3 text-cream-700">
                  {member.phone ?? <span className="text-cream-400">—</span>}
                </td>
                <td className="px-4 py-3">
                  <RoleChip role={member.role} />
                </td>
                <td className="px-4 py-3">
                  {member.status === 'pending' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-caption font-medium bg-amber-100 text-amber-700">
                      Pending
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-caption font-medium bg-success-50 text-success-700">
                      Active
                    </span>
                  )}
                </td>
                {isAdmin && (
                  <td className="px-4 py-3">
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
                      {member.status === 'pending' && (
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
                      )}
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
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
