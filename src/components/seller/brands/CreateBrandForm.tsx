'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

import { CreateBrandSchema, type CreateBrandInput } from '@/lib/zod';
import { useCreateCustomBrand, type CreateCustomBrandError } from '@/hooks/useBrands';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function CreateBrandForm() {
  const router = useRouter();
  const { mutateAsync, isPending } = useCreateCustomBrand();

  // Track whether the user has manually edited the slug field
  const slugManuallyEdited = useRef(false);

  const form = useForm<CreateBrandInput>({
    resolver: zodResolver(CreateBrandSchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      logo_url: '',
    },
  });

  // Auto-generate slug from name when name changes (unless slug was manually edited)
  function handleNameChange(value: string) {
    form.setValue('name', value);
    if (!slugManuallyEdited.current) {
      form.setValue('slug', slugify(value), { shouldValidate: true });
    }
  }

  function handleSlugChange(value: string) {
    slugManuallyEdited.current = true;
    form.setValue('slug', value, { shouldValidate: true });
  }

  async function onSubmit(data: CreateBrandInput) {
    try {
      // Strip empty optional fields so the API doesn't receive empty strings
      const payload: CreateBrandInput = {
        name: data.name,
        slug: data.slug,
        ...(data.description ? { description: data.description } : {}),
        ...(data.logo_url ? { logo_url: data.logo_url } : {}),
      };

      await mutateAsync(payload);
      toast.success('Brand created successfully');
      router.push('/brands');
    } catch (err) {
      const apiErr = err as CreateCustomBrandError;

      if (apiErr?.status === 409) {
        form.setError('slug', { message: 'This brand slug is already taken.' });
        return;
      }

      toast.error(apiErr?.error ?? 'Failed to create brand. Please try again.');
    }
  }

  return (
    <div className="bg-cream-100 rounded-lg p-6 shadow-sm">
      <p className="text-sm text-cream-600 mb-6">
        Create a private brand visible only to your account.{' '}
        <a href="/brands" className="text-teal-600 hover:underline">
          Search the master catalog instead
        </a>
      </p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          {/* Brand Name */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Brand Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. Sunrise Electronics"
                    {...field}
                    onChange={(e) => handleNameChange(e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Slug */}
          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Slug</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. sunrise-electronics"
                    {...field}
                    onChange={(e) => handleSlugChange(e.target.value)}
                  />
                </FormControl>
                <p className="text-xs text-cream-500 mt-1">
                  URL-safe identifier — lowercase letters, digits, and hyphens only.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Description */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (optional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Short description of the brand"
                    rows={3}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Logo URL */}
          <FormField
            control={form.control}
            name="logo_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Logo URL (optional)</FormLabel>
                <FormControl>
                  <Input
                    type="url"
                    placeholder="https://example.com/logo.png"
                    {...field}
                  />
                </FormControl>
                <p className="text-xs text-cream-500 mt-1">
                  Paste a publicly accessible image URL. Image upload will be available soon.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              type="submit"
              disabled={isPending}
              className="bg-teal-500 hover:bg-teal-600 text-cream-50"
            >
              <Plus className="w-4 h-4 mr-1" />
              {isPending ? 'Creating…' : 'Create brand'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push('/brands')}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
