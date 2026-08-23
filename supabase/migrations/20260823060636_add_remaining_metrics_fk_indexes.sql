-- Perf: remaining 124 of the 129 unindexed foreign keys flagged by the
-- Supabase performance advisor (the other 5, on the buyer-critical path,
-- were done separately in 20260823054159_add_missing_fk_indexes_buyer_critical.sql).
-- Mostly metrics_* tables' created_by/updated_by/tenant_id/buyer_id/
-- location_id/warehouse_id FKs, plus a handful of catalog.*_images and
-- integration_* tables. Statements generated from a live query against
-- pg_constraint/pg_index (not hand-transcribed) to guarantee the exact
-- column list and avoid typos across 124 statements; verified count and
-- column lists against the original Supabase advisor dump before writing.
--
-- Plain CREATE INDEX (not CONCURRENTLY) -- all of these tables are small
-- at current scale (largest is a few thousand rows), so the brief write
-- lock is negligible, and CONCURRENTLY can't run inside the transaction
-- Supabase's migration runner wraps each file in.

CREATE INDEX IF NOT EXISTS idx_campaign_items_tenant_product_id ON app.campaign_items (tenant_product_id);
CREATE INDEX IF NOT EXISTS idx_campaign_views_buyer_id ON app.campaign_views (buyer_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_otps_tenant_id ON app.email_verification_otps (tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_analytics_events_tenant_integration_id ON app.integration_analytics_events (tenant_integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_analytics_events_tenant_integration_id_tenant_id ON app.integration_analytics_events (tenant_integration_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_oauth_states_requested_by ON app.integration_oauth_states (requested_by);
CREATE INDEX IF NOT EXISTS idx_integration_oauth_states_tenant_id ON app.integration_oauth_states (tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_webhook_echo_guards_created_by ON app.integration_webhook_echo_guards (created_by);
CREATE INDEX IF NOT EXISTS idx_integration_webhook_echo_guards_tenant_id ON app.integration_webhook_echo_guards (tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_webhook_echo_guards_updated_by ON app.integration_webhook_echo_guards (updated_by);
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_created_by ON app.integration_webhooks (created_by);
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_tenant_integration_id_tenant_id ON app.integration_webhooks (tenant_integration_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_updated_by ON app.integration_webhooks (updated_by);
CREATE INDEX IF NOT EXISTS idx_kpi_warehouse_daily_warehouse_id ON app.kpi_warehouse_daily (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_metrics_brand_now_summary_created_by ON app.metrics_brand_now_summary (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_brand_now_summary_tenant_brand_id ON app.metrics_brand_now_summary (tenant_brand_id);
CREATE INDEX IF NOT EXISTS idx_metrics_brand_now_summary_updated_by ON app.metrics_brand_now_summary (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_brand_period_summary_created_by ON app.metrics_brand_period_summary (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_brand_period_summary_tenant_brand_id ON app.metrics_brand_period_summary (tenant_brand_id);
CREATE INDEX IF NOT EXISTS idx_metrics_brand_period_summary_updated_by ON app.metrics_brand_period_summary (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_buyer_location_snapshot_buyer_id ON app.metrics_buyer_location_snapshot (buyer_id);
CREATE INDEX IF NOT EXISTS idx_metrics_buyer_location_snapshot_created_by ON app.metrics_buyer_location_snapshot (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_buyer_location_snapshot_location_id ON app.metrics_buyer_location_snapshot (location_id);
CREATE INDEX IF NOT EXISTS idx_metrics_buyer_location_snapshot_updated_by ON app.metrics_buyer_location_snapshot (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_buyer_now_summary_buyer_id ON app.metrics_buyer_now_summary (buyer_id);
CREATE INDEX IF NOT EXISTS idx_metrics_buyer_now_summary_created_by ON app.metrics_buyer_now_summary (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_buyer_now_summary_updated_by ON app.metrics_buyer_now_summary (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_buyer_period_summary_buyer_id ON app.metrics_buyer_period_summary (buyer_id);
CREATE INDEX IF NOT EXISTS idx_metrics_buyer_period_summary_created_by ON app.metrics_buyer_period_summary (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_buyer_period_summary_updated_by ON app.metrics_buyer_period_summary (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_buyer_snapshot_buyer_id ON app.metrics_buyer_snapshot (buyer_id);
CREATE INDEX IF NOT EXISTS idx_metrics_buyer_snapshot_created_by ON app.metrics_buyer_snapshot (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_buyer_snapshot_updated_by ON app.metrics_buyer_snapshot (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_campaign_period_summary_campaign_id ON app.metrics_campaign_period_summary (campaign_id);
CREATE INDEX IF NOT EXISTS idx_metrics_campaign_period_summary_created_by ON app.metrics_campaign_period_summary (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_campaign_period_summary_updated_by ON app.metrics_campaign_period_summary (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_category_now_summary_created_by ON app.metrics_category_now_summary (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_category_now_summary_tenant_category_id ON app.metrics_category_now_summary (tenant_category_id);
CREATE INDEX IF NOT EXISTS idx_metrics_category_now_summary_updated_by ON app.metrics_category_now_summary (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_category_period_summary_created_by ON app.metrics_category_period_summary (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_category_period_summary_tenant_category_id ON app.metrics_category_period_summary (tenant_category_id);
CREATE INDEX IF NOT EXISTS idx_metrics_category_period_summary_updated_by ON app.metrics_category_period_summary (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_cohort_period_summary_cohort_id ON app.metrics_cohort_period_summary (cohort_id);
CREATE INDEX IF NOT EXISTS idx_metrics_cohort_period_summary_created_by ON app.metrics_cohort_period_summary (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_cohort_period_summary_updated_by ON app.metrics_cohort_period_summary (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_execution_history_tenant_id ON app.metrics_execution_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_metrics_landing_kpi_snapshot_created_by ON app.metrics_landing_kpi_snapshot (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_landing_kpi_snapshot_updated_by ON app.metrics_landing_kpi_snapshot (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_location_daily_created_by ON app.metrics_location_daily (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_location_daily_location_id ON app.metrics_location_daily (location_id);
CREATE INDEX IF NOT EXISTS idx_metrics_location_daily_updated_by ON app.metrics_location_daily (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_location_now_summary_created_by ON app.metrics_location_now_summary (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_location_now_summary_location_id ON app.metrics_location_now_summary (location_id);
CREATE INDEX IF NOT EXISTS idx_metrics_location_now_summary_updated_by ON app.metrics_location_now_summary (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_location_period_summary_created_by ON app.metrics_location_period_summary (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_location_period_summary_location_id ON app.metrics_location_period_summary (location_id);
CREATE INDEX IF NOT EXISTS idx_metrics_location_period_summary_updated_by ON app.metrics_location_period_summary (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_location_snapshot_created_by ON app.metrics_location_snapshot (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_location_snapshot_location_id ON app.metrics_location_snapshot (location_id);
CREATE INDEX IF NOT EXISTS idx_metrics_location_snapshot_updated_by ON app.metrics_location_snapshot (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_price_lists_now_summary_created_by ON app.metrics_price_lists_now_summary (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_price_lists_now_summary_price_list_id ON app.metrics_price_lists_now_summary (price_list_id);
CREATE INDEX IF NOT EXISTS idx_metrics_price_lists_now_summary_updated_by ON app.metrics_price_lists_now_summary (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_product_location_snapshot_created_by ON app.metrics_product_location_snapshot (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_product_location_snapshot_location_id ON app.metrics_product_location_snapshot (location_id);
CREATE INDEX IF NOT EXISTS idx_metrics_product_location_snapshot_tenant_product_id ON app.metrics_product_location_snapshot (tenant_product_id);
CREATE INDEX IF NOT EXISTS idx_metrics_product_location_snapshot_updated_by ON app.metrics_product_location_snapshot (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_product_period_summary_created_by ON app.metrics_product_period_summary (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_product_period_summary_tenant_product_id ON app.metrics_product_period_summary (tenant_product_id);
CREATE INDEX IF NOT EXISTS idx_metrics_product_period_summary_updated_by ON app.metrics_product_period_summary (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_tenant_buyer_app_snapshot_created_by ON app.metrics_tenant_buyer_app_snapshot (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_tenant_buyer_app_snapshot_updated_by ON app.metrics_tenant_buyer_app_snapshot (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_tenant_commercial_snapshot_created_by ON app.metrics_tenant_commercial_snapshot (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_tenant_commercial_snapshot_updated_by ON app.metrics_tenant_commercial_snapshot (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_tenant_daily_created_by ON app.metrics_tenant_daily (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_tenant_daily_updated_by ON app.metrics_tenant_daily (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_tenant_inventory_snapshot_created_by ON app.metrics_tenant_inventory_snapshot (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_tenant_inventory_snapshot_updated_by ON app.metrics_tenant_inventory_snapshot (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_tenant_now_summary_created_by ON app.metrics_tenant_now_summary (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_tenant_now_summary_updated_by ON app.metrics_tenant_now_summary (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_tenant_period_summary_created_by ON app.metrics_tenant_period_summary (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_tenant_period_summary_updated_by ON app.metrics_tenant_period_summary (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_tenant_setup_snapshot_created_by ON app.metrics_tenant_setup_snapshot (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_tenant_setup_snapshot_updated_by ON app.metrics_tenant_setup_snapshot (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_warehouse_now_summary_created_by ON app.metrics_warehouse_now_summary (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_warehouse_now_summary_updated_by ON app.metrics_warehouse_now_summary (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_warehouse_now_summary_warehouse_id ON app.metrics_warehouse_now_summary (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_metrics_warehouse_period_summary_created_by ON app.metrics_warehouse_period_summary (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_warehouse_period_summary_updated_by ON app.metrics_warehouse_period_summary (updated_by);
CREATE INDEX IF NOT EXISTS idx_metrics_warehouse_period_summary_warehouse_id ON app.metrics_warehouse_period_summary (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_platform_admins_created_by ON app.platform_admins (created_by);
CREATE INDEX IF NOT EXISTS idx_reco_bundle_slots_tenant_category_id ON app.reco_bundle_slots (tenant_category_id);
CREATE INDEX IF NOT EXISTS idx_reco_bundle_suggestions_reviewed_by ON app.reco_bundle_suggestions (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_reco_bundles_created_by ON app.reco_bundles (created_by);
CREATE INDEX IF NOT EXISTS idx_reco_buyer_profiles_buyer_id ON app.reco_buyer_profiles (buyer_id);
CREATE INDEX IF NOT EXISTS idx_reco_category_associations_category_a_id ON app.reco_category_associations (category_a_id);
CREATE INDEX IF NOT EXISTS idx_reco_category_associations_category_b_id ON app.reco_category_associations (category_b_id);
CREATE INDEX IF NOT EXISTS idx_reco_category_profiles_tenant_category_id ON app.reco_category_profiles (tenant_category_id);
CREATE INDEX IF NOT EXISTS idx_reco_product_associations_product_a_id ON app.reco_product_associations (product_a_id);
CREATE INDEX IF NOT EXISTS idx_reco_product_associations_product_b_id ON app.reco_product_associations (product_b_id);
CREATE INDEX IF NOT EXISTS idx_reco_product_popularity_tenant_product_id ON app.reco_product_popularity (tenant_product_id);
CREATE INDEX IF NOT EXISTS idx_tenant_categories_created_by ON app.tenant_categories (created_by);
CREATE INDEX IF NOT EXISTS idx_tenant_categories_updated_by ON app.tenant_categories (updated_by);
CREATE INDEX IF NOT EXISTS idx_tenant_category_images_created_by ON app.tenant_category_images (created_by);
CREATE INDEX IF NOT EXISTS idx_tenant_category_images_updated_by ON app.tenant_category_images (updated_by);
CREATE INDEX IF NOT EXISTS idx_tenant_field_mappings_created_by ON app.tenant_field_mappings (created_by);
CREATE INDEX IF NOT EXISTS idx_tenant_field_mappings_updated_by ON app.tenant_field_mappings (updated_by);
CREATE INDEX IF NOT EXISTS idx_tenant_settings_updated_by ON app.tenant_settings (updated_by);
CREATE INDEX IF NOT EXISTS idx_user_profiles_created_by ON app.user_profiles (created_by);
CREATE INDEX IF NOT EXISTS idx_user_profiles_updated_by ON app.user_profiles (updated_by);
CREATE INDEX IF NOT EXISTS idx_whatsapp_broadcasts_linked_campaign_id ON app.whatsapp_broadcasts (linked_campaign_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_broadcasts_whatsapp_template_id ON app.whatsapp_broadcasts (whatsapp_template_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_credit_transactions_related_message_id ON app.whatsapp_credit_transactions (related_message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_send_queue_whatsapp_message_id ON app.whatsapp_send_queue (whatsapp_message_id);
CREATE INDEX IF NOT EXISTS idx_brand_images_contributed_by_tenant_id ON catalog.brand_images (contributed_by_tenant_id);
CREATE INDEX IF NOT EXISTS idx_brand_images_created_by ON catalog.brand_images (created_by);
CREATE INDEX IF NOT EXISTS idx_brand_images_updated_by ON catalog.brand_images (updated_by);
CREATE INDEX IF NOT EXISTS idx_category_images_created_by ON catalog.category_images (created_by);
CREATE INDEX IF NOT EXISTS idx_category_images_updated_by ON catalog.category_images (updated_by);
CREATE INDEX IF NOT EXISTS idx_integration_types_created_by ON catalog.integration_types (created_by);
CREATE INDEX IF NOT EXISTS idx_integration_types_updated_by ON catalog.integration_types (updated_by);
CREATE INDEX IF NOT EXISTS idx_product_images_contributed_by_tenant_id ON catalog.product_images (contributed_by_tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_images_created_by ON catalog.product_images (created_by);
CREATE INDEX IF NOT EXISTS idx_product_images_updated_by ON catalog.product_images (updated_by);
