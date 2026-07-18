BEGIN;

SELECT set_config('app.integration_sync_bypass_triggers', 'on', true);

UPDATE app.buyers
SET
  is_active = true,
  buyer_app_enabled = true,
  updated_at = now(),
  deleted_at = NULL
WHERE tenant_id = metrics_v2_phase1a.uuid_for('tenant')
  AND external_ref LIKE 'phase1a-buyer-%';

UPDATE app.tenant_products
SET
  name_override = 'Phase1A Product ' || right(internal_sku, 4)::int::text,
  is_active = true,
  updated_at = now(),
  deleted_at = NULL
WHERE tenant_id = metrics_v2_phase1a.uuid_for('tenant')
  AND external_ref LIKE 'phase1a-tenant-product-%';

UPDATE app.tenant_inventory inv
SET
  qty_available = 100 + ((right(tp.internal_sku, 4)::int * right(w.external_ref, 1)::int) % 900),
  qty_reserved = (right(tp.internal_sku, 4)::int + right(w.external_ref, 1)::int) % 25,
  reorder_point = 25,
  updated_at = now(),
  deleted_at = NULL
FROM app.tenant_products tp,
     app.warehouses w
WHERE inv.tenant_product_id = tp.id
  AND inv.warehouse_id = w.id
  AND tp.tenant_id = metrics_v2_phase1a.uuid_for('tenant')
  AND tp.external_ref LIKE 'phase1a-tenant-product-%'
  AND w.external_ref LIKE 'phase1a-warehouse-%';

UPDATE app.orders
SET
  status = CASE WHEN right(external_ref, length(external_ref) - 14)::int % 11 = 0 THEN 'cancelled'
                WHEN right(external_ref, length(external_ref) - 14)::int % 5 = 0 THEN 'delivered'
                WHEN right(external_ref, length(external_ref) - 14)::int % 3 = 0 THEN 'confirmed'
                ELSE 'received' END,
  notes = NULL,
  freight = 0,
  updated_at = now(),
  deleted_at = NULL
WHERE tenant_id = metrics_v2_phase1a.uuid_for('tenant')
  AND external_ref LIKE 'phase1a-order-%';

UPDATE app.estimates
SET
  status = CASE WHEN right(external_ref, length(external_ref) - 17)::int % 7 = 0 THEN 'converted'
                WHEN right(external_ref, length(external_ref) - 17)::int % 5 = 0 THEN 'expired'
                WHEN right(external_ref, length(external_ref) - 17)::int % 3 = 0 THEN 'sent'
                ELSE 'draft' END,
  notes = NULL,
  freight = 0,
  updated_at = now(),
  deleted_at = NULL
WHERE tenant_id = metrics_v2_phase1a.uuid_for('tenant')
  AND external_ref LIKE 'phase1a-estimate-%';

UPDATE app.invoices
SET
  status = CASE WHEN right(external_ref, length(external_ref) - 16)::int % 11 = 0 THEN 'void'
                WHEN right(external_ref, length(external_ref) - 16)::int % 5 = 0 THEN 'paid'
                WHEN right(external_ref, length(external_ref) - 16)::int % 3 = 0 THEN 'partially_paid'
                ELSE 'sent' END,
  notes = NULL,
  freight = 0,
  outstanding_balance = CASE WHEN right(external_ref, length(external_ref) - 16)::int % 5 = 0
                                  OR right(external_ref, length(external_ref) - 16)::int % 11 = 0
                             THEN 0
                             ELSE total_amount END,
  amount_paid = CASE WHEN right(external_ref, length(external_ref) - 16)::int % 5 = 0 THEN total_amount ELSE 0 END,
  updated_at = now(),
  deleted_at = NULL
WHERE tenant_id = metrics_v2_phase1a.uuid_for('tenant')
  AND external_ref LIKE 'phase1a-invoice-%';

DELETE FROM app.audit_log
WHERE tenant_id = metrics_v2_phase1a.uuid_for('tenant')
  AND ts > now() - interval '2 days';

DELETE FROM app.integration_sync_jobs
WHERE tenant_id = metrics_v2_phase1a.uuid_for('tenant')
  AND external_ref LIKE 'phase1a-run-%';

UPDATE app.integration_sync_jobs
SET
  status = 'completed',
  progress = jsonb_build_object('phase1a_seed_lines', 250000),
  summary = jsonb_build_object('phase1a_reset_at', now()),
  updated_at = now(),
  deleted_at = NULL
WHERE tenant_id = metrics_v2_phase1a.uuid_for('tenant')
  AND external_ref = 'phase1a-checkpoint';

SELECT set_config('app.integration_sync_bypass_triggers', 'off', true);

COMMIT;
