-- Add soft-delete column (required convention for all app.* tables)
ALTER TABLE app.cohorts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Function: preview how many buyers match a dynamic cohort rule set
-- Returns count + up to 5 sample buyer names
CREATE OR REPLACE FUNCTION app.preview_cohort_count(
  p_tenant_id uuid,
  p_rules_json jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
  v_sample_names text[] := '{}';
  v_filters jsonb;
  v_filter jsonb;
  v_field text;
  v_operator text;
  v_value text;
  v_value_arr text[];
  v_query text;
  v_conditions text[] := '{}';
BEGIN
  -- Extract filters array from rules JSON
  v_filters := p_rules_json -> 'filters';

  IF v_filters IS NULL OR jsonb_array_length(v_filters) = 0 THEN
    -- No filters: return all active buyers count
    SELECT COUNT(*), array_agg(business_name ORDER BY business_name)
    INTO v_count, v_sample_names
    FROM (
      SELECT business_name FROM app.buyers
      WHERE tenant_id = p_tenant_id AND is_active = true AND deleted_at IS NULL
      LIMIT 5
    ) sub;

    RETURN jsonb_build_object('count', COALESCE(v_count, 0), 'sample_names', COALESCE(v_sample_names, '{}'));
  END IF;

  -- Build WHERE conditions from each filter
  FOR i IN 0 .. jsonb_array_length(v_filters) - 1 LOOP
    v_filter := v_filters -> i;
    v_field := v_filter ->> 'field';
    v_operator := v_filter ->> 'operator';

    IF v_field = 'tier' THEN
      IF v_operator = 'eq' THEN
        v_value := v_filter ->> 'value';
        v_conditions := array_append(v_conditions, format('tier = %L', v_value));
      ELSIF v_operator = 'in' THEN
        SELECT array_agg(x) INTO v_value_arr FROM jsonb_array_elements_text(v_filter -> 'value') x;
        v_conditions := array_append(v_conditions, format('tier = ANY(%L::text[])', v_value_arr));
      END IF;
    ELSIF v_field = 'geography.state' THEN
      v_value := v_filter ->> 'value';
      IF v_operator = 'eq' THEN
        v_conditions := array_append(v_conditions, format('(geography->>''state'') = %L', v_value));
      ELSIF v_operator = 'in' THEN
        SELECT array_agg(x) INTO v_value_arr FROM jsonb_array_elements_text(v_filter -> 'value') x;
        v_conditions := array_append(v_conditions, format('(geography->>''state'') = ANY(%L::text[])', v_value_arr));
      END IF;
    ELSIF v_field = 'geography.city' THEN
      v_value := v_filter ->> 'value';
      IF v_operator = 'eq' THEN
        v_conditions := array_append(v_conditions, format('(geography->>''city'') = %L', v_value));
      END IF;
    ELSIF v_field = 'geography.zone' THEN
      v_value := v_filter ->> 'value';
      IF v_operator = 'eq' THEN
        v_conditions := array_append(v_conditions, format('(geography->>''zone'') = %L', v_value));
      END IF;
    END IF;
  END LOOP;

  -- Build and execute dynamic query for count
  v_query := 'SELECT COUNT(*) FROM app.buyers WHERE tenant_id = $1 AND is_active = true AND deleted_at IS NULL';
  IF array_length(v_conditions, 1) > 0 THEN
    v_query := v_query || ' AND ' || array_to_string(v_conditions, ' AND ');
  END IF;

  EXECUTE v_query INTO v_count USING p_tenant_id;

  -- Get sample names (up to 5)
  v_query := 'SELECT array_agg(business_name) FROM (SELECT business_name FROM app.buyers WHERE tenant_id = $1 AND is_active = true AND deleted_at IS NULL';
  IF array_length(v_conditions, 1) > 0 THEN
    v_query := v_query || ' AND ' || array_to_string(v_conditions, ' AND ');
  END IF;
  v_query := v_query || ' ORDER BY business_name LIMIT 5) sub';

  EXECUTE v_query INTO v_sample_names USING p_tenant_id;

  RETURN jsonb_build_object(
    'count', COALESCE(v_count, 0),
    'sample_names', COALESCE(v_sample_names, '{}')
  );
END;
$$;

-- Grant execute to service_role and authenticated
GRANT EXECUTE ON FUNCTION app.preview_cohort_count(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION app.preview_cohort_count(uuid, jsonb) TO authenticated;
