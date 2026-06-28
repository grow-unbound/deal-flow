// generate-embeddings: processes the catalog.embedding_queue in batches.
// Opt-in: returns immediately if EMBEDDING_PROVIDER is not set.
// Provider-agnostic: set EMBEDDING_PROVIDER=openai or EMBEDDING_PROVIDER=local.

import { createClient } from 'npm:@supabase/supabase-js@2';

declare const Deno: { env: { get(name: string): string | undefined } };

const PROVIDER    = Deno.env.get('EMBEDDING_PROVIDER');
const MODEL       = Deno.env.get('EMBEDDING_MODEL') ?? 'text-embedding-3-small';
const OPENAI_KEY  = Deno.env.get('OPENAI_API_KEY');
const LOCAL_URL   = Deno.env.get('LOCAL_EMBEDDING_URL');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const db = createClient(SUPABASE_URL, SERVICE_KEY);

interface QueueRow { id: number; entity_type: string; entity_id: string }

async function getEmbedding(text: string): Promise<number[]> {
  if (PROVIDER === 'openai') {
    if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai');
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input: text }),
    });
    if (!res.ok) throw new Error(`OpenAI embeddings error: ${res.status} ${await res.text()}`);
    const json = await res.json() as { data: Array<{ embedding: number[] }> };
    return json.data[0].embedding;
  }

  if (PROVIDER === 'local') {
    if (!LOCAL_URL) throw new Error('LOCAL_EMBEDDING_URL is required when EMBEDDING_PROVIDER=local');
    const res = await fetch(LOCAL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input: text }),
    });
    if (!res.ok) throw new Error(`Local embedding error: ${res.status} ${await res.text()}`);
    const json = await res.json() as { embedding: number[] };
    return json.embedding;
  }

  throw new Error(`Unknown EMBEDDING_PROVIDER: ${PROVIDER}`);
}

async function fetchEntityText(entityType: string, entityId: string): Promise<string | null> {
  if (entityType === 'catalog.brands') {
    const { data } = await (db as any).schema('catalog').from('brands').select('name, description').eq('id', entityId).single();
    if (!data) return null;
    return [data.name, data.description].filter(Boolean).join(' ');
  }

  if (entityType === 'catalog.products') {
    const { data } = await (db as any).schema('catalog').from('products').select('name, master_sku, description, attributes').eq('id', entityId).single();
    if (!data) return null;
    const attrs = data.attributes ? JSON.stringify(data.attributes) : '';
    return [data.name, data.master_sku, data.description, attrs].filter(Boolean).join(' ');
  }

  if (entityType === 'catalog.categories') {
    const { data } = await (db as any).schema('catalog').from('categories').select('name').eq('id', entityId).single();
    return data?.name ?? null;
  }

  if (entityType === 'app.tenant_products') {
    const { data } = await (db as any)
      .schema('app').from('tenant_products')
      .select('name_override, internal_sku, attributes_override, master_product_id, tenant_brand_id, tenant_category_id, hsn_code')
      .eq('id', entityId)
      .single();
    if (!data) return null;

    let masterName = '';
    let masterAttrs = '';
    let brandName = '';
    let categoryName = '';
    if (data.master_product_id) {
      const { data: cp } = await (db as any).schema('catalog').from('products').select('name, attributes').eq('id', data.master_product_id).single();
      masterName  = cp?.name ?? '';
      masterAttrs = cp?.attributes ? JSON.stringify(cp.attributes) : '';
    }

    if (data.tenant_brand_id) {
      const { data: tb } = await (db as any)
        .schema('app').from('tenant_brands')
        .select('display_name_override, master_brand_id')
        .eq('id', data.tenant_brand_id)
        .single();
      if (tb?.display_name_override) {
        brandName = tb.display_name_override;
      } else if (tb?.master_brand_id) {
        const { data: cb } = await (db as any).schema('catalog').from('brands').select('name').eq('id', tb.master_brand_id).single();
        brandName = cb?.name ?? '';
      }
    }

    if (data.tenant_category_id) {
      const { data: tc } = await (db as any).schema('app').from('tenant_categories').select('name').eq('id', data.tenant_category_id).single();
      categoryName = tc?.name ?? '';
    }

    const attrs = data.attributes_override ? JSON.stringify(data.attributes_override) : masterAttrs;
    return [
      data.name_override ?? masterName,
      data.internal_sku,
      brandName,
      categoryName,
      data.hsn_code,
      attrs,
      masterAttrs,
    ].filter(Boolean).join(' ');
  }

  return null;
}

async function updateEmbedding(entityType: string, entityId: string, embedding: number[]): Promise<void> {
  const vec = `[${embedding.join(',')}]`;

  if (entityType === 'catalog.brands') {
    await (db as any).schema('catalog').from('brands').update({ embedding: vec }).eq('id', entityId);
  } else if (entityType === 'catalog.products') {
    await (db as any).schema('catalog').from('products').update({ embedding: vec }).eq('id', entityId);
  } else if (entityType === 'catalog.categories') {
    await (db as any).schema('catalog').from('categories').update({ embedding: vec }).eq('id', entityId);
  } else if (entityType === 'app.tenant_products') {
    await (db as any).schema('app').from('tenant_products').update({ embedding: vec }).eq('id', entityId);
  }
}

Deno.serve(async (_req: Request) => {
  if (!PROVIDER) {
    return Response.json({ skipped: true, reason: 'EMBEDDING_PROVIDER not set' });
  }

  try {
    const { data: rows, error } = await (db as any).rpc('dequeue_embeddings', { p_batch_size: 20 });
    if (error) throw error;

    const batch = (rows ?? []) as QueueRow[];
    if (batch.length === 0) {
      return Response.json({ processed: 0 });
    }

    let processed = 0;
    let failed = 0;

    for (const row of batch) {
      try {
        const text = await fetchEntityText(row.entity_type, row.entity_id);
        if (!text?.trim()) continue;

        const embedding = await getEmbedding(text.trim());
        await updateEmbedding(row.entity_type, row.entity_id, embedding);
        processed++;
      } catch (err) {
        console.error(`[embed] Failed ${row.entity_type}:${row.entity_id}:`, err);
        failed++;
      }
    }

    return Response.json({ processed, failed, total: batch.length });
  } catch (err) {
    console.error('[embed] Fatal error:', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
