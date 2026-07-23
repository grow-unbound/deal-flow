CREATE OR REPLACE FUNCTION app.set_is_buyer_app_estimate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.is_buyer_app_estimate := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.is_buyer_app_estimate, false) ELSE false END
    OR COALESCE(NEW.is_buyer_app_estimate, false)
    OR (NEW.source = 'buyer_app');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.set_is_buyer_app_order()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.is_buyer_app_order := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.is_buyer_app_order, false) ELSE false END
    OR COALESCE(NEW.is_buyer_app_order, false)
    OR (NEW.source = 'buyer_app')
    OR (NEW.estimate_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM app.estimates e
          WHERE e.id = NEW.estimate_id AND e.is_buyer_app_estimate
        ));
  RETURN NEW;
END;
$$;
