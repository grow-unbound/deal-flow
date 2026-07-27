-- Small, high-churn tables where autovacuum never ran (default scale factor of 20%
-- of table size never triggers on low-row-count tables): otp_sessions (46% dead),
-- estimates_snapshot (96%), kpi_warehouse_daily (95%), campaign_views (86%),
-- tenant_integrations (97%), whatsapp_templates (70%), locations (74%), etc.
ALTER TABLE app.otp_sessions SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 20);
ALTER TABLE app.integration_webhook_echo_guards SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 20);
ALTER TABLE app.estimates_snapshot SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 20);
ALTER TABLE app.kpi_warehouse_daily SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 20);
ALTER TABLE app.campaign_views SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 20);
ALTER TABLE app.tenant_integrations SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 20);
ALTER TABLE app.whatsapp_templates SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 20);
ALTER TABLE app.locations SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 20);
ALTER TABLE app.tenant_categories SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 20);
ALTER TABLE app.kpi_orders_daily SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 20);
ALTER TABLE app.kpi_invoices_daily SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 20);
