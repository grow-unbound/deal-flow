-- app.trg_order_buyer_cohort_refresh (fires app.evaluate_buyer_for_cohorts on
-- every order INSERT and on UPDATE of status/total_amount/placed_at) was the
-- one dispatch-style trigger on app.orders NOT gated by the sync-bypass GUC
-- (app.integration_sync_bypass_triggers / app.sync_trigger_bypass_active()) —
-- every other heavy dispatch/snapshot-refresh trigger already checks it (see
-- app.dispatch_from_orders for the established pattern). During bulk Zoho
-- sync this meant every synced-in order re-evaluated cohort membership for
-- its buyer, unconditionally.
CREATE OR REPLACE FUNCTION app.trg_order_buyer_cohort_refresh()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' OR (
    TG_OP = 'UPDATE' AND (
      NEW.status        IS DISTINCT FROM OLD.status OR
      NEW.total_amount  IS DISTINCT FROM OLD.total_amount OR
      NEW.placed_at     IS DISTINCT FROM OLD.placed_at
    )
  ) THEN
    PERFORM app.evaluate_buyer_for_cohorts(NEW.buyer_id);
  END IF;
  RETURN NEW;
END;
$function$;
