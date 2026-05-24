'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { TeamMembersTable } from '@/components/seller/TeamMembersTable';
import { InviteUserDialog } from '@/components/seller/InviteUserDialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@/constants';

export default function TeamPage() {
  const { tenantProfile, currentTenantId } = useAuth();
  const isAdmin = tenantProfile?.role === ROLES.SELLER_ADMIN;
  const [inviteOpen, setInviteOpen] = useState(false);

  const addUserAction = isAdmin ? (
    <Button
      onClick={() => setInviteOpen(true)}
      className="bg-teal-500 hover:bg-teal-600 text-cream-50 flex items-center gap-2"
    >
      <UserPlus size={16} />
      Add User
    </Button>
  ) : null;

  return (
    <>
      <SellerTopbar title="Users & Roles" action={addUserAction} />
      <div
        className="px-8 py-6"
        style={{ paddingTop: 'calc(var(--topbar-h) + 24px)' }}
      >
        <div className="max-w-5xl">
          <p className="text-body text-cream-600 mb-6">
            Manage who has access to your DealFlow workspace.
          </p>
          <TeamMembersTable
            tenantId={currentTenantId ?? ''}
            isAdmin={isAdmin}
          />
        </div>
      </div>

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </>
  );
}
