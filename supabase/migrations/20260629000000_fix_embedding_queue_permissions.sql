-- Ensure trigger-based embedding queue inserts can run under authenticated/seller roles.
-- The queue table uses a bigserial id, so the insert must execute with definer
-- privileges instead of the caller's role.

CREATE OR REPLACE FUNCTION catalog.enqueue_embedding(p_entity_type text, p_entity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = catalog, public
AS $$
BEGIN
  INSERT INTO catalog.embedding_queue(entity_type, entity_id)
  VALUES (p_entity_type, p_entity_id)
  ON CONFLICT (entity_type, entity_id) WHERE processed_at IS NULL
  DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION catalog.enqueue_embedding(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION catalog.enqueue_embedding(text, uuid) TO service_role;
