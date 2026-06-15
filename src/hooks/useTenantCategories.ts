'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { apiDelete, apiFetch, apiPatch, apiPost } from '@/lib/api-fetch';
import type { CreateCategoryInput, TenantCategory, UpdateCategoryInput } from '@/types/tenant-categories';

function parseCategoriesResponse(json: unknown): { categories: TenantCategory[] } {
  const o = json as Record<string, unknown>;
  if (o.data && typeof o.data === 'object' && o.data !== null && 'categories' in o.data) {
    return { categories: (o.data as { categories: TenantCategory[] }).categories };
  }
  if ('categories' in o && Array.isArray(o.categories)) {
    return { categories: o.categories as TenantCategory[] };
  }
  return { categories: [] };
}

export function useTenantCategories() {
  const queryClient = useQueryClient();
  const { currentTenantId } = useAuth();
  const { isSellerAdmin } = useRole();

  const query = useQuery({
    queryKey: ['tenant-categories', currentTenantId, isSellerAdmin ? 'all' : 'active'],
    enabled: Boolean(currentTenantId),
    queryFn: async () => {
      const url = isSellerAdmin
        ? '/api/tenant/categories?include_deleted=1'
        : '/api/tenant/categories';
      const res = await apiFetch(url);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(j.error?.message ?? 'Failed to fetch categories');
      }
      return parseCategoriesResponse(await res.json());
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateCategoryInput) => {
      const res = await apiPost('/api/tenant/categories', input);
      const json = (await res.json()) as { data?: { category: TenantCategory }; error?: { message?: string } };
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to create category');
      }
      if (!json.data?.category) throw new Error('Invalid response');
      return json.data.category;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['tenant-categories', currentTenantId] });
      const prev = queryClient.getQueryData<{ categories: TenantCategory[] }>([
        'tenant-categories',
        currentTenantId,
      ]);
      const optimistic: TenantCategory = {
        id: `temp-${Date.now()}`,
        tenant_id: currentTenantId ?? '',
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        display_order: input.display_order ?? 0,
        external_ref: input.external_ref?.trim() ? input.external_ref.trim() : null,
        is_active: true,
        deleted_at: null,
        r2_image_original_key: input.r2_image_original_key ?? null,
        r2_image_medium_key: input.r2_image_medium_key ?? null,
        r2_image_thumb_key: input.r2_image_thumb_key ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const next = [...(prev?.categories ?? []), optimistic].sort(
        (a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name),
      );
      queryClient.setQueryData(['tenant-categories', currentTenantId], { categories: next });
      return { prev };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['tenant-categories', currentTenantId], ctx.prev);
      }
      toast.error(err instanceof Error ? err.message : 'Failed to create category');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant-categories', currentTenantId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateCategoryInput }) => {
      const res = await apiPatch(`/api/tenant/categories/${id}`, patch);
      const json = (await res.json()) as { data?: { category: TenantCategory }; error?: { message?: string } };
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to update category');
      }
      if (!json.data?.category) throw new Error('Invalid response');
      return json.data.category;
    },
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: ['tenant-categories', currentTenantId] });
      const prev = queryClient.getQueryData<{ categories: TenantCategory[] }>([
        'tenant-categories',
        currentTenantId,
      ]);
      const cats = [...(prev?.categories ?? [])];
      const idx = cats.findIndex((c) => c.id === id);
      if (idx >= 0) {
        const cur = { ...cats[idx] };
        if (patch.name !== undefined) cur.name = patch.name;
        if (patch.slug !== undefined) cur.slug = patch.slug;
        if (patch.description !== undefined) cur.description = patch.description ?? null;
        if (patch.display_order !== undefined) cur.display_order = patch.display_order;
        if (patch.external_ref !== undefined) cur.external_ref = patch.external_ref ?? null;
        if (patch.is_active !== undefined) cur.is_active = patch.is_active;
        if (patch.reactivate) cur.deleted_at = null;
        cats[idx] = cur;
        queryClient.setQueryData(['tenant-categories', currentTenantId], { categories: cats });
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['tenant-categories', currentTenantId], ctx.prev);
      }
      toast.error(err instanceof Error ? err.message : 'Failed to update category');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant-categories', currentTenantId] });
    },
    onSuccess: (_data, vars) => {
      if (vars.patch.reactivate === true) {
        toast.success('Category reactivated');
      }
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiDelete(`/api/tenant/categories/${id}`);
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to deactivate category');
      }
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['tenant-categories', currentTenantId] });
      const prev = queryClient.getQueryData<{ categories: TenantCategory[] }>([
        'tenant-categories',
        currentTenantId,
      ]);
      const cats = (prev?.categories ?? []).filter((c) => c.id !== id);
      queryClient.setQueryData(['tenant-categories', currentTenantId], { categories: cats });
      return { prev };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['tenant-categories', currentTenantId], ctx.prev);
      }
      toast.error(err instanceof Error ? err.message : 'Failed to deactivate category');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant-categories', currentTenantId] });
    },
    onSuccess: () => {
      toast.success('Category deactivated');
    },
  });

  return {
    ...query,
    createCategory: createMutation.mutateAsync,
    updateCategory: updateMutation.mutateAsync,
    deactivateCategory: deactivateMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeactivating: deactivateMutation.isPending,
  };
}
