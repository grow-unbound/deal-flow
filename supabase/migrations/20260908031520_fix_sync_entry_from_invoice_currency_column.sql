-- app.sync_entry_from_invoice referenced app.invoices.currency, which doesn't
-- exist (only app.estimates and app.orders have a currency column) — every
-- invoice_due/invoice_overdue entry generation failed with
-- "record v_invoice has no field currency". Product is India-only, so
-- hardcode 'INR' rather than adding an unused column.

CREATE OR REPLACE FUNCTION app.sync_entry_from_invoice(p_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_invoice app.invoices%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_due_day date;
  v_days integer;
  v_entry_type text;
  v_aging_tier text;
BEGIN
  SELECT * INTO v_invoice
  FROM app.invoices
  WHERE id = p_invoice_id
    AND deleted_at IS NULL;

  IF v_invoice.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT app.invoice_status_has_receivable(v_invoice.status, v_invoice.outstanding_balance)
    OR v_invoice.due_date IS NULL THEN
    PERFORM app.resolve_entries_for_source(v_invoice.tenant_id, 'invoice_due', 'invoice', ARRAY[v_invoice.id], 'auto_resolved');
    PERFORM app.resolve_entries_for_source(v_invoice.tenant_id, 'invoice_overdue', 'invoice', ARRAY[v_invoice.id], 'auto_resolved');
    RETURN NULL;
  END IF;

  v_due_day := (v_invoice.due_date AT TIME ZONE 'Asia/Kolkata')::date;
  v_days := v_due_day - v_today;

  IF v_days BETWEEN 0 AND 7 THEN
    v_entry_type := 'invoice_due';
    PERFORM app.resolve_entries_for_source(v_invoice.tenant_id, 'invoice_overdue', 'invoice', ARRAY[v_invoice.id], 'auto_resolved');
  ELSIF v_days < 0 THEN
    v_entry_type := 'invoice_overdue';
    PERFORM app.resolve_entries_for_source(v_invoice.tenant_id, 'invoice_due', 'invoice', ARRAY[v_invoice.id], 'auto_resolved');
  ELSE
    PERFORM app.resolve_entries_for_source(v_invoice.tenant_id, 'invoice_due', 'invoice', ARRAY[v_invoice.id], 'auto_resolved');
    PERFORM app.resolve_entries_for_source(v_invoice.tenant_id, 'invoice_overdue', 'invoice', ARRAY[v_invoice.id], 'auto_resolved');
    RETURN NULL;
  END IF;

  v_aging_tier := CASE
    WHEN v_days >= 0 THEN 'due_soon'
    WHEN abs(v_days) <= 7 THEN '1-7d'
    WHEN abs(v_days) <= 15 THEN '8-15d'
    WHEN abs(v_days) <= 30 THEN '16-30d'
    ELSE '30d+'
  END;

  RETURN app.upsert_entry(
    v_invoice.tenant_id,
    v_entry_type,
    'backend',
    'invoice',
    v_invoice.id,
    v_invoice.buyer_id,
    v_invoice.location_id,
    COALESCE(v_invoice.due_date, v_invoice.created_at, now()),
    jsonb_build_object(
      'invoice_number', v_invoice.invoice_number,
      'status', v_invoice.status,
      'amount', v_invoice.outstanding_balance,
      'total_amount', v_invoice.total_amount,
      'currency', 'INR',
      'due_date', v_invoice.due_date,
      'days_from_due', v_days,
      'aging_tier', v_aging_tier,
      'last_reminder_at', v_invoice.last_reminder_at
    ),
    'not_required',
    v_invoice.created_by
  );
END;
$$;
