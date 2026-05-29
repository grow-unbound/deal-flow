'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { IndianRupee } from 'lucide-react';
import { PriceListSchema, type PriceListCreateInput } from '@/lib/zod';
import { useCreatePriceList } from '@/hooks/usePriceLists';
import { Button } from '@/components/ui/button';
import { MutationButton } from '@/components/ui/mutation-button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

interface CreatePriceListFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function CreatePriceListForm({ onSuccess, onCancel }: CreatePriceListFormProps) {
  const [submitError, setSubmitError] = useState<string | undefined>();
  const createPriceList = useCreatePriceList();

  const form = useForm<PriceListCreateInput>({
    resolver: zodResolver(PriceListSchema),
    defaultValues: {
      name: '',
      currency: 'INR',
      priority: 0,
    },
  });

  async function handleSubmit(data: PriceListCreateInput) {
    setSubmitError(undefined);
    try {
      await createPriceList.mutateAsync(data);
      onSuccess();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {submitError && (
          <p className="text-caption text-danger-500 bg-danger-50 rounded-md px-3 py-2">
            {submitError}
          </p>
        )}

        <div className="bg-cream-100 rounded-lg p-6 shadow-sm space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-caption font-medium text-cream-800">
                  Name <span className="text-danger-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Summer Pricing 2026" className="bg-cream-50" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-caption font-medium text-cream-800">Currency</FormLabel>
                <FormControl>
                  <Input placeholder="INR" className="bg-cream-50 font-mono uppercase" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="valid_from"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-caption font-medium text-cream-800">Valid from</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      className="bg-cream-50"
                      value={
                        field.value instanceof Date
                          ? field.value.toISOString().slice(0, 16)
                          : (field.value as string) ?? ''
                      }
                      onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="valid_to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-caption font-medium text-cream-800">
                    Valid to (optional)
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      className="bg-cream-50"
                      value={
                        field.value instanceof Date
                          ? field.value.toISOString().slice(0, 16)
                          : (field.value as string | undefined) ?? ''
                      }
                      onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-caption font-medium text-cream-800">Priority</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    className="bg-cream-50 font-mono"
                    {...field}
                    onChange={(e) => field.onChange(e.target.valueAsNumber)}
                  />
                </FormControl>
                <p className="text-caption text-cream-500 mt-1">
                  Higher priority overrides lower when multiple price lists apply.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={createPriceList.isPending}
          >
            Cancel
          </Button>
          <MutationButton
            type="submit"
            isPending={createPriceList.isPending}
            pendingLabel="Creating…"
            className="bg-teal-500 hover:bg-teal-600 text-cream-50 flex items-center gap-2"
          >
            <IndianRupee size={16} />
            Create price list
          </MutationButton>
        </div>
      </form>
    </Form>
  );
}
