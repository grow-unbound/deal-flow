import { generateEntityVariants } from '@/lib/client/image-variants';
import { R2_UPLOAD_CACHE_CONTROL } from '@/lib/r2-cache-control';
import { runConcurrent } from '@/lib/onboarding/run-concurrent';
import type { PhotoMatchResult } from '@/lib/onboarding/photo-match';
import pica from 'pica';
import { apiFetch } from '@/lib/api-fetch';

const FINALIZE: Record<string, string> = {
  tenant_product: '/api/upload/tenant-product',
  tenant_brand: '/api/upload/tenant-brand',
  tenant_category: '/api/upload/tenant-category',
};

type PresignedSlot = { name: string; key: string; upload_url: string };

async function putBlob(url: string, blob: Blob, contentType: string): Promise<void> {
  const res = await fetch(url, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': contentType, 'Cache-Control': R2_UPLOAD_CACHE_CONTROL },
  });
  if (!res.ok) throw new Error(`R2 upload failed: ${res.status}`);
}

export async function uploadMatchedPhotos(params: {
  matches: PhotoMatchResult[];
  tenantId: string;
  onProgress: (done: number, total: number) => void;
}): Promise<{ uploaded: number; failed: number }> {
  const ready = params.matches.filter((m) => m.candidate && m.matchKind !== 'none');
  if (ready.length === 0) return { uploaded: 0, failed: 0 };

  const picaInstance = pica();
  let uploaded = 0;
  let failed = 0;
  let done = 0;

  const batches: PhotoMatchResult[][] = [];
  for (let i = 0; i < ready.length; i += 25) {
    batches.push(ready.slice(i, i + 25));
  }

  for (const batch of batches) {
    const presignRes = await apiFetch('/api/uploads/r2/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: batch.map((item) => ({
          entity_type: item.candidate!.entityType,
          entity_id: item.candidate!.entityId,
          original_content_type: (['image/jpeg', 'image/png', 'image/webp'].includes(item.file.type)
            ? item.file.type
            : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp',
        })),
      }),
    });
    if (!presignRes.ok) throw new Error('Failed to get upload URLs');
    const presignJson = (await presignRes.json()) as {
      items: Array<{ entity_id: string; variants: PresignedSlot[] }>;
    };
    const byId = new Map(presignJson.items.map((row) => [row.entity_id, row.variants]));

    await runConcurrent(batch, 6, async (item) => {
      try {
        const candidate = item.candidate!;
        const variants = byId.get(candidate.entityId);
        if (!variants) throw new Error('Missing presign');
        const generated = await generateEntityVariants(
          item.file,
          candidate.entityType,
          candidate.entityId,
          params.tenantId,
          picaInstance,
        );
        await Promise.all(
          generated.map(({ name, blob, contentType }) => {
            const slot = variants.find((v) => v.name === name);
            if (!slot) throw new Error(`No presigned URL for ${name}`);
            return putBlob(slot.upload_url, blob, contentType);
          }),
        );
        const variantKeys: Record<string, string> = {};
        for (const slot of variants) variantKeys[slot.name] = slot.key;
        const endpoint = FINALIZE[candidate.entityType];
        const finalizeRes = await apiFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity_id: candidate.entityId, variants: variantKeys }),
        });
        if (!finalizeRes.ok) throw new Error('Finalize failed');
        uploaded += 1;
      } catch {
        failed += 1;
      } finally {
        done += 1;
        params.onProgress(done, ready.length);
      }
    });
  }

  return { uploaded, failed };
}
