-- EP-17-005: sales order detail lifecycle timestamps, dispatch metadata, cancel + inventory release.

ALTER TABLE app.orders
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS carrier text,
  ADD COLUMN IF NOT EXISTS dispatch_notes text,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS tally_export_id uuid,
  ADD COLUMN IF NOT EXISTS tally_exported_at timestamptz;

-- Best-effort backfill: received aligns with placed for non-draft orders.
UPDATE app.orders
SET received_at = placed_at
WHERE received_at IS NULL
  AND placed_at IS NOT NULL
  AND deleted_at IS NULL
  AND status <> 'draft';

-- Placeholder: inventory is not decremented on confirm in current schema; restoring qty here
-- would inflate stock. Wire real reservation + release when order confirmation reserves inventory.
CREATE OR REPLACE FUNCTION app.release_order_reservation(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM app.orders o
    WHERE o.id = p_order_id
      AND o.deleted_at IS NULL
      AND o.status = 'cancelled'
  )
  INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'order_not_cancelled_or_missing' USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'reservation_not_implemented');
END;
$$;

REVOKE ALL ON FUNCTION app.release_order_reservation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.release_order_reservation(uuid) FROM anon;
REVOKE ALL ON FUNCTION app.release_order_reservation(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.release_order_reservation(uuid) TO service_role;
