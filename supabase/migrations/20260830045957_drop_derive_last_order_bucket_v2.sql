-- Found during the post-drop v2 inventory check (20260830043129 dropped
-- 19 functions; this one didn't surface in the original migration-text
-- grep because of how it was defined, only showed up scanning live
-- pg_proc for anything still named %v2%).
--
-- app.derive_last_order_bucket_v2(timestamptz) -- confirmed zero
-- references anywhere: no app/src caller, no other live function calls
-- it, no trigger uses it, no column default uses it, no view depends on
-- it. Fully orphaned.

DROP FUNCTION IF EXISTS app.derive_last_order_bucket_v2(p_last_order_at timestamp with time zone);
