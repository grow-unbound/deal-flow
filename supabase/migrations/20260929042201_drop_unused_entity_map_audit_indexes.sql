-- Drop unused audit-column FK helper indexes on the high-churn Zoho entity map.
-- Prod evidence before drop (2026-09-29): both indexes had 0 scans; combined size ~4.6 MB.
-- FK checks on auth.users(id) use the referenced table's PK, so these child-side indexes
-- only help queries filtering by created_by/updated_by, which production has not used.

DROP INDEX IF EXISTS app.idx_integration_entity_map_created_by;
DROP INDEX IF EXISTS app.idx_integration_entity_map_updated_by;
