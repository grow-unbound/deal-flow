'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InviteUserSchema, UpdateMemberRoleSchema, type InviteUserInput } from '@/lib/zod';
import type { TeamMember } from '@/types/team';

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, dialog is in edit-role mode */
  member?: TeamMember;
}

export function InviteUserDialog({ open, onOpenChange, member }: InviteUserDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!member;

  const schema = isEdit ? UpdateMemberRoleSchema : InviteUserSchema;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<InviteUserInput>({
    resolver: zodResolver(schema),
    defaultValues: isEdit
      ? { email: member.email, role: member.role }
      : { email: '', role: 'seller_assistant' },
  });

  const roleValue = watch('role');

  async function onSubmit(data: InviteUserInput) {
    const url = isEdit
      ? `/api/team/members/${member!.id}`
      : '/api/team/invite';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isEdit ? { role: data.role } : data),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setError('email', { message: body.error });
      } else {
        setError('root', { message: body.error ?? 'Something went wrong' });
      }
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ['team'] });
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md bg-cream-50">
        <DialogHeader>
          <DialogTitle className="font-display text-cream-900">
            {isEdit ? 'Edit role' : 'Invite team member'}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="bg-cream-100 rounded-lg shadow-xs p-6 space-y-4"
        >
          {errors.root && (
            <p className="text-caption text-danger-500 bg-danger-50 rounded-md px-3 py-2">
              {errors.root.message}
            </p>
          )}

          <div className="space-y-1.5">
            <label className="text-caption font-medium text-cream-800" htmlFor="invite-email">
              Email address
            </label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@company.com"
              disabled={isEdit}
              {...register('email')}
              className="bg-cream-50"
            />
            {errors.email && (
              <p className="text-caption text-danger-500">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-caption font-medium text-cream-800">Role</label>
            <Select
              value={roleValue}
              onValueChange={(v) => setValue('role', v as InviteUserInput['role'])}
            >
              <SelectTrigger className="bg-cream-50">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="seller_admin">Admin</SelectItem>
                <SelectItem value="seller_assistant">Assistant</SelectItem>
              </SelectContent>
            </Select>
            {errors.role && (
              <p className="text-caption text-danger-500">{errors.role.message}</p>
            )}
          </div>

          <div className="flex gap-2 pt-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => { reset(); onOpenChange(false); }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-teal-500 hover:bg-teal-600 text-cream-50 flex items-center gap-2"
            >
              {!isEdit && <UserPlus size={16} />}
              {isSubmitting
                ? isEdit ? 'Saving…' : 'Sending…'
                : isEdit ? 'Save changes' : 'Send invite'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
