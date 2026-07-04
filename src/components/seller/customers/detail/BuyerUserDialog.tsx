'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FormOverlay, FormOverlayBody, FormOverlayFooter, FormOverlayHeader, useDirtyCloseGuard, DiscardChangesDialog } from '@/components/ui/form-overlay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { apiFetch } from '@/lib/api-fetch';
import { BuyerUserSchema, type BuyerUserInput } from '@/lib/zod';

export type BuyerUserRow = {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  designation: string | null;
  department: string | null;
  is_active: boolean;
  status: 'Active' | 'Inactive' | 'Pending invite';
};

interface BuyerUserDialogProps {
  buyerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: BuyerUserRow | null;
}

function toFormValues(user?: BuyerUserRow | null): BuyerUserInput {
  return {
    first_name: user?.first_name ?? '',
    last_name: user?.last_name ?? '',
    phone: user?.phone ?? '',
    email: user?.email ?? '',
    designation: user?.designation ?? '',
  };
}

export function BuyerUserDialog({ buyerId, open, onOpenChange, user }: BuyerUserDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(user);
  const form = useForm<BuyerUserInput>({
    resolver: zodResolver(BuyerUserSchema),
    defaultValues: toFormValues(user),
  });

  const {
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = form;

  useEffect(() => {
    if (!open) {
      reset(toFormValues(user));
      return;
    }
    reset(toFormValues(user));
  }, [open, reset, user]);

  const dirtyGuard = useDirtyCloseGuard({
    isDirty: form.formState.isDirty,
    onConfirmClose: () => {
      reset(toFormValues(user));
      onOpenChange(false);
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const url = isEdit && user ? `/api/customers/${buyerId}/users/${user.id}` : `/api/customers/${buyerId}/users`;
      const method = isEdit && user ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? (isEdit ? 'Failed to update buyer user' : 'Failed to create buyer user'));
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tenant-customer-detail', buyerId] }),
        queryClient.invalidateQueries({ queryKey: ['customer-buyer-users', buyerId] }),
      ]);
      toast.success(isEdit ? 'Buyer user updated' : 'Buyer user created');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong');
    }
  });

  return (
    <>
      <FormOverlay open={open} onOpenChange={dirtyGuard.handleOpenChange}>
        <FormOverlayHeader
          eyebrow="Customers"
          title={isEdit ? 'Edit buyer user' : 'Add buyer user'}
          description={
            isEdit
              ? 'Update the buyer contact details shown on this customer.'
              : 'Create a new buyer contact for this account.'
          }
        />

        <Form {...form}>
          <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
            <FormOverlayBody className="space-y-4 overflow-y-auto sm:space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        First name <span className="text-danger-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} placeholder="Amit" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Last name <span className="text-danger-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} placeholder="Sharma" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Phone number <span className="text-danger-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <div className="flex items-stretch">
                          <span className="inline-flex items-center rounded-l-[8px] border border-r-0 border-cream-400 bg-cream-200 px-3 text-base text-cream-700">
                            +91
                          </span>
                          <Input
                            {...field}
                            value={field.value ?? ''}
                            type="tel"
                            inputMode="numeric"
                            placeholder="9876543210"
                            maxLength={10}
                            className="rounded-l-none font-mono tracking-wide"
                            onChange={(event) => {
                              field.onChange(event.target.value.replace(/\D/g, '').slice(0, 10));
                            }}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} type="email" placeholder="optional" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="designation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Designation</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} placeholder="Owner / Purchase lead" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormOverlayBody>

            <FormOverlayFooter className="justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => dirtyGuard.handleOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
              </Button>
            </FormOverlayFooter>
          </form>
        </Form>
      </FormOverlay>

      <DiscardChangesDialog
        open={dirtyGuard.discardOpen}
        onOpenChange={dirtyGuard.setDiscardOpen}
        onDiscard={dirtyGuard.confirmDiscard}
      />
    </>
  );
}
