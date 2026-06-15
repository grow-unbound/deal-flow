'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UsersRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { CohortCreateSchema, type CohortCreateInput, type CohortRuleFilter } from '@/lib/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { CohortRuleBuilder } from './CohortRuleBuilder';
import { CohortMemberSelector } from './CohortMemberSelector';
import { CohortPreviewPanel } from './CohortPreviewPanel';

interface CohortFormProps {
  mode?: 'create' | 'edit';
  cohortId?: string;
  defaultValues?: Partial<CohortCreateInput>;
}

export function CohortForm({ mode = 'create', cohortId, defaultValues }: CohortFormProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<CohortRuleFilter[]>(
    (defaultValues?.rules?.filters as CohortRuleFilter[]) ?? [],
  );
  const [tab, setTab] = useState<'dynamic' | 'static'>(
    defaultValues?.is_static ? 'static' : 'dynamic',
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedBuyers, setSelectedBuyers] = useState<string[]>([]);

  const form = useForm<CohortCreateInput>({
    resolver: zodResolver(CohortCreateSchema),
    defaultValues: {
      name: '',
      description: '',
      is_static: false,
      ...defaultValues,
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(data: CohortCreateInput) {
    setSubmitError(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const payload = {
        ...data,
        is_static: tab === 'static',
        rules: tab === 'dynamic' ? { filters } : undefined,
      };

      const url = mode === 'edit' && cohortId ? `/api/cohorts/${cohortId}` : '/api/cohorts';
      const method = mode === 'edit' ? 'PATCH' : 'POST';

      const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
      const body = await res.json() as { error?: string; cohort?: { id: string } };

      if (!res.ok) {
        setSubmitError(body.error ?? 'Something went wrong');
        return;
      }

      // For new static cohorts with selected buyers, add members after creation
      if (mode === 'create' && tab === 'static' && selectedBuyers.length > 0 && body.cohort?.id) {
        const membersRes = await fetch(`/api/cohorts/${body.cohort.id}/members`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ buyer_ids: selectedBuyers }),
        });
        if (!membersRes.ok) {
          const membersBody = await membersRes.json() as { error?: string };
          setSubmitError(membersBody.error ?? 'Cohort created but failed to add members');
          return;
        }
      }

      router.push('/cohorts');
    } catch {
      setSubmitError('Network error. Please try again.');
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
        {submitError && (
          <p className="text-caption text-danger-500 bg-danger-50 rounded-md px-3 py-2">
            {submitError}
          </p>
        )}

        {/* Name and description */}
        <div className="bg-cream-100 rounded-lg p-6 shadow-sm space-y-4">
          <h3 className="text-body font-semibold text-cream-900">Cohort Details</h3>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-caption font-medium text-cream-800">
                  Cohort name <span className="text-danger-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. North Delhi A-class"
                    className="bg-cream-50"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-caption font-medium text-cream-800">
                  Description
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="Optional description"
                    className="bg-cream-50"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Type tabs */}
        <div className="bg-cream-100 rounded-lg p-6 shadow-sm space-y-4">
          <h3 className="text-body font-semibold text-cream-900">Cohort Type</h3>
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'dynamic' | 'static')}>
            <TabsList className="bg-cream-200">
              <TabsTrigger value="dynamic">Rule-based</TabsTrigger>
              <TabsTrigger value="static">Manual list</TabsTrigger>
            </TabsList>
            <TabsContent value="dynamic" className="pt-4">
              <p className="text-caption text-cream-600 mb-4">
                Buyers are matched automatically when rules are evaluated.
              </p>
              <CohortRuleBuilder filters={filters} onChange={setFilters} />
              <CohortPreviewPanel filters={filters} />
            </TabsContent>
            <TabsContent value="static" className="pt-4">
              <p className="text-caption text-cream-600 mb-4">
                Select buyers to include in this cohort. You can add or remove members after saving.
              </p>
              <CohortMemberSelector selected={selectedBuyers} onChange={setSelectedBuyers} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-teal-500 hover:bg-teal-600 text-cream-50 flex items-center gap-2"
          >
            <UsersRound size={16} />
            {isSubmitting ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save cohort'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
