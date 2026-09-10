-- Extend app.apply_entry_action with approve/decline/request_more_info branches
-- for entry_type IN ('business_approval', 'new_user_login'), plus optimistic
-- concurrency via a new optional p_expected_version parameter.
--
-- All pre-existing branches (open, start, add_note, remind_later,
-- dismiss/ignore/mark_converted_manually, reopen) are preserved unchanged.
-- The shared app.entry_events insert at the end is reused for all branches,
-- new and old alike.
--
-- NOTE: adding a new trailing parameter to a PL/pgSQL function is not a
-- signature-preserving change in Postgres — CREATE OR REPLACE with an extra
-- parameter creates a second overload rather than replacing the original,
-- which produces "function is not unique" ambiguity errors for callers
-- relying on the old 7-arg positional signature. Explicitly drop that
-- signature first so only the new 8-arg definition remains.
DROP FUNCTION IF EXISTS app.apply_entry_action(uuid, uuid, uuid, text, text, timestamp with time zone, jsonb);

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
    UPDATE app.buyers
    SET onboarding_status = v_buyer_onboarding_status,
        buyer_app_enabled = COALESCE(v_buyer_app_enabled, buyer_app_enabled),
        declined_at = COALESCE(v_buyer_declined_at, declined_at),
        declined_reason = COALESCE(v_buyer_declined_reason, declined_reason),
        updated_by = p_actor_user_id
    WHERE id = v_entry.source_entity_id
      AND v_entry.source_entity_type = 'buyer';
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
        ELSE resolution_reason
      END,
      resolved_at = COALESCE(v_resolved_at, resolved_at),
      resolved_by = COALESCE(v_resolved_by, resolved_by),
      version = version + v_version_bump,
      external_sync_status = COALESCE(v_external_sync_status, external_sync_status),
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
