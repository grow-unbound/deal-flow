'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Check } from 'lucide-react';

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MutationButton } from '@/components/ui/mutation-button';
import type { PlanTier } from '@/constants/tier-limits';
import { UpgradeRequestSchema, type UpgradeRequestInput } from '@/types/billing-settings';

const TIER_NAME: Record<PlanTier, string> = {
  lite: 'Lite',
  starter: 'Starter',
  growth: 'Growth',
  scale: 'Scale',
};

interface UpgradePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetTier: PlanTier | null;
  defaultName: string;
  defaultPhone: string;
  requestUpgrade: (body: UpgradeRequestInput) => Promise<unknown>;
  isPending: boolean;
}

export function UpgradePlanDialog({
  open,
  onOpenChange,
  targetTier,
  defaultName,
  defaultPhone,
  requestUpgrade,
  isPending,
}: UpgradePlanDialogProps) {
  const [sent, setSent] = useState(false);

  const form = useForm<UpgradeRequestInput>({
    resolver: zodResolver(UpgradeRequestSchema),
    defaultValues: {
      target_tier: 'growth',
      contact_name: defaultName,
      contact_phone: defaultPhone,
      note: '',
    },
  });

  useEffect(() => {
    if (open && targetTier) {
      setSent(false);
      form.reset({
        target_tier: targetTier,
        contact_name: defaultName || form.getValues('contact_name'),
        contact_phone: defaultPhone || form.getValues('contact_phone'),
        note: '',
      });
    }
  }, [open, targetTier, defaultName, defaultPhone, form]);

  async function onSubmit(values: UpgradeRequestInput) {
    await requestUpgrade(values);
    setSent(true);
  }

  const tierLabel = targetTier ? TIER_NAME[targetTier] : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-cream-200 p-0">
        <DialogHeader>
          <p className="px-6 pt-1 text-xs font-semibold uppercase tracking-[0.14em] text-cream-600">Upgrade plan</p>
          <DialogTitle>Upgrade to {tierLabel}</DialogTitle>
          <DialogDescription>
            Our team will reach out to complete your upgrade — usually within one business day.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <DialogBody className="flex flex-col items-center gap-3 pb-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-50 text-success-600">
              <Check className="h-6 w-6" strokeWidth={2.5} />
            </div>
            <p className="font-semibold text-cream-900">Request sent</p>
            <p className="text-body-sm text-cream-600">We will contact you at the phone number you provided.</p>
            <Button type="button" variant="outline" className="mt-2" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogBody>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <DialogBody className="space-y-4">
                <FormField
                  control={form.control}
                  name="contact_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your name</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contact_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Best number to reach you</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="tel" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="note"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (optional)</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} placeholder="e.g. We need higher limits before month-end…" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="target_tier"
                  render={({ field }) => <input type="hidden" {...field} />}
                />
              </DialogBody>
              <DialogFooter className="px-6 pb-6">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <MutationButton type="submit" isPending={isPending} pendingLabel="Sending…">
                  Send request
                </MutationButton>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
