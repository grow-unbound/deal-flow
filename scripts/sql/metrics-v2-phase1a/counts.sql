SELECT
  (SELECT count(*) FROM app.buyers WHERE tenant_id = metrics_v2_phase1a.uuid_for('tenant')) AS buyers,
  (SELECT count(*) FROM app.tenant_products WHERE tenant_id = metrics_v2_phase1a.uuid_for('tenant')) AS tenant_products,
  (SELECT count(*) FROM app.orders WHERE tenant_id = metrics_v2_phase1a.uuid_for('tenant')) AS orders,
  (SELECT count(*) FROM app.estimates WHERE tenant_id = metrics_v2_phase1a.uuid_for('tenant')) AS estimates,
  (SELECT count(*) FROM app.invoices WHERE tenant_id = metrics_v2_phase1a.uuid_for('tenant')) AS invoices,
  (SELECT count(*) FROM app.order_items oi JOIN app.orders o ON o.id = oi.order_id WHERE o.tenant_id = metrics_v2_phase1a.uuid_for('tenant')) AS order_items,
  (SELECT count(*) FROM app.estimate_items ei JOIN app.estimates e ON e.id = ei.estimate_id WHERE e.tenant_id = metrics_v2_phase1a.uuid_for('tenant')) AS estimate_items,
  (SELECT count(*) FROM app.invoice_items ii JOIN app.invoices i ON i.id = ii.invoice_id WHERE i.tenant_id = metrics_v2_phase1a.uuid_for('tenant')) AS invoice_items;
