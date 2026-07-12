-- Each reco_run_all_* / reco_refresh_category_intelligence loops every active
-- tenant inside ONE transaction with no per-tenant exception handling — one
-- bad or oversized tenant throws and aborts the whole daily/weekly batch for
-- every other tenant too, and holds locks on invoice_items/orders joins for
-- as long as the failing computation ran before erroring. Wrap each
-- iteration so a single tenant's failure is logged and skipped, not fatal to
-- the run.
CREATE OR REPLACE FUNCTION app.reco_refresh_category_intelligence()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM app.tenants WHERE status = 'active' LOOP
    BEGIN
      PERFORM app.reco_compute_category_profiles(t.id);
      PERFORM app.reco_compute_category_associations(t.id, 90);
      PERFORM app.reco_suggest_bundles(t.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'reco_refresh_category_intelligence failed for tenant %: %', t.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

ALTER FUNCTION app.reco_refresh_category_intelligence() OWNER TO postgres;

CREATE OR REPLACE FUNCTION app.reco_run_all_associations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM app.tenants WHERE status = 'active' LOOP
    BEGIN
      PERFORM app.reco_compute_associations(t.id, 90);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'reco_run_all_associations failed for tenant %: %', t.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

ALTER FUNCTION app.reco_run_all_associations() OWNER TO postgres;

CREATE OR REPLACE FUNCTION app.reco_run_all_buyer_profiles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM app.tenants WHERE status = 'active' LOOP
    BEGIN
      PERFORM app.reco_refresh_buyer_profiles(t.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'reco_run_all_buyer_profiles failed for tenant %: %', t.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

ALTER FUNCTION app.reco_run_all_buyer_profiles() OWNER TO postgres;

CREATE OR REPLACE FUNCTION app.reco_run_all_popularity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM app.tenants WHERE status = 'active' LOOP
    BEGIN
      PERFORM app.reco_compute_popularity(t.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'reco_run_all_popularity failed for tenant %: %', t.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

ALTER FUNCTION app.reco_run_all_popularity() OWNER TO postgres;
