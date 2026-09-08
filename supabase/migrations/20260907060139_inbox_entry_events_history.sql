-- Yukti Inbox: merged event history for a buyer, across all their entries.
CREATE OR REPLACE FUNCTION app.list_entry_events_for_buyer(
  p_tenant_id uuid,
  p_buyer_id uuid,
  p_limit integer DEFAULT 200
) RETURNS TABLE (
  id uuid,
  entry_id uuid,
  entry_type text,
  action text,
  from_status text,
  to_status text,
  note text,
  actor_id uuid,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT
    ee.id,
    ee.entry_id,
    e.entry_type,
    ee.action,
    ee.from_status,
    ee.to_status,
    ee.note,
    ee.actor_user_id AS actor_id,
    ee.created_at
  FROM app.entry_events ee
  JOIN app.entries e ON e.id = ee.entry_id
  WHERE e.tenant_id = p_tenant_id
    AND e.buyer_id = p_buyer_id
    AND e.deleted_at IS NULL
    AND ee.deleted_at IS NULL
  ORDER BY ee.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
$$;
