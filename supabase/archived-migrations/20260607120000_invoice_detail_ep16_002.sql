-- EP-16-002: invoice detail — payment reference, inventory hold stub RPC.

ALTER TABLE app.invoices
  ADD COLUMN IF NOT EXISTS payment_reference text;

COMMENT ON COLUMN app.invoices.payment_reference IS 'Optional reference when marking invoice paid (e.g. UPI ref).';

CREATE OR REPLACE FUNCTION app.reserve_inventory_for_invoice(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  -- Stub: real reservation when inventory_hold_point = invoice ships with inventory module.
  PERFORM 1 FROM app.invoices WHERE id = p_invoice_id AND deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION app.reserve_inventory_for_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_inventory_for_invoice(uuid) TO service_role;
