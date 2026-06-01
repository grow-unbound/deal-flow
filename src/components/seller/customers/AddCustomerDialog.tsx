'use client';

import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { BuyerCreateSchema, type BuyerCreateInput } from '@/lib/zod';
import { useCreateCustomerOptimistic } from '@/hooks/useCustomersLanding';

export function AddCustomerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const createMutation = useCreateCustomerOptimistic();
  const form = useForm<BuyerCreateInput>({
    resolver: zodResolver(BuyerCreateSchema),
    defaultValues: {
      business_name: '',
      contact_name: '',
      phone: '',
      email: '',
      gstin: '',
      external_ref: '',
      tier: 'B',
      credit_limit: 0,
      payment_terms_days: 0,
      geography: { city: '', state: '', pincode: '', zone: '' },
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await createMutation.mutateAsync(values);
      toast.success('Customer added');
      form.reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create customer');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] border-cream-300 bg-cream-50 p-0">
        <DialogHeader>
          <DialogTitle className="font-display text-cream-900 text-h3">Add a customer</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit}>
            <DialogBody className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="business_name" render={({ field }) => (
                <FormItem><FormLabel>Business name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} maxLength={10} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="contact_name" render={({ field }) => (
                <FormItem><FormLabel>Contact name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="geography.city" render={({ field }) => (
                <FormItem><FormLabel>City</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="credit_limit" render={({ field }) => (
                <FormItem><FormLabel>Credit limit</FormLabel><FormControl><Input type="number" {...field} onChange={(e) => field.onChange(Number(e.target.value || 0))} /></FormControl><FormMessage /></FormItem>
              )} />
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" className="bg-teal-500 text-cream-50 hover:bg-teal-600" disabled={createMutation.isPending}>Add customer</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
