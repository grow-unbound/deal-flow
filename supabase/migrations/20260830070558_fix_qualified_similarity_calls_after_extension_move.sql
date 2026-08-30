-- Immediate fix for a live break caused by the previous migration
-- (20260830070449): search_products_scoped and global_search both call
-- `public.similarity(...)` with the schema hardcoded, not resolved via
-- search_path -- moving pg_trgm to `extensions` broke both on the very
-- next call (confirmed live: "function public.similarity(text, text)
-- does not exist"). The search_path patch in that migration was the
-- wrong fix for this specific case; this migration does the actual fix:
-- rewrite the two hardcoded `public.similarity(` call sites to
-- `extensions.similarity(`.
DO $$
DECLARE
  v_def text;
  v_new text;
  v_matches integer;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc WHERE proname = 'search_products_scoped' AND pronamespace = 'app'::regnamespace;

  SELECT count(*) INTO v_matches FROM regexp_matches(v_def, 'public\.similarity\(', 'g');
  IF v_matches = 0 THEN
    RAISE EXCEPTION 'fix_similarity: no public.similarity( found in search_products_scoped, aborting';
  END IF;

  v_new := replace(v_def, 'public.similarity(', 'extensions.similarity(');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'fix_similarity: no substitution applied to search_products_scoped';
  END IF;
  EXECUTE v_new;

  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc WHERE proname = 'global_search' AND pronamespace = 'app'::regnamespace;

  SELECT count(*) INTO v_matches FROM regexp_matches(v_def, 'public\.similarity\(', 'g');
  IF v_matches = 0 THEN
    RAISE EXCEPTION 'fix_similarity: no public.similarity( found in global_search, aborting';
  END IF;

  v_new := replace(v_def, 'public.similarity(', 'extensions.similarity(');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'fix_similarity: no substitution applied to global_search';
  END IF;
  EXECUTE v_new;
END $$;
