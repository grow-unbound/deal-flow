-- Buyer access-request approval: customer group + price list assignment, admin-only, Zoho contact push.
--
-- 1. app.approve_buyer_access_entry(): ONE transaction = entry resolved + buyer approved
--    + (manual) cohort membership + buyer-level price list assignment + entry_events audit.
--    Idempotent on retry. Admin-only (DB-verified via app.tenant_users, plus JWT double-check).
-- 2. apply_entry_action(): approval-type entries (business_approval/new_user_login) become
--    admin-only for EVERY action; plain 'approve' is refused (must carry an assignment).
-- 3. Approval entries are hidden from seller_assistant in list_entries / buyer history / RLS.
-- 4. Zoho: approval sets entries.external_sync_status = pending (or not_required when the tenant
--    has no active Zoho). Attempt/error/backoff columns + claim/record/dispatch functions + a
--    5-minute pg_cron sweep drive the push-buyer-to-zoho edge function with retry.

-- ── 1. Sync-state columns on app.entries ───────────────────────────────────────────────────
ALTER TABLE app.entries
  ADD COLUMN IF NOT EXISTS external_sync_error text,
  ADD COLUMN IF NOT EXISTS external_sync_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS external_sync_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_sync_next_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS entries_zoho_sync_due_idx
  ON app.entries (external_sync_next_attempt_at)
  WHERE external_system = 'zoho'
    AND external_sync_status IN ('pending', 'failed')
    AND deleted_at IS NULL;

-- ── 2. Admin check helper (DB-authoritative; the RPCs run as service_role so the caller's
--      JWT is not available -- the acting user is looked up in app.tenant_users). ────────────
CREATE OR REPLACE FUNCTION app.entry_actor_is_seller_admin(p_tenant_id uuid, p_actor_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $function$
  SELECT
    p_tenant_id IS NOT NULL
    AND p_actor_user_id IS NOT NULL
    -- JWT double-check: if the call carries a seller JWT, it must be an admin one.
    AND COALESCE(app.jwt_role(), '') NOT IN ('seller_assistant', 'buyer_admin', 'buyer_assistant')
    AND EXISTS (
      SELECT 1
      FROM app.tenant_users tu
      WHERE tu.tenant_id = p_tenant_id
        AND tu.user_id = p_actor_user_id
        AND tu.role = 'seller_admin'
        AND COALESCE(tu.is_active, true)
        AND tu.deleted_at IS NULL
    );
$function$;

REVOKE ALL ON FUNCTION app.entry_actor_is_seller_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.entry_actor_is_seller_admin(uuid, uuid) TO service_role;

-- ── 3. RLS: approval entries are invisible to seller_assistant on direct table reads ───────
DROP POLICY IF EXISTS "seller members can read entries" ON app.entries;
CREATE POLICY "seller members can read entries"
  ON app.entries FOR SELECT
  TO authenticated
  USING (
    tenant_id = (select app.jwt_tenant_id())
    AND (select app.is_seller())
    AND (
      (select app.jwt_role()) = 'seller_admin'
      OR (
        entry_type NOT IN ('business_approval', 'new_user_login')
        AND (location_id IS NULL OR location_id IN (SELECT unnest(app.jwt_location_ids())))
      )
    )
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "seller members can read entry events" ON app.entry_events;
CREATE POLICY "seller members can read entry events"
  ON app.entry_events FOR SELECT
  TO authenticated
  USING (
    tenant_id = (select app.jwt_tenant_id())
    AND (select app.is_seller())
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM app.entries e
      WHERE e.id = entry_events.entry_id
        AND e.tenant_id = entry_events.tenant_id
        AND e.deleted_at IS NULL
        AND (
          (select app.jwt_role()) = 'seller_admin'
          OR (
            e.entry_type NOT IN ('business_approval', 'new_user_login')
            AND (e.location_id IS NULL OR e.location_id IN (SELECT unnest(app.jwt_location_ids())))
          )
        )
    )
  );

-- ── 4. list_entries: default-closed for approval entries unless the actor is a verified admin
DROP FUNCTION IF EXISTS app.list_entries(uuid, uuid[], text, text[], text, integer, timestamptz, uuid);

CREATE OR REPLACE FUNCTION app.list_entries(
  p_tenant_id uuid,
  p_location_ids uuid[] DEFAULT NULL,
  p_status_scope text DEFAULT 'active',
  p_entry_types text[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_cursor_priority_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  entry_number bigint,
  tenant_id uuid,
  buyer_id uuid,
  buyer_name text,
  buyer_phone text,
  location_id uuid,
  entry_type text,
  status text,
  source_channel text,
  source_entity_type text,
  source_entity_id uuid,
  title text,
  summary text,
  amount numeric,
  currency text,
  priority_at timestamptz,
  remind_at timestamptz,
  created_at timestamptz,
  last_actor_id uuid,
  last_action text,
  last_action_at timestamptz,
  external_sync_status text,
  metadata jsonb,
  allowed_actions jsonb,
  time_bucket text,
  customer_entry_count bigint,
  external_sync_error text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  WITH actor AS (
    SELECT app.entry_actor_is_seller_admin(p_tenant_id, p_actor_user_id) AS is_admin
  ),
  scoped AS (
    SELECT e.*, b.business_name, b.phone
    FROM app.entries e
    LEFT JOIN app.buyers b ON b.id = e.buyer_id AND b.tenant_id = e.tenant_id
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND (
        e.entry_type NOT IN ('business_approval', 'new_user_login')
        OR (SELECT is_admin FROM actor)
      )
      AND (
        CASE
          WHEN p_status_scope = 'resolved' THEN e.status = 'resolved'
          WHEN p_status_scope = 'all' THEN true
          ELSE e.status <> 'resolved'
        END
      )
      AND (p_entry_types IS NULL OR e.entry_type = ANY(p_entry_types))
      AND (p_location_ids IS NULL OR e.location_id IS NULL OR e.location_id = ANY(p_location_ids))
      AND (
        p_search IS NULL
        OR p_search = ''
        OR b.business_name ILIKE '%' || p_search || '%'
        OR b.phone ILIKE '%' || p_search || '%'
        OR e.source_entity_id::text ILIKE '%' || p_search || '%'
        OR e.metadata::text ILIKE '%' || p_search || '%'
      )
      AND (
        p_cursor_priority_at IS NULL
        OR e.priority_at < p_cursor_priority_at
        OR (e.priority_at = p_cursor_priority_at AND e.id < p_cursor_id)
      )
  ),
  counted AS (
    SELECT scoped.*, COUNT(*) OVER (PARTITION BY scoped.buyer_id) AS customer_entry_count
    FROM scoped
  )
  SELECT
    c.id,
    c.entry_number,
    c.tenant_id,
    c.buyer_id,
    COALESCE(c.business_name, 'Unknown customer') AS buyer_name,
    c.phone AS buyer_phone,
    c.location_id,
    c.entry_type,
    c.status,
    c.source_channel,
    c.source_entity_type,
    c.source_entity_id,
    COALESCE(c.business_name, 'Unknown customer') AS title,
    CASE c.entry_type
      WHEN 'business_approval' THEN 'New business account'
      WHEN 'new_user_login' THEN 'New visitor, no business info yet'
      WHEN 'new_enquiry' THEN concat_ws(' · ', 'Open enquiry', c.metadata->>'amount')
      WHEN 'new_order_confirmation' THEN concat_ws(' · ', 'New order', c.metadata->>'amount')
      WHEN 'order_dispatch_needed' THEN 'Confirmed, not dispatched'
      WHEN 'invoice_due' THEN concat_ws(' · ', c.metadata->>'amount', 'due soon')
      WHEN 'invoice_overdue' THEN concat_ws(' · ', c.metadata->>'amount', 'overdue')
      WHEN 'credit_limit_breach' THEN concat_ws(' · ', c.metadata->>'over_limit_amount', 'over credit limit')
      ELSE c.entry_type
    END AS summary,
    COALESCE(NULLIF(c.metadata->>'amount', '')::numeric, NULLIF(c.metadata->>'over_limit_amount', '')::numeric) AS amount,
    c.metadata->>'currency' AS currency,
    c.priority_at,
    c.remind_at,
    c.created_at,
    c.last_actor_id,
    c.last_action,
    c.last_action_at,
    c.external_sync_status,
    c.metadata,
    app.entry_allowed_actions(c.entry_type, c.status, c.metadata) AS allowed_actions,
    app.entry_time_bucket(c.priority_at) AS time_bucket,
    c.customer_entry_count,
    c.external_sync_error
  FROM counted c
  ORDER BY c.priority_at DESC, c.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

REVOKE ALL ON FUNCTION app.list_entries(uuid, uuid[], text, text[], text, integer, timestamptz, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.list_entries(uuid, uuid[], text, text[], text, integer, timestamptz, uuid, uuid) TO service_role;

-- ── 5. Buyer history: same visibility rule ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS app.list_entry_events_for_buyer(uuid, uuid, integer);

CREATE OR REPLACE FUNCTION app.list_entry_events_for_buyer(
  p_tenant_id uuid,
  p_buyer_id uuid,
  p_limit integer DEFAULT 200,
  p_actor_user_id uuid DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  entry_id uuid,
  entry_type text,
  action text,
  from_status text,
  to_status text,
  note text,
  actor_id uuid,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT
    ee.id,
    ee.entry_id,
    e.entry_type,
    ee.action,
    ee.from_status,
    ee.to_status,
    ee.note,
    ee.actor_user_id AS actor_id,
    ee.created_at
  FROM app.entry_events ee
  JOIN app.entries e ON e.id = ee.entry_id
  WHERE e.tenant_id = p_tenant_id
    AND e.buyer_id = p_buyer_id
    AND e.deleted_at IS NULL
    AND ee.deleted_at IS NULL
    AND (
      e.entry_type NOT IN ('business_approval', 'new_user_login')
      OR app.entry_actor_is_seller_admin(p_tenant_id, p_actor_user_id)
    )
  ORDER BY ee.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
$$;

REVOKE ALL ON FUNCTION app.list_entry_events_for_buyer(uuid, uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.list_entry_events_for_buyer(uuid, uuid, integer, uuid) TO service_role;

-- ── 6. apply_entry_action: admin-only for approval entries; plain approve now refused ─────
CREATE OR REPLACE FUNCTION app.apply_entry_action(
  p_tenant_id uuid,
  p_entry_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_note text DEFAULT NULL::text,
  p_remind_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_expected_version integer DEFAULT NULL::integer
)
 RETURNS app.entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_entry app.entries%ROWTYPE;
  v_buyer app.buyers%ROWTYPE;
  v_from_status text;
  v_to_status text;
  v_resolution_reason text := NULL;
  v_resolved_at timestamptz := NULL;
  v_resolved_by uuid := NULL;
  v_version_bump int := 0;
  v_buyer_onboarding_status text := NULL;
  v_buyer_app_enabled boolean := NULL;
  v_buyer_declined_at timestamptz := NULL;
  v_buyer_declined_reason text := NULL;
  v_missing_fields jsonb;
BEGIN
  SELECT * INTO v_entry
  FROM app.entries
  WHERE id = p_entry_id
    AND tenant_id = p_tenant_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'entry_not_found' USING ERRCODE = '02000';
  END IF;

  -- Approval-request entries are seller_admin only, for every action (assistants cannot see
  -- customer groups / price lists and must not act on access requests).
  IF v_entry.entry_type IN ('business_approval', 'new_user_login')
     AND NOT app.entry_actor_is_seller_admin(p_tenant_id, p_actor_user_id) THEN
    RAISE EXCEPTION 'admin_only_entry_action' USING ERRCODE = '42501';
  END IF;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_entry.version THEN
    RAISE EXCEPTION 'version_mismatch' USING ERRCODE = '40001';
  END IF;

  v_from_status := v_entry.status;

  IF p_action = 'open' THEN
    v_to_status := CASE WHEN v_entry.status = 'new' THEN 'opened' ELSE v_entry.status END;
  ELSIF p_action = 'start' THEN
    v_to_status := 'in_progress';
  ELSIF p_action = 'add_note' THEN
    v_to_status := CASE WHEN v_entry.status = 'new' THEN 'opened' ELSE v_entry.status END;
  ELSIF p_action = 'remind_later' THEN
    IF p_remind_at IS NULL OR p_remind_at <= now() THEN
      RAISE EXCEPTION 'future_remind_at_required' USING ERRCODE = '22023';
    END IF;
    v_to_status := 'waiting';
  ELSIF p_action = ANY(ARRAY['dismiss', 'ignore', 'mark_converted_manually']) THEN
    v_to_status := 'resolved';
  ELSIF p_action = 'reopen' THEN
    v_to_status := 'new';
  ELSIF p_action = 'approve' AND v_entry.entry_type IN ('business_approval', 'new_user_login') THEN
    -- Approval now MUST go through app.approve_buyer_access_entry (customer group / price list
    -- confirmation + atomic assignment). A bare approve would silently leave the buyer on
    -- all_buyers/base pricing, which is exactly what this change prevents.
    RAISE EXCEPTION 'approval_assignment_required' USING ERRCODE = '22023';
  ELSIF p_action = 'decline' AND v_entry.entry_type IN ('business_approval', 'new_user_login') THEN
    IF v_entry.status IN ('resolved', 'waiting') THEN
      RAISE EXCEPTION 'entry_action_not_allowed' USING ERRCODE = '22023';
    END IF;
    IF p_note IS NULL OR btrim(p_note) = '' THEN
      RAISE EXCEPTION 'decline_note_required' USING ERRCODE = '22023';
    END IF;
    v_to_status := 'resolved';
    v_resolution_reason := 'declined';
    v_resolved_at := now();
    v_resolved_by := p_actor_user_id;
    v_version_bump := 1;
    v_buyer_onboarding_status := 'declined';
    v_buyer_declined_at := now();
    v_buyer_declined_reason := p_note;
  ELSIF p_action = 'request_more_info' AND v_entry.entry_type IN ('business_approval', 'new_user_login') THEN
    IF v_entry.status IN ('resolved', 'waiting') THEN
      RAISE EXCEPTION 'entry_action_not_allowed' USING ERRCODE = '22023';
    END IF;
    v_missing_fields := p_metadata -> 'missing_fields';
    IF v_missing_fields IS NULL
       OR jsonb_typeof(v_missing_fields) <> 'array'
       OR jsonb_array_length(v_missing_fields) = 0 THEN
      RAISE EXCEPTION 'missing_fields_required' USING ERRCODE = '22023';
    END IF;
    v_to_status := 'waiting';
    v_version_bump := 1;
    v_buyer_onboarding_status := 'needs_more_info';
  ELSE
    RAISE EXCEPTION 'unsupported_entry_action' USING ERRCODE = '22023';
  END IF;

  IF v_buyer_onboarding_status IS NOT NULL THEN
    SELECT * INTO v_buyer
    FROM app.buyers
    WHERE id = v_entry.source_entity_id
      AND v_entry.source_entity_type = 'buyer'
      AND tenant_id = p_tenant_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF v_buyer.id IS NULL THEN
      RAISE EXCEPTION 'approval_buyer_not_found' USING ERRCODE = '02000';
    END IF;

    UPDATE app.buyers
    SET onboarding_status = v_buyer_onboarding_status,
        buyer_app_enabled = COALESCE(v_buyer_app_enabled, buyer_app_enabled),
        declined_at = COALESCE(v_buyer_declined_at, declined_at),
        declined_reason = COALESCE(v_buyer_declined_reason, declined_reason),
        updated_by = p_actor_user_id
    WHERE id = v_buyer.id;
  END IF;

  UPDATE app.entries
  SET status = v_to_status,
      remind_at = CASE
        WHEN v_to_status = 'waiting' AND p_action = 'request_more_info'
          THEN COALESCE(p_remind_at, now() + interval '3 days')
        WHEN v_to_status = 'waiting' AND p_action = 'remind_later'
          THEN p_remind_at
        WHEN v_to_status = 'waiting'
          THEN v_entry.remind_at
        ELSE NULL
      END,
      priority_at = CASE WHEN p_action = 'reopen' THEN now() ELSE priority_at END,
      last_actor_id = p_actor_user_id,
      last_action = p_action,
      last_action_at = now(),
      metadata = metadata || COALESCE(p_metadata, '{}'::jsonb),
      resolution_reason = CASE
        WHEN p_action IN ('approve', 'decline') THEN v_resolution_reason
        WHEN p_action = 'request_more_info' THEN NULL
        WHEN p_action = 'reopen' THEN NULL
        ELSE resolution_reason
      END,
      resolved_at = CASE
        WHEN p_action = 'reopen' THEN NULL
        ELSE COALESCE(v_resolved_at, resolved_at)
      END,
      resolved_by = CASE
        WHEN p_action = 'reopen' THEN NULL
        ELSE COALESCE(v_resolved_by, resolved_by)
      END,
      version = version + v_version_bump,
      external_sync_status = CASE
        WHEN p_action = 'reopen' THEN 'not_required'
        ELSE external_sync_status
      END,
      updated_by = p_actor_user_id
  WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  INSERT INTO app.entry_events (
    tenant_id, entry_id, actor_user_id, action, from_status, to_status, note, metadata, created_by, updated_by
  )
  VALUES (
    p_tenant_id, p_entry_id, p_actor_user_id, p_action, v_from_status, v_to_status, p_note,
    COALESCE(p_metadata, '{}'::jsonb), p_actor_user_id, p_actor_user_id
  );

  RETURN v_entry;
END;
$function$;

REVOKE ALL ON FUNCTION app.apply_entry_action(uuid, uuid, uuid, text, text, timestamp with time zone, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.apply_entry_action(uuid, uuid, uuid, text, text, timestamp with time zone, jsonb, integer) TO service_role;

-- ── 7. Read RPC: eligible groups / price lists + defaults for the approval dialog ─────────
-- Admin-only, tenant-scoped (tenant comes from the verified claims in the route).
CREATE OR REPLACE FUNCTION app.get_approval_assignment_options(p_tenant_id uuid, p_actor_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_cohorts jsonb;
  v_lists jsonb;
  v_default_cohort uuid;
BEGIN
  IF NOT app.entry_actor_is_seller_admin(p_tenant_id, p_actor_user_id) THEN
    RAISE EXCEPTION 'admin_only_entry_action' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'name', c.name,
           'membership_mode', c.membership_mode,
           'eligible', c.membership_mode = 'manual',
           'member_count', COALESCE(m.cnt, 0),
           'ineligible_reason', CASE WHEN c.membership_mode <> 'manual'
             THEN 'Members of this group are added automatically by rules, so a buyer cannot be added by hand.'
             ELSE NULL END
         ) ORDER BY (c.membership_mode = 'manual') DESC, COALESCE(m.cnt, 0) DESC, c.name), '[]'::jsonb)
  INTO v_cohorts
  FROM app.cohorts c
  LEFT JOIN (
    SELECT cohort_id, count(*) AS cnt FROM app.cohort_members_active GROUP BY cohort_id
  ) m ON m.cohort_id = c.id
  WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL;

  -- Preselect the most-used manual group only (ties -> alphabetical). None when no manual group has members.
  SELECT c.id INTO v_default_cohort
  FROM app.cohorts c
  JOIN (
    SELECT cohort_id, count(*) AS cnt FROM app.cohort_members_active GROUP BY cohort_id
  ) m ON m.cohort_id = c.id
  WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL AND c.membership_mode = 'manual'
  ORDER BY m.cnt DESC, c.name
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', pl.id,
           'name', pl.name,
           'priority', pl.priority,
           'has_zoho_pricebook', pl.external_ref IS NOT NULL
         ) ORDER BY pl.name), '[]'::jsonb)
  INTO v_lists
  FROM app.price_lists pl
  WHERE pl.tenant_id = p_tenant_id
    AND pl.deleted_at IS NULL
    AND pl.is_active = true
    AND pl.valid_from <= now()
    AND (pl.valid_to IS NULL OR pl.valid_to > now());

  RETURN jsonb_build_object(
    'cohorts', v_cohorts,
    'price_lists', v_lists,
    'default_cohort_id', v_default_cohort,
    'zoho_active', app.tenant_has_active_zoho(p_tenant_id)
  );
END;
$function$;

REVOKE ALL ON FUNCTION app.get_approval_assignment_options(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.get_approval_assignment_options(uuid, uuid) TO service_role;

-- ── 8. Preview: which price list will the buyer see? (mirrors resolve_price tier order:
--      buyer-level list > cohort lists > all_buyers, then priority DESC) ───────────────────
CREATE OR REPLACE FUNCTION app.preview_approval_price_source(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_cohort_id uuid DEFAULT NULL,
  p_price_list_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT app.entry_actor_is_seller_admin(p_tenant_id, p_actor_user_id) THEN
    RAISE EXCEPTION 'admin_only_entry_action' USING ERRCODE = '42501';
  END IF;

  WITH cand AS (
    SELECT 1 AS tier, 'buyer'::text AS source, pl.id, pl.name, pl.priority
    FROM app.price_lists pl
    WHERE p_price_list_id IS NOT NULL AND pl.id = p_price_list_id AND pl.tenant_id = p_tenant_id
    UNION ALL
    SELECT 2, 'group', pl.id, pl.name, pl.priority
    FROM app.price_list_assignments pla
    JOIN app.price_lists pl ON pl.id = pla.price_list_id
    JOIN app.cohorts c ON c.id = pla.target_id AND c.tenant_id = p_tenant_id AND c.deleted_at IS NULL
    WHERE p_cohort_id IS NOT NULL AND pla.target_type = 'cohort' AND pla.target_id = p_cohort_id
      AND pla.deleted_at IS NULL AND pl.tenant_id = p_tenant_id
    UNION ALL
    SELECT 3, 'all_buyers', pl.id, pl.name, pl.priority
    FROM app.price_list_assignments pla
    JOIN app.price_lists pl ON pl.id = pla.price_list_id
    WHERE pla.target_type = 'all_buyers' AND pla.deleted_at IS NULL AND pl.tenant_id = p_tenant_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'tier', cand.tier, 'source', cand.source, 'price_list_id', cand.id,
           'name', cand.name, 'priority', cand.priority
         ) ORDER BY cand.tier, cand.priority DESC NULLS LAST, cand.name), '[]'::jsonb)
  INTO v_rows
  FROM cand
  JOIN app.price_lists pl ON pl.id = cand.id
  WHERE pl.deleted_at IS NULL
    AND pl.is_active = true
    AND pl.valid_from <= now()
    AND (pl.valid_to IS NULL OR pl.valid_to > now());

  RETURN jsonb_build_object(
    'headline', CASE WHEN jsonb_array_length(v_rows) > 0 THEN v_rows -> 0 ELSE NULL END,
    'applicable', v_rows
  );
END;
$function$;

REVOKE ALL ON FUNCTION app.preview_approval_price_source(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.preview_approval_price_source(uuid, uuid, uuid, uuid) TO service_role;

-- ── 9. THE atomic approval ─────────────────────────────────────────────────────────────────
-- Returns jsonb: { applied boolean, replay boolean, entry jsonb, buyer_id uuid,
--                  price_source jsonb, zoho_sync_status text }
-- Error codes (message text): admin_only_entry_action(42501), entry_not_found(02000),
-- unsupported_entry_action, version_mismatch(40001), entry_action_not_allowed,
-- assignment_confirmation_required, invalid_cohort, cohort_not_manual, invalid_price_list,
-- price_list_inactive, approval_buyer_not_found.
CREATE OR REPLACE FUNCTION app.approve_buyer_access_entry(
  p_tenant_id uuid,
  p_entry_id uuid,
  p_actor_user_id uuid,
  p_cohort_id uuid DEFAULT NULL,
  p_price_list_id uuid DEFAULT NULL,
  p_assignment_confirmed boolean DEFAULT false,
  p_note text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_entry app.entries%ROWTYPE;
  v_buyer app.buyers%ROWTYPE;
  v_cohort app.cohorts%ROWTYPE;
  v_list app.price_lists%ROWTYPE;
  v_from_status text;
  v_zoho boolean;
  v_sync text;
  v_price_source jsonb;
  v_assignment jsonb;
  v_count integer;
BEGIN
  SELECT * INTO v_entry
  FROM app.entries
  WHERE id = p_entry_id AND tenant_id = p_tenant_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'entry_not_found' USING ERRCODE = '02000';
  END IF;

  IF v_entry.entry_type NOT IN ('business_approval', 'new_user_login') THEN
    RAISE EXCEPTION 'unsupported_entry_action' USING ERRCODE = '22023';
  END IF;

  IF NOT app.entry_actor_is_seller_admin(p_tenant_id, p_actor_user_id) THEN
    RAISE EXCEPTION 'admin_only_entry_action' USING ERRCODE = '42501';
  END IF;

  -- Idempotent replay: already approved -> no writes, no second notification.
  IF v_entry.status = 'resolved' AND v_entry.resolution_reason = 'approved' THEN
    RETURN jsonb_build_object(
      'applied', false, 'replay', true, 'entry', to_jsonb(v_entry),
      'buyer_id', v_entry.source_entity_id,
      'price_source', v_entry.metadata -> 'approval_assignment' -> 'price_source',
      'zoho_sync_status', v_entry.external_sync_status);
  END IF;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_entry.version THEN
    RAISE EXCEPTION 'version_mismatch' USING ERRCODE = '40001';
  END IF;

  IF v_entry.status IN ('resolved', 'waiting') THEN
    RAISE EXCEPTION 'entry_action_not_allowed' USING ERRCODE = '22023';
  END IF;

  IF NOT COALESCE(p_assignment_confirmed, false) THEN
    RAISE EXCEPTION 'assignment_confirmation_required' USING ERRCODE = '22023';
  END IF;

  IF p_cohort_id IS NOT NULL THEN
    SELECT * INTO v_cohort FROM app.cohorts
    WHERE id = p_cohort_id AND tenant_id = p_tenant_id AND deleted_at IS NULL
    FOR UPDATE;
    IF v_cohort.id IS NULL THEN
      RAISE EXCEPTION 'invalid_cohort' USING ERRCODE = '22023';
    END IF;
    IF v_cohort.membership_mode <> 'manual' THEN
      RAISE EXCEPTION 'cohort_not_manual' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_price_list_id IS NOT NULL THEN
    SELECT * INTO v_list FROM app.price_lists
    WHERE id = p_price_list_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;
    IF v_list.id IS NULL THEN
      RAISE EXCEPTION 'invalid_price_list' USING ERRCODE = '22023';
    END IF;
    IF v_list.is_active IS DISTINCT FROM true
       OR v_list.valid_from > now()
       OR (v_list.valid_to IS NOT NULL AND v_list.valid_to <= now()) THEN
      RAISE EXCEPTION 'price_list_inactive' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT * INTO v_buyer FROM app.buyers
  WHERE id = v_entry.source_entity_id
    AND v_entry.source_entity_type = 'buyer'
    AND tenant_id = p_tenant_id
    AND deleted_at IS NULL
  FOR UPDATE;
  IF v_buyer.id IS NULL THEN
    RAISE EXCEPTION 'approval_buyer_not_found' USING ERRCODE = '02000';
  END IF;

  UPDATE app.buyers
  SET onboarding_status = 'approved',
      buyer_app_enabled = true,
      default_cohort_id = CASE WHEN p_cohort_id IS NOT NULL THEN p_cohort_id ELSE default_cohort_id END,
      updated_at = now(),
      updated_by = p_actor_user_id
  WHERE id = v_buyer.id;

  IF p_cohort_id IS NOT NULL THEN
    INSERT INTO app.cohort_members (cohort_id, buyer_id)
    SELECT p_cohort_id, v_buyer.id
    WHERE NOT EXISTS (
      SELECT 1 FROM app.cohort_members
      WHERE cohort_id = p_cohort_id AND buyer_id = v_buyer.id AND valid_until IS NULL
    );
    SELECT count(*) INTO v_count FROM app.cohort_members_active WHERE cohort_id = p_cohort_id;
    UPDATE app.cohorts
    SET cached_member_count = v_count, updated_at = now(), updated_by = p_actor_user_id
    WHERE id = p_cohort_id;
  END IF;

  IF p_price_list_id IS NOT NULL THEN
    UPDATE app.price_list_assignments
    SET deleted_at = now(), updated_at = now(), updated_by = p_actor_user_id
    WHERE target_type = 'buyer' AND target_id = v_buyer.id AND deleted_at IS NULL;

    INSERT INTO app.price_list_assignments (price_list_id, target_type, target_id, created_by, updated_by)
    VALUES (p_price_list_id, 'buyer', v_buyer.id, p_actor_user_id, p_actor_user_id);
  END IF;

  v_price_source := app.preview_approval_price_source(p_tenant_id, p_actor_user_id, p_cohort_id, p_price_list_id) -> 'headline';

  v_zoho := app.tenant_has_active_zoho(p_tenant_id);
  v_sync := CASE WHEN v_zoho THEN 'pending' ELSE 'not_required' END;

  v_assignment := jsonb_build_object(
    'cohort_id', p_cohort_id,
    'cohort_name', v_cohort.name,
    'no_group', p_cohort_id IS NULL,
    'price_list_id', p_price_list_id,
    'price_list_name', v_list.name,
    'price_list_external_ref', v_list.external_ref,
    'price_source', v_price_source,
    'confirmed_by', p_actor_user_id,
    'confirmed_at', now()
  );

  v_from_status := v_entry.status;

  UPDATE app.entries
  SET status = 'resolved',
      remind_at = NULL,
      last_actor_id = p_actor_user_id,
      last_action = 'approve',
      last_action_at = now(),
      metadata = metadata || jsonb_build_object('approval_assignment', v_assignment),
      resolution_reason = 'approved',
      resolved_at = now(),
      resolved_by = p_actor_user_id,
      version = version + 1,
      external_sync_status = v_sync,
      external_system = CASE WHEN v_zoho THEN 'zoho' ELSE external_system END,
      external_sync_error = NULL,
      external_sync_attempts = 0,
      external_sync_last_attempt_at = NULL,
      external_sync_next_attempt_at = CASE WHEN v_zoho THEN now() ELSE NULL END,
      updated_by = p_actor_user_id
  WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  INSERT INTO app.entry_events (
    tenant_id, entry_id, actor_user_id, action, from_status, to_status, note, metadata, created_by, updated_by
  )
  VALUES (
    p_tenant_id, p_entry_id, p_actor_user_id, 'approve', v_from_status, 'resolved', p_note,
    jsonb_build_object('approval_assignment', v_assignment, 'zoho_sync_status', v_sync),
    p_actor_user_id, p_actor_user_id
  );

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (p_tenant_id, p_actor_user_id, 'buyer', v_buyer.id, 'status_change',
          jsonb_build_object('event', 'access_request_approved', 'entry_id', p_entry_id,
                             'approval_assignment', v_assignment), now());

  RETURN jsonb_build_object(
    'applied', true, 'replay', false, 'entry', to_jsonb(v_entry),
    'buyer_id', v_buyer.id, 'price_source', v_price_source, 'zoho_sync_status', v_sync);
END;
$function$;

REVOKE ALL ON FUNCTION app.approve_buyer_access_entry(uuid, uuid, uuid, uuid, uuid, boolean, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.approve_buyer_access_entry(uuid, uuid, uuid, uuid, uuid, boolean, text, integer) TO service_role;

-- ── 10. Zoho push state machine (claim / record / dispatch / retry / cron sweep) ───────────
CREATE OR REPLACE FUNCTION app.claim_buyer_zoho_push(p_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE
  v_row app.entries%ROWTYPE;
BEGIN
  -- The claim doubles as a 10-minute lease: concurrent workers/cron see next_attempt_at in the future.
  UPDATE app.entries
  SET external_sync_attempts = external_sync_attempts + 1,
      external_sync_last_attempt_at = now(),
      external_sync_next_attempt_at = now() + interval '10 minutes'
  WHERE id = p_entry_id
    AND deleted_at IS NULL
    AND entry_type IN ('business_approval', 'new_user_login')
    AND resolution_reason = 'approved'
    AND external_system = 'zoho'
    AND external_sync_status IN ('pending', 'failed')
    AND COALESCE(external_sync_next_attempt_at, now()) <= now()
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('claimed', false);
  END IF;

  RETURN jsonb_build_object(
    'claimed', true,
    'entry_id', v_row.id,
    'tenant_id', v_row.tenant_id,
    'buyer_id', v_row.source_entity_id,
    'attempts', v_row.external_sync_attempts,
    'approval_assignment', v_row.metadata -> 'approval_assignment');
END;
$function$;

CREATE OR REPLACE FUNCTION app.record_buyer_zoho_push_result(
  p_entry_id uuid,
  p_status text,
  p_error text DEFAULT NULL,
  p_contact_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE
  v_entry app.entries%ROWTYPE;
BEGIN
  IF p_status NOT IN ('synced', 'failed', 'not_required') THEN
    RAISE EXCEPTION 'invalid_sync_status' USING ERRCODE = '22023';
  END IF;

  UPDATE app.entries
  SET external_sync_status = p_status,
      external_sync_error = CASE WHEN p_status = 'failed' THEN left(COALESCE(p_error, 'unknown error'), 1000) ELSE NULL END,
      external_sync_next_attempt_at = CASE
        WHEN p_status <> 'failed' THEN NULL
        ELSE now() + CASE
          WHEN external_sync_attempts <= 1 THEN interval '1 minute'
          WHEN external_sync_attempts = 2 THEN interval '5 minutes'
          WHEN external_sync_attempts = 3 THEN interval '15 minutes'
          WHEN external_sync_attempts = 4 THEN interval '1 hour'
          WHEN external_sync_attempts = 5 THEN interval '4 hours'
          ELSE interval '12 hours'
        END
      END
  WHERE id = p_entry_id AND deleted_at IS NULL
  RETURNING * INTO v_entry;

  IF v_entry.id IS NULL THEN RETURN; END IF;

  INSERT INTO app.entry_events (tenant_id, entry_id, actor_user_id, action, from_status, to_status, note, metadata)
  VALUES (v_entry.tenant_id, v_entry.id, NULL, 'zoho_sync', v_entry.status, v_entry.status,
          CASE WHEN p_status = 'failed' THEN left(COALESCE(p_error, ''), 500) ELSE NULL END,
          jsonb_build_object('status', p_status, 'attempt', v_entry.external_sync_attempts, 'zoho_contact_id', p_contact_id));
END;
$function$;

CREATE OR REPLACE FUNCTION app.dispatch_buyer_zoho_pushes(p_entry_id uuid DEFAULT NULL, p_limit integer DEFAULT 20)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE
  v_secret text := app.get_integrations_dispatch_secret();
  v_row record;
  v_n integer := 0;
BEGIN
  IF v_secret = '' THEN
    RAISE WARNING 'dispatch_buyer_zoho_pushes: missing app.integrations_dispatch_secret';
    RETURN 0;
  END IF;

  FOR v_row IN
    SELECT e.id, e.tenant_id
    FROM app.entries e
    WHERE e.deleted_at IS NULL
      AND e.entry_type IN ('business_approval', 'new_user_login')
      AND e.external_system = 'zoho'
      AND e.external_sync_status IN ('pending', 'failed')
      AND e.external_sync_attempts < 8
      AND COALESCE(e.external_sync_next_attempt_at, now()) <= now()
      AND (p_entry_id IS NULL OR e.id = p_entry_id)
    ORDER BY e.external_sync_next_attempt_at NULLS FIRST
    LIMIT GREATEST(COALESCE(p_limit, 20), 1)
  LOOP
    PERFORM net.http_post(
      url := app.get_functions_base_url() || '/push-buyer-to-zoho',
      headers := jsonb_build_object('Content-type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object('entry_id', v_row.id, 'tenant_id', v_row.tenant_id),
      timeout_milliseconds := 5000
    );
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$function$;

-- Admin-only manual retry (resets attempt counter so the sweep/dispatcher picks it up again).
CREATE OR REPLACE FUNCTION app.retry_buyer_zoho_sync(p_tenant_id uuid, p_entry_id uuid, p_actor_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE
  v_entry app.entries%ROWTYPE;
BEGIN
  IF NOT app.entry_actor_is_seller_admin(p_tenant_id, p_actor_user_id) THEN
    RAISE EXCEPTION 'admin_only_entry_action' USING ERRCODE = '42501';
  END IF;

  UPDATE app.entries
  SET external_sync_status = 'pending',
      external_sync_error = NULL,
      external_sync_attempts = 0,
      external_sync_next_attempt_at = now(),
      updated_by = p_actor_user_id
  WHERE id = p_entry_id AND tenant_id = p_tenant_id AND deleted_at IS NULL
    AND entry_type IN ('business_approval', 'new_user_login')
    AND resolution_reason = 'approved'
    AND external_system = 'zoho'
    AND external_sync_status = 'failed'
  RETURNING * INTO v_entry;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'zoho_retry_not_applicable' USING ERRCODE = '22023';
  END IF;

  INSERT INTO app.entry_events (tenant_id, entry_id, actor_user_id, action, from_status, to_status, metadata, created_by, updated_by)
  VALUES (p_tenant_id, p_entry_id, p_actor_user_id, 'zoho_sync_retry', v_entry.status, v_entry.status,
          '{}'::jsonb, p_actor_user_id, p_actor_user_id);

  PERFORM app.dispatch_buyer_zoho_pushes(p_entry_id, 1);
  RETURN to_jsonb(v_entry);
END;
$function$;

CREATE OR REPLACE FUNCTION app.ensure_buyer_zoho_push_sweep_scheduled()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, extensions
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'buyer-zoho-push-sweep') THEN
    PERFORM cron.schedule('buyer-zoho-push-sweep', '*/5 * * * *', $job$SELECT app.dispatch_buyer_zoho_pushes(NULL, 20);$job$);
  END IF;
  RETURN true;
END;
$function$;

SELECT app.ensure_buyer_zoho_push_sweep_scheduled();

REVOKE ALL ON FUNCTION app.claim_buyer_zoho_push(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.record_buyer_zoho_push_result(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.dispatch_buyer_zoho_pushes(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.retry_buyer_zoho_sync(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.ensure_buyer_zoho_push_sweep_scheduled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.claim_buyer_zoho_push(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app.record_buyer_zoho_push_result(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION app.dispatch_buyer_zoho_pushes(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION app.retry_buyer_zoho_sync(uuid, uuid, uuid) TO service_role;
