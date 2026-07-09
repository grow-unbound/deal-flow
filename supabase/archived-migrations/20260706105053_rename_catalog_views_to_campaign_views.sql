-- Rename catalog_views → campaign_views and add daily open dedupe (one row per buyer+campaign+UTC day).

DO $$
BEGIN
  IF to_regclass('app.catalog_views') IS NOT NULL AND to_regclass('app.campaign_views') IS NULL THEN
    ALTER TABLE app.catalog_views RENAME TO campaign_views;
  END IF;
END $$;

-- Some environments still have catalog_id from pre-rename schemas.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'campaign_views'
      AND column_name = 'catalog_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'campaign_views'
      AND column_name = 'campaign_id'
  ) THEN
    ALTER TABLE app.campaign_views RENAME COLUMN catalog_id TO campaign_id;
  END IF;
END $$;

ALTER INDEX IF EXISTS app.idx_catalog_views_tenant_buyer_viewed
  RENAME TO idx_campaign_views_tenant_buyer_viewed;

ALTER INDEX IF EXISTS app.idx_catalog_views_catalog_id
  RENAME TO idx_campaign_views_campaign_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app'
      AND c.relname = 'campaign_views'
      AND t.tgname = 'catalog_views_updated_at'
      AND NOT t.tgisinternal
  ) THEN
    ALTER TRIGGER catalog_views_updated_at ON app.campaign_views
      RENAME TO campaign_views_updated_at;
  END IF;
END $$;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'app'
      AND tablename = 'campaign_views'
      AND policyname LIKE 'catalog_views\_%'
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON app.campaign_views RENAME TO %I',
      pol.policyname,
      replace(pol.policyname, 'catalog_views_', 'campaign_views_')
    );
  END LOOP;
END $$;

ALTER TABLE app.campaign_views
  ADD COLUMN IF NOT EXISTS view_date date;

UPDATE app.campaign_views
SET view_date = (viewed_at AT TIME ZONE 'UTC')::date
WHERE view_date IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'campaign_views'
      AND column_name = 'view_date'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE app.campaign_views
      ALTER COLUMN view_date SET NOT NULL,
      ALTER COLUMN view_date SET DEFAULT (timezone('UTC', now()))::date;
  END IF;
END $$;

-- Collapse duplicate same-day rows before adding the unique index.
DELETE FROM app.campaign_views cv
USING app.campaign_views newer
WHERE cv.id < newer.id
  AND cv.tenant_id = newer.tenant_id
  AND cv.buyer_id = newer.buyer_id
  AND cv.campaign_id = newer.campaign_id
  AND cv.view_date = newer.view_date
  AND cv.deleted_at IS NULL
  AND newer.deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_views_daily_unique
  ON app.campaign_views (tenant_id, buyer_id, campaign_id, view_date)
  WHERE deleted_at IS NULL;
