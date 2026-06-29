'use client';

import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { BrowseUploadField } from '@/components/ui/browse-upload-field';
import { Button } from '@/components/ui/button';
import {
  DiscardChangesDialog,
  FormBlock,
  FormOverlay,
  FormOverlayBody,
  FormOverlayFooter,
  FormOverlayHeader,
  FormSectionGrid,
  useDirtyCloseGuard,
} from '@/components/ui/form-overlay';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { MutationButton } from '@/components/ui/mutation-button';
import { useTenantCategories } from '@/hooks/useTenantCategories';
import { uploadEntityFile } from '@/lib/upload-client';
import { CreateCategoryInputSchema, type TenantCategory } from '@/types/tenant-categories';

const FormSchema = z.object({
  name: z.string().min(1, 'Category name is required').max(200),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(200)
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers and hyphens'),
  description: z.string().max(2000).optional(),
  display_order: z.coerce.number().int().min(0),
  external_ref: z.string().max(200).optional(),
  image_preview_url: z.string().optional(),
});

type FormValues = z.infer<typeof FormSchema>;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function defaultsFromCategory(cat: TenantCategory | null): FormValues {
  if (!cat) {
    return { name: '', slug: '', description: '', display_order: 0, external_ref: '', image_preview_url: '' };
  }
  return {
    name: cat.name,
    slug: cat.slug,
    description: cat.description ?? '',
    display_order: cat.display_order,
    external_ref: cat.external_ref ?? '',
    image_preview_url: cat.r2_image_thumb_key
      ? `/api/r2/image/${encodeURIComponent(cat.r2_image_thumb_key)}`
      : '',
  };
}

interface CategoryFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCategory: TenantCategory | null;
  onSuccess?: () => void;
}

export function CategoryFormSheet({ open, onOpenChange, editingCategory, onSuccess }: CategoryFormSheetProps) {
  const { createCategory, updateCategory, isCreating, isUpdating } = useTenantCategories();
  const [stagedImage, setStagedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isEdit = Boolean(editingCategory?.id && !editingCategory.deleted_at);
  const pending = isCreating || isUpdating;

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: defaultsFromCategory(editingCategory),
  });

  useEffect(() => {
    if (open) {
      form.reset(defaultsFromCategory(editingCategory));
      setStagedImage(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingCategory]);

  const dirtyGuard = useDirtyCloseGuard({
    isDirty: form.formState.isDirty || Boolean(stagedImage),
    onConfirmClose: () => {
      form.reset(defaultsFromCategory(editingCategory));
      setStagedImage(null);
      onOpenChange(false);
    },
  });

  const title = useMemo(() => (isEdit ? 'Edit category' : 'Add category'), [isEdit]);
  const description = useMemo(
    () =>
      isEdit
        ? 'Update this category\'s details. Display order controls purchase journey priority.'
        : 'Add a category for your products. Lower display order = shown first in buyer app.',
    [isEdit],
  );

  const nameValue = form.watch('name');
  const slugTouched = form.formState.dirtyFields.slug;

  useEffect(() => {
    if (!isEdit && !slugTouched && nameValue) {
      form.setValue('slug', slugify(nameValue), { shouldDirty: false });
    }
  }, [nameValue, slugTouched, isEdit, form]);

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name.trim(),
      slug: values.slug.trim(),
      description: values.description?.trim() || undefined,
      display_order: values.display_order,
    };

    const parsedCreate = CreateCategoryInputSchema.safeParse(payload);
    if (!parsedCreate.success) {
      form.setError('root', { message: parsedCreate.error.issues[0]?.message ?? 'Invalid' });
      return;
    }

    let savedId: string | undefined;

    if (isEdit && editingCategory) {
      const updated = await updateCategory({
        id: editingCategory.id,
        patch: {
          name: parsedCreate.data.name,
          slug: parsedCreate.data.slug,
          description: parsedCreate.data.description ?? null,
          display_order: parsedCreate.data.display_order,
          external_ref: parsedCreate.data.external_ref ?? null,
        },
      });
      savedId = updated.id;
    } else {
      const created = await createCategory(parsedCreate.data);
      savedId = created.id;
    }

    if (savedId && stagedImage) {
      void uploadEntityFile({
        endpoint: '/api/upload/tenant-category',
        entityType: 'tenant_category',
        entityId: savedId,
        file: stagedImage,
        imageType: 'icon',
      })
        .then(() => {
          toast.success(isEdit ? 'Category updated' : 'Category added');
        })
        .catch((err) => {
          toast.warning(`Category saved, but image upload failed. Edit and retry.`, {
            description: err instanceof Error ? err.message : 'Image upload failed.',
          });
        });
    } else {
      toast.success(isEdit ? 'Category updated' : 'Category added');
    }

    form.reset(values);
    onOpenChange(false);
    onSuccess?.();
  }

  const currentImageUrl = editingCategory?.r2_image_thumb_key
    ? `/api/r2/image/${encodeURIComponent(editingCategory.r2_image_thumb_key)}`
    : null;

  return (
    <>
      <FormOverlay open={open} onOpenChange={dirtyGuard.handleOpenChange}>
        <FormOverlayHeader title={title} description={description} eyebrow="Settings · Categories" />
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <FormOverlayBody className="flex-1 space-y-5 overflow-y-auto">

              <FormBlock title="Basic info">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. NVR / DVR" autoComplete="off" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category code</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="nvr-dvr"
                          className="font-mono"
                          onChange={(e) => {
                            field.onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
                          }}
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
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Short note for your team" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormBlock>

              <FormBlock title="Buyer app display priority">
                <FormSectionGrid>
                  <FormField
                    control={form.control}
                    name="display_order"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display order</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            {...field}
                            placeholder="0"
                            className="font-mono"
                          />
                        </FormControl>
                        <p className="text-body-sm text-cream-600">
                          Categories are shown in increasing order
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FormSectionGrid>
              </FormBlock>

              <FormBlock title="Image">
                <BrowseUploadField
                  value={previewUrl ? [previewUrl] : currentImageUrl ? [currentImageUrl] : []}
                  onChange={(urls) => {
                    if (!urls[0]) {
                      setStagedImage(null);
                      if (previewUrl) {
                        URL.revokeObjectURL(previewUrl);
                        setPreviewUrl(null);
                      }
                    }
                  }}
                  maxFiles={1}
                  label="Upload category image"
                  emptyLabel="Click or drag to upload"
                  helperText="JPG, PNG, WebP · Max 5MB · 1 image"
                  previewInline
                  uploadFile={async (file) => {
                    if (previewUrl) URL.revokeObjectURL(previewUrl);
                    const url = URL.createObjectURL(file);
                    setPreviewUrl(url);
                    setStagedImage(file);
                    return url;
                  }}
                />
              </FormBlock>

              {form.formState.errors.root ? (
                <p className="text-body-sm text-danger-600">{form.formState.errors.root.message}</p>
              ) : null}
            </FormOverlayBody>

            <FormOverlayFooter className="justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => dirtyGuard.handleOpenChange(false)}>
                Cancel
              </Button>
              <MutationButton type="submit" isPending={pending} pendingLabel="Saving…">
                {isEdit ? 'Save changes' : 'Add category'}
              </MutationButton>
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
