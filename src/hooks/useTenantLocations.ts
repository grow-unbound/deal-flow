'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { apiDelete, apiFetch, apiPatch, apiPost } from '@/lib/api-fetch';
import type { CreateLocationInput, LocationType, TenantLocation, UpdateLocationInput } from '@/types/tenant-locations';

function parseLocationsResponse(json: unknown): { locations: TenantLocation[] } {
  const o = json as Record<string, unknown>;
  if (o.data && typeof o.data === 'object' && o.data !== null && 'locations' in o.data) {
    return { locations: (o.data as { locations: TenantLocation[] }).locations };
  }
  if ('locations' in o && Array.isArray(o.locations)) {
    return { locations: o.locations as TenantLocation[] };
  }
  return { locations: [] };
}

export function useTenantLocations() {
  const queryClient = useQueryClient();
  const { currentTenantId } = useAuth();
  const { isSellerAdmin } = useRole();

  const query = useQuery({
    queryKey: ['tenant-locations', currentTenantId, isSellerAdmin ? 'all' : 'active'],
    enabled: Boolean(currentTenantId),
    queryFn: async () => {
      const url = isSellerAdmin ? '/api/tenant/locations?include_deleted=1' : '/api/tenant/locations';
      const res = await apiFetch(url);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(j.error?.message ?? 'Failed to fetch locations');
      }
      return parseLocationsResponse(await res.json());
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateLocationInput) => {
      const res = await apiPost('/api/tenant/locations', input);
      const json = (await res.json()) as { data?: { location: TenantLocation }; error?: { message?: string } };
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to create location');
      }
      if (!json.data?.location) throw new Error('Invalid response');
      return json.data.location;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['tenant-locations', currentTenantId] });
      const prev = queryClient.getQueryData<{ locations: TenantLocation[] }>(['tenant-locations', currentTenantId]);
      const optimistic: TenantLocation = {
        id: `temp-${Date.now()}`,
        tenant_id: currentTenantId ?? '',
        name: input.name,
        type: (input.type ?? 'warehouse') as LocationType,
        address: {
          line1: input.address?.line1 ?? '',
          line2: input.address?.line2 ?? '',
          city: input.address?.city ?? '',
          state: input.address?.state ?? '',
          pincode: input.address?.pincode ?? '',
        },
        inventory_tracking: input.inventory_tracking ?? true,
        is_default: input.is_default ?? false,
        external_ref: input.external_ref?.trim() ? input.external_ref.trim() : null,
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const nextLocs = [...(prev?.locations ?? [])];
      if (optimistic.is_default) {
        for (const l of nextLocs) {
          l.is_default = false;
        }
      }
      nextLocs.push(optimistic);
      queryClient.setQueryData(['tenant-locations', currentTenantId], { locations: nextLocs });
      return { prev };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['tenant-locations', currentTenantId], ctx.prev);
      }
      toast.error(err instanceof Error ? err.message : 'Failed to create location');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant-locations', currentTenantId] });
      void queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
    onSuccess: () => {
      toast.success('Location added');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateLocationInput }) => {
      const res = await apiPatch(`/api/tenant/locations/${id}`, patch);
      const json = (await res.json()) as { data?: { location: TenantLocation }; error?: { message?: string } };
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to update location');
      }
      if (!json.data?.location) throw new Error('Invalid response');
      return json.data.location;
    },
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: ['tenant-locations', currentTenantId] });
      const prev = queryClient.getQueryData<{ locations: TenantLocation[] }>(['tenant-locations', currentTenantId]);
      const locs = [...(prev?.locations ?? [])];
      const idx = locs.findIndex((l) => l.id === id);
      if (idx >= 0) {
        const cur = { ...locs[idx] };
        if (patch.name !== undefined) cur.name = patch.name;
        if (patch.type !== undefined) cur.type = patch.type;
        if (patch.address) {
          cur.address = { ...cur.address, ...patch.address };
        }
        if (patch.inventory_tracking !== undefined) cur.inventory_tracking = patch.inventory_tracking;
        if (patch.is_default === true) {
          for (const l of locs) {
            l.is_default = false;
          }
          cur.is_default = true;
        } else if (patch.is_default === false) {
          cur.is_default = false;
        }
        if (patch.external_ref !== undefined) {
          cur.external_ref = patch.external_ref;
        }
        if (patch.reactivate) {
          cur.deleted_at = null;
        }
        locs[idx] = cur;
        queryClient.setQueryData(['tenant-locations', currentTenantId], { locations: locs });
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['tenant-locations', currentTenantId], ctx.prev);
      }
      toast.error(err instanceof Error ? err.message : 'Failed to update location');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant-locations', currentTenantId] });
      void queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
    onSuccess: (_data, vars) => {
      if (vars.patch.reactivate === true) {
        toast.success('Location reactivated');
      } else {
        toast.success('Location updated');
      }
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiDelete(`/api/tenant/locations/${id}`);
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to deactivate location');
      }
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['tenant-locations', currentTenantId] });
      const prev = queryClient.getQueryData<{ locations: TenantLocation[] }>(['tenant-locations', currentTenantId]);
      const locs = (prev?.locations ?? []).filter((l) => l.id !== id);
      queryClient.setQueryData(['tenant-locations', currentTenantId], { locations: locs });
      return { prev };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['tenant-locations', currentTenantId], ctx.prev);
      }
      toast.error(err instanceof Error ? err.message : 'Failed to deactivate location');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant-locations', currentTenantId] });
      void queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
    onSuccess: () => {
      toast.success('Location deactivated');
    },
  });

  return {
    ...query,
    createLocation: createMutation.mutateAsync,
    updateLocation: updateMutation.mutateAsync,
    deactivateLocation: deactivateMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeactivating: deactivateMutation.isPending,
  };
}
