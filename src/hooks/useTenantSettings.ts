'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch, apiPatch } from '@/lib/api-fetch';
import { applyTenantSettingsPatch } from '@/lib/tenant-settings/apply-settings-patch';
import type { TenantSettingsApiPayload, TenantSettingsPatch } from '@/types/tenant-settings';

async function parseSettingsResponse(res: Response): Promise<TenantSettingsApiPayload> {
  const json = (await res.json()) as {
    data: TenantSettingsApiPayload | null;
    error: { code?: string; message?: string } | null;
  };
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Request failed (${res.status})`);
  }
  if (!json.data) {
    throw new Error(json.error?.message ?? 'No data');
  }
  return json.data;
}

export function useTenantSettings() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { currentTenantId } = useAuth();

  const query = useQuery({
    queryKey: ['tenant-settings', currentTenantId],
    enabled: Boolean(currentTenantId),
    queryFn: async () => {
      const res = await apiFetch('/api/settings');
      return parseSettingsResponse(res);
    },
  });

  const mutation = useMutation({
    mutationFn: async (patch: TenantSettingsPatch) => {
      const res = await apiPatch('/api/settings', patch);
      return parseSettingsResponse(res);
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ['tenant-settings', currentTenantId] });
      const previous = queryClient.getQueryData<TenantSettingsApiPayload>(['tenant-settings', currentTenantId]);
      if (previous) {
        queryClient.setQueryData<TenantSettingsApiPayload>(
          ['tenant-settings', currentTenantId],
          applyTenantSettingsPatch(previous, patch),
        );
      }
      return { previous };
    },
    onError: (err, _patch, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['tenant-settings', currentTenantId], ctx.previous);
      }
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['tenant-settings', currentTenantId], data);
      toast.success('Settings saved');
      // Re-render server layout so sidebar reflects updated feature toggles
      router.refresh();
    },
  });

  return {
    ...query,
    save: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
