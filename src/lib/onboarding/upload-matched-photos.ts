import { generateEntityVariants } from '@/lib/client/image-variants';
import { runConcurrent } from '@/lib/onboarding/run-concurrent';
import type { PhotoMatchResult } from '@/lib/onboarding/photo-match';
import pica from 'pica';
import { apiFetch, apiPost } from '@/lib/api-fetch';

const FINALIZE: Record<string, string> = {
  tenant_product: '/api/upload/tenant-product',
  tenant_product_family: '/api/upload/tenant-product-family',
  tenant_brand: '/api/upload/tenant-brand',
  tenant_category: '/api/upload/tenant-category',
};

export type MatchedPhotoUploadFailure = {
  fileName: string;
  targetLabel: string;
  targetType: string;
  reason: string;
};

async function putGeneratedVariant(params: {
  entityType: string;
  entityId: string;
  name: string;
  blob: Blob;
  contentType: string;
}): Promise<{ key: string }> {
  const form = new FormData();
  form.set('entity_type', params.entityType);
  form.set('entity_id', params.entityId);
  form.set('variant_name', params.name);
  form.set('content_type', params.contentType);
  form.set('file', params.blob);

  const res = await apiFetch('/api/uploads/r2/entity-variant', {
    method: 'POST',
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as { key?: string; error?: string };
  if (!res.ok || !json.key) throw new Error(json.error ?? `R2 upload failed: ${res.status}`);
  return { key: json.key };
}

export async function uploadMatchedPhotos(params: {
  matches: PhotoMatchResult[];
  tenantId: string;
  onProgress: (done: number, total: number) => void;
}): Promise<{ uploaded: number; failed: number; failures: MatchedPhotoUploadFailure[] }> {
  const ready = params.matches.filter((m) => m.candidate && m.matchKind !== 'none');
  if (ready.length === 0) return { uploaded: 0, failed: 0, failures: [] };

  const picaInstance = pica();
  let uploaded = 0;
  let failed = 0;
  let done = 0;
  const failures: MatchedPhotoUploadFailure[] = [];

  const batches: PhotoMatchResult[][] = [];
  for (let i = 0; i < ready.length; i += 25) {
    batches.push(ready.slice(i, i + 25));
  }

  for (const batch of batches) {
    await runConcurrent(batch, 4, async (item) => {
      try {
        const candidate = item.candidate!;
        const generated = await generateEntityVariants(
          item.file,
          candidate.entityType,
          candidate.entityId,
          params.tenantId,
          picaInstance,
        );
        const variantKeys: Record<string, string> = {};
        await Promise.all(
          generated.map(async ({ name, blob, contentType }) => {
            const uploaded = await putGeneratedVariant({
              entityType: candidate.entityType,
              entityId: candidate.entityId,
              name,
              blob,
              contentType,
            });
            variantKeys[name] = uploaded.key;
          }),
        );
        const endpoint = FINALIZE[candidate.entityType];
        const finalizeRes = await apiPost(endpoint, {
          entity_id: candidate.entityId,
          variants: variantKeys,
        });
        if (!finalizeRes.ok) {
          const json = (await finalizeRes.json().catch(() => null)) as { error?: string } | null;
          throw new Error(json?.error ?? `Finalize failed: ${finalizeRes.status}`);
        }
        uploaded += 1;
      } catch (error) {
        failed += 1;
        failures.push({
          fileName: item.relativePath,
          targetLabel: item.candidate?.label ?? item.relativePath,
          targetType: item.candidate?.entityType ?? 'unknown',
          reason: error instanceof Error ? error.message : 'Upload failed',
        });
      } finally {
        done += 1;
        params.onProgress(done, ready.length);
      }
    });
  }

  return { uploaded, failed, failures };
}
