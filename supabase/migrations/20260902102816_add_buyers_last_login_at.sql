-- Pure observability column, stamped in mintBuyerSession on every successful
-- buyer login. Feeds recency tracking now that buyer_app_enabled defaults on
-- for known buyers (no longer a proxy for "have they ever logged in").
ALTER TABLE app.buyers ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
