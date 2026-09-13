-- Fix review findings on the approve/decline/request_more_info extension to
-- app.apply_entry_action (see 20260910102428_extend_apply_entry_action_approval_actions.sql,
-- commit 074e761a).
--
-- 1. SECURITY: DROP FUNCTION on the old 7-arg signature silently discarded that
--    function's REVOKE/GRANT, leaving the new 8-arg app.apply_entry_action
--    executable by anon/authenticated on the live database. This is a
--    SECURITY DEFINER function that trusts p_tenant_id/p_actor_user_id/
--    p_entry_id verbatim (auth happens only in the calling API route) -- with
--    the default PUBLIC EXECUTE grant, anyone with the anon key could call
--    /rest/v1/rpc/apply_entry_action directly and resolve/approve/decline any
--    tenant's entries. Lock EXECUTE down to service_role only.
REVOKE ALL ON FUNCTION app.apply_entry_action(uuid, uuid, uuid, text, text, timestamp with time zone, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.apply_entry_action(uuid, uuid, uuid, text, text, timestamp with time zone, jsonb, integer) TO service_role;

-- 2. `reopen` never cleared resolution_reason/resolved_at/resolved_by/
--    external_sync_status -- the fields the new approve/decline branches
--    write -- so reopening a declined/approved entry left stale approval
--    state behind even though status went back to 'new'.
-- 3. The UPDATE app.buyers in the new approve/decline/request_more_info
--    branches had no tenant scoping, no deleted_at filter, and no
--    not-found check -- a buyer id that belonged to a different tenant (or
--    was soft-deleted) would silently no-op instead of raising. Switched to
--    the SELECT ... FOR UPDATE / check / UPDATE pattern used by the sibling
--    function app.submit_buyer_intake, scoped to (tenant_id, deleted_at IS
--    NULL), raising before the entry-side UPDATE runs so a failed buyer
--    update never leaves a resolved entry with no corresponding buyer state
--    change.
-- 4. Documented the pre-existing (correctly scoped, unchanged) double-
--    resolution guard's 'waiting' precondition with an inline comment.
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
  v_external_sync_status text := NULL;
  v_external_system text := NULL;
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
    -- An entry in 'waiting' (post request_more_info) must be reopened before
    -- approve/decline can run again -- intentional, not a bug. This mirrors
    -- app.entry_allowed_actions, which only offers approve/decline/
    -- request_more_info when status is NOT IN ('resolved', 'waiting').
    -- Design note: the seller Inbox UI action for "buyer resubmitted after
    -- more-info-requested" must call reopen before approve/decline, unless a
    -- future task decides entry_allowed_actions should itself offer
    -- approve/decline while status = 'waiting' for these two entry types.
    -- Not decided here -- flagged for whoever builds that UI.
    IF v_entry.status IN ('resolved', 'waiting') THEN
      RAISE EXCEPTION 'entry_action_not_allowed' USING ERRCODE = '22023';
    END IF;
    v_to_status := 'resolved';
    v_resolution_reason := 'approved';
    v_resolved_at := now();
    v_resolved_by := p_actor_user_id;
    v_version_bump := 1;
    v_buyer_onboarding_status := 'approved';
    v_buyer_app_enabled := true;
    IF v_entry.entry_type = 'business_approval' THEN
      v_external_sync_status := 'pending';
      v_external_system := 'zoho';
    END IF;
  ELSIF p_action = 'decline' AND v_entry.entry_type IN ('business_approval', 'new_user_login') THEN
    -- See the 'waiting' precondition note under the approve branch above --
    -- same guard, same intentional post-request_more_info reopen requirement.
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
        -- app.entries has a CHECK constraint requiring remind_at IS NOT NULL
        -- whenever status = 'waiting'. request_more_info moves the entry to
        -- 'waiting' but (unlike remind_later) doesn't require the caller to
        -- supply a remind_at, so default to a 3-day follow-up nudge unless
        -- the caller passed an explicit one.
        WHEN v_to_status = 'waiting' AND p_action = 'request_more_info'
          THEN COALESCE(p_remind_at, now() + interval '3 days')
        WHEN v_to_status = 'waiting' THEN p_remind_at
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
        ELSE COALESCE(v_external_sync_status, external_sync_status)
      END,
      external_system = COALESCE(v_external_system, external_system),
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

-- CREATE OR REPLACE does not restate GRANT/REVOKE, so re-apply the lockdown
-- from the top of this file to be explicit and idempotent regardless of
-- statement order.
REVOKE ALL ON FUNCTION app.apply_entry_action(uuid, uuid, uuid, text, text, timestamp with time zone, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.apply_entry_action(uuid, uuid, uuid, text, text, timestamp with time zone, jsonb, integer) TO service_role;
