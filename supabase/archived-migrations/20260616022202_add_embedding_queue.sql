-- Async embedding queue: tracks entities needing vector regeneration.
-- The generate-embeddings edge function dequeues and processes batches.
-- Only runs when EMBEDDING_PROVIDER env var is set (opt-in, flag-gated).

-- ── catalog.embedding_queue ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog.embedding_queue (
  id           bigserial    PRIMARY KEY,
  entity_type  text         NOT NULL, -- 'catalog.brands' | 'catalog.products' | 'catalog.categories' | 'app.tenant_products'
  entity_id    uuid         NOT NULL,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- Dedup: only one pending entry per entity at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_embedding_queue_pending
  ON catalog.embedding_queue(entity_type, entity_id)
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_embedding_queue_unprocessed
  ON catalog.embedding_queue(created_at)
  WHERE processed_at IS NULL;

-- ── Shared enqueue function ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION catalog.enqueue_embedding(p_entity_type text, p_entity_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO catalog.embedding_queue(entity_type, entity_id)
  VALUES (p_entity_type, p_entity_id)
  ON CONFLICT (entity_type, entity_id) WHERE processed_at IS NULL
  DO NOTHING;
END;
$$;

-- ── Trigger functions ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION catalog.brands_embedding_queue()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM catalog.enqueue_embedding('catalog.brands', NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION catalog.products_embedding_queue()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM catalog.enqueue_embedding('catalog.products', NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION catalog.categories_embedding_queue()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM catalog.enqueue_embedding('catalog.categories', NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION app.tenant_products_embedding_queue()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM catalog.enqueue_embedding('app.tenant_products', NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Attach triggers ───────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS brands_embedding_queue ON catalog.brands;
CREATE TRIGGER brands_embedding_queue
  AFTER INSERT OR UPDATE OF name, description ON catalog.brands
  FOR EACH ROW EXECUTE FUNCTION catalog.brands_embedding_queue();

DROP TRIGGER IF EXISTS products_embedding_queue ON catalog.products;
CREATE TRIGGER products_embedding_queue
  AFTER INSERT OR UPDATE OF name, master_sku, description, attributes ON catalog.products
  FOR EACH ROW EXECUTE FUNCTION catalog.products_embedding_queue();

DROP TRIGGER IF EXISTS categories_embedding_queue ON catalog.categories;
CREATE TRIGGER categories_embedding_queue
  AFTER INSERT OR UPDATE OF name ON catalog.categories
  FOR EACH ROW EXECUTE FUNCTION catalog.categories_embedding_queue();

DROP TRIGGER IF EXISTS tenant_products_embedding_queue ON app.tenant_products;
CREATE TRIGGER tenant_products_embedding_queue
  AFTER INSERT OR UPDATE OF name_override, internal_sku, attributes_override ON app.tenant_products
  FOR EACH ROW EXECUTE FUNCTION app.tenant_products_embedding_queue();

-- ── embedding column on app.tenant_products ───────────────────────────────────

ALTER TABLE app.tenant_products ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_tenant_products_embedding
  ON app.tenant_products USING HNSW(embedding vector_cosine_ops);

-- ── Dequeue function for edge function consumption ────────────────────────────

CREATE OR REPLACE FUNCTION app.dequeue_embeddings(p_batch_size int DEFAULT 20)
RETURNS TABLE (
  id          bigint,
  entity_type text,
  entity_id   uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = catalog, app, public
AS $$
BEGIN
  RETURN QUERY
  UPDATE catalog.embedding_queue q
  SET processed_at = now()
  FROM (
    SELECT eq.id
    FROM catalog.embedding_queue eq
    WHERE eq.processed_at IS NULL
    ORDER BY eq.created_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ) selected
  WHERE q.id = selected.id
  RETURNING q.id, q.entity_type, q.entity_id;
END;
$$;

GRANT EXECUTE ON FUNCTION app.dequeue_embeddings(int) TO service_role;

-- ── pg_cron scheduling (manual step — requires EDGE_FN_URL to be known) ──────
-- After deploying the generate-embeddings edge function, run:
--
--   SELECT cron.schedule(
--     'embed-queue',
--     '*/5 * * * *',
--     $$
--       SELECT net.http_post(
--         url := '<YOUR_SUPABASE_URL>/functions/v1/generate-embeddings',
--         headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
--         body := '{}'::jsonb
--       );
--     $$
--   );
--
-- This is intentionally not automated here because the URL and key are secrets.
