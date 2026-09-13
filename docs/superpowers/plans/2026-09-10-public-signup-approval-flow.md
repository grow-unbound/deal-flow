# Plan: Public Catalog Signup — Buyer Approval Flow (cases 1b/2)

Source of truth for scope: `specs/Yukti_Public-Signup_Backend-Plan_v1.md` (including its §0b addendum) and `specs/Yukti_Public-Signup_Frontend-Spec_v1.md` (including its §0b addendum). Every implementer task below MUST read the referenced sections of those two files directly — this plan restates only what's needed to sequence the work; the spec files are the actual requirements.

Also read `specs/Yukti_Inbox_Feature-Spec_v1.md` §4 (tone/copy rules) and §18 (entries data model) for background — already-shipped code (`app.entries`, `app.entry_events`, `app.apply_entry_action`, `app.entry_allowed_actions`, `app.sync_entry_from_buyer`, `app.submit_buyer_intake`, `app/onboarding`, `app/pending`, `app/api/buyer/onboarding/intake`, `src/lib/server/buyer-access.ts`) is the baseline every task extends — do not re-create anything already listed as existing in the backend plan's §0/§0b.

## Global Constraints (binding on every task)

- Supabase project for schema work during implementation: `yukti-dev` (id `hcpzbnmumbykdqveyjhr`). Do not touch `yukti-prod` (id `cckmurgapnkytbzxqesp`) in this plan.
- All migrations via `supabase migration new <name>` — never hand-author a timestamped filename. All SQL schema-qualified (`app.*`).
- Every state-changing RPC: `SECURITY DEFINER`, `SET search_path = app, public`, verifies identity from JWT/session claims — never trusts a client-supplied `tenant_id`/`buyer_id`. Match the existing pattern in `app.submit_buyer_intake` and `app.apply_entry_action`.
- `buyer_app_enabled` is the sole login/access gate (already enforced in `custom_access_token_hook` — do not modify that function). `onboarding_status` is additional state for UI copy only, not a second gate.
- No `individual_approval` entry type. `business_approval` and `new_user_login` are the only two entry types this work touches; `new_user_login` is the type for non-business buyers (per backend plan §0b — reversing the plan document's own earlier §3 recommendation).
- GSTIN is never mandatory for a business buyer. A business buyer with no GSTIN has their documents scoped `subject_scope='personal'` (keyed by `buyer_id`), not `'business'`.
- Zoho/ERP sync on approve is best-effort and async — `buyer_app_enabled` and `onboarding_status` flip in the same transaction regardless of ERP sync outcome. Never block or roll back approval on a sync failure.
- WhatsApp sends are triggered from API route handlers after a successful DB commit, never from inside a SQL function/trigger — matches the existing `transactional-whatsapp.ts` invocation pattern.
- Tone for all buyer-facing copy (WhatsApp templates, screens): per Inbox spec §4 — calm, factual, no exclamation marks, no urgency/guilt language.
- Every table: `id uuid default gen_random_uuid()`, audit columns (`created_at/by`, `updated_at/by`), soft-delete (`deleted_at`), FKs `ON DELETE RESTRICT`.
- Tenant's WhatsApp contact number/name for buyer-facing copy: `app.tenant_settings.settings->'buyer_app'->>'whatsapp_number'` / `...->>'whatsapp_display_name'` — reuse this exact path (already used by `/pending`'s existing "Message seller" button), do not add a new tenant contact column.
- Run project's existing test/typecheck/lint commands relevant to touched files before calling a task done (`npm run lint`, and any existing test suite covering touched files — see each task's brief for specifics).

## Task Sequencing (dependency order — execute in this order, not in parallel)

1. Migration: `app.buyers` additive columns
2. Migration: `app.entries` additive columns
3. Migration: `app.buyer_documents` table + RLS
4. RPC: `app.apply_entry_action` approve/decline/request_more_info
5. Fix `app.submit_buyer_intake` non-business `business_name`, add document linking
6. RPC: `app.get_buyer_onboarding_status` + `app.find_existing_profiles_for_phone`
7. R2 presign + confirm-upload for buyer documents
8. WhatsApp templates + send wiring
9. `/onboarding` form: business toggle copy, document upload, multi-profile picker
10. `/pending` + guest-browsing gate rework (status pill, no hard block)
11. Documentation resubmission flow (forced re-OTP, structured field checklist)
12. Seller Inbox card updates for `business_approval`/`new_user_login`

---

## Task 1: Migration — `app.buyers` additive columns

Read `specs/Yukti_Public-Signup_Backend-Plan_v1.md` §1.1 and its §0b corrections (business_name/GSTIN handling, no new address columns since `geography`/`billing_address` jsonb already cover that — confirmed live, `geography` shape is `{city, state, address, country, pincode}`).

Add to `app.buyers` via a new migration:
- `onboarding_status text NOT NULL DEFAULT 'approved'` with `CHECK (onboarding_status IN ('pending_approval','needs_more_info','approved','declined'))`. Backfill: this default already covers all existing rows correctly at creation time (they get `'approved'` by column default), so no separate UPDATE backfill statement is needed — just confirm the migration's column-add order does not violate the NOT NULL constraint on existing rows (it won't, since a DEFAULT is provided).
- `declined_at timestamptz NULL`.
- `declined_reason text NULL`.
- Index: `CREATE INDEX buyers_tenant_onboarding_status_idx ON app.buyers (tenant_id, onboarding_status) WHERE deleted_at IS NULL;`

Do not add `full_address`/`state` columns — reuse existing `geography` jsonb (already has `state`) and `billing_address` jsonb, per the backend plan's confirmed live schema.

Verify via the Supabase MCP tools (`execute_sql` against project `hcpzbnmumbykdqveyjhr`) after applying: confirm the new columns exist with correct types/constraints, and confirm no existing row violates the CHECK constraint.

Report: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, migration filename, and the verification query output.

---

## Task 2: Migration — `app.entries` additive columns

Read `specs/Yukti_Public-Signup_Backend-Plan_v1.md` §7 item 2 and §0b's confirmation (live-checked: `app.entries` currently lacks `resolution_reason`, `resolved_at`, `resolved_by`, `severity_tier`, `external_system`, `external_sync_attempted_at`, `external_sync_error`, `version`).

Add to `app.entries` via a new migration, all nullable/defaulted so the migration is purely additive with no backfill risk:
- `resolution_reason text NULL`
- `resolved_at timestamptz NULL`
- `resolved_by uuid NULL REFERENCES auth.users(id) ON DELETE RESTRICT`
- `severity_tier text NULL`
- `external_system text NULL`
- `external_sync_attempted_at timestamptz NULL`
- `external_sync_error text NULL`
- `version integer NOT NULL DEFAULT 1`

Do not alter existing columns, RLS policies, or the `entry_type`/`status` CHECK constraints — this task only adds columns. Verify via `execute_sql` against `hcpzbnmumbykdqveyjhr` that the columns exist post-migration and that `app.apply_entry_action`, `app.upsert_entry`, `app.sync_entry_from_buyer` still execute without error against a sample entry (a read-only `SELECT app.entry_allowed_actions(...)` call is sufficient smoke-test; do not run destructive test writes against dev data beyond what's needed to confirm the migration didn't break existing functions).

Report: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, migration filename, verification output.

---

## Task 3: Migration — `app.buyer_documents` table + RLS

Read `specs/Yukti_Public-Signup_Backend-Plan_v1.md` §1.2 and §7 items 4/7, and §0b's correction (buyer_id is NOT NULL, add `reused_from_document_id`, no nullable-shape-check).

Create `app.buyer_documents`:

```sql
CREATE TABLE app.buyer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES app.buyers(id) ON DELETE RESTRICT,
  gstin text,
  doc_type text NOT NULL,
  subject_scope text NOT NULL,
  storage_key text NOT NULL,
  reused_from_document_id uuid REFERENCES app.buyer_documents(id) ON DELETE RESTRICT,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CONSTRAINT buyer_documents_doc_type_check CHECK (doc_type IN ('shop_image', 'gst_certificate')),
  CONSTRAINT buyer_documents_subject_scope_check CHECK (subject_scope IN ('personal', 'business')),
  CONSTRAINT buyer_documents_business_requires_gstin CHECK (subject_scope != 'business' OR gstin IS NOT NULL)
);

CREATE INDEX buyer_documents_tenant_buyer_idx ON app.buyer_documents (tenant_id, buyer_id) WHERE deleted_at IS NULL;
CREATE INDEX buyer_documents_gstin_idx ON app.buyer_documents (gstin) WHERE deleted_at IS NULL AND gstin IS NOT NULL;
CREATE UNIQUE INDEX buyer_documents_tenant_external_ref_uk ON app.buyer_documents (tenant_id, external_ref) WHERE external_ref IS NOT NULL;
```

RLS: enable RLS on the table. Policies needed (model on `app.entries`' existing RLS — read that policy definition first via `execute_sql`: `SELECT policyname, qual FROM pg_policies WHERE schemaname='app' AND tablename='entries';`):
- Seller-side read: tenant members (`is_seller()` + `jwt_tenant_id() = tenant_id`) can SELECT.
- Buyer-side read: a buyer can SELECT only their own rows (`buyer_id = jwt buyer_id claim`, covering both `buyer_admin`/`buyer_assistant`/`buyer_pending` roles).
- No direct client INSERT/UPDATE/DELETE policy — all writes go through the service-role client from server-side routes (matching how `app.submit_buyer_intake`'s caller is documented as "service-role client only").

Verify via `execute_sql`: table + indexes + RLS policies exist; `SELECT * FROM app.buyer_documents LIMIT 1` succeeds (empty result expected).

Report: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, migration filename, verification output.

---

## Task 4: RPC — `app.apply_entry_action` approve/decline/request_more_info

Depends on Tasks 1 and 2 (needs the new `app.buyers`/`app.entries` columns). Read `specs/Yukti_Public-Signup_Backend-Plan_v1.md` §2.3 in full, and §0b's corrections (entry_type is `business_approval` OR `new_user_login`, not a business-only qualifier on the Zoho push gate — Zoho push only happens when `entry_type = 'business_approval'` still, but the buyer_app_enabled flip is identical for both types).

First read the CURRENT live definition of `app.apply_entry_action` via `execute_sql` (`SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname='apply_entry_action';` against project `hcpzbnmumbykdqveyjhr`) — do not guess at its current shape, the plan doc quotes it but re-verify since other tasks may have touched the surrounding schema.

Extend the function (via `CREATE OR REPLACE FUNCTION`, in a new migration) to add three new branches to its `IF p_action = ...` chain, only active `WHEN v_entry.entry_type IN ('business_approval', 'new_user_login')`:

- **`approve`:** requires `v_entry.status` to currently allow it (not already `resolved`). Sets, in the same transaction: `app.buyers.onboarding_status = 'approved'`, `app.buyers.buyer_app_enabled = true` for the entry's `buyer_id` (via `v_entry.source_entity_id`, since `source_entity_type = 'buyer'`). Sets on `app.entries`: `status = 'resolved'`, `resolution_reason = 'approved'`, `resolved_at = now()`, `resolved_by = p_actor_user_id`, `version = version + 1`. Do NOT attempt the Zoho push inside this SQL function — that happens from the calling API route (Task 8) using `external_sync_status`/`external_system` columns this function should set to `'pending'`/`'zoho'` only when `entry_type = 'business_approval'` (leave `external_sync_status = 'not_required'` for `new_user_login`), so the route knows whether to attempt a push after this RPC returns.
- **`decline`:** requires `p_note` (the decline reason) — raise an exception if `p_note` is null/blank, mirroring the existing `remind_later` action's `p_remind_at` requirement pattern in this same function. Sets `app.buyers.onboarding_status = 'declined'`, `declined_at = now()`, `declined_reason = p_note`. Sets `app.entries.status = 'resolved'`, `resolution_reason = 'declined'`, `resolved_at = now()`, `resolved_by = p_actor_user_id`, `version = version + 1`.
- **`request_more_info`:** requires `p_note` is not used for this one — instead requires a structured field list, passed via `p_metadata` (e.g. `p_metadata = {"missing_fields": ["gst_certificate", "address"]}`) — raise an exception if `p_metadata->'missing_fields'` is missing or empty. Sets `app.buyers.onboarding_status = 'needs_more_info'`. Sets `app.entries.status = 'waiting'`, `resolution_reason = NULL` (not yet resolved), `version = version + 1`. The `missing_fields` list must be persisted on the entry (append into `app.entries.metadata`, e.g. `metadata = metadata || p_metadata`) so Task 12's seller-side UI and Task 8's WhatsApp template can read it back.

All three write an `app.entry_events` row exactly as the existing branches do (reuse the function's existing `INSERT INTO app.entry_events (...)` call at the end — don't duplicate that insert per new branch, thread these through the same shared insert path the function already uses if it has one, otherwise add the insert consistently).

Add optimistic-concurrency handling: since `version` is new (Task 2), have the function accept an optional `p_expected_version integer DEFAULT NULL` and raise an exception if provided and mismatched — this satisfies Inbox spec §18.7's "final actions must be protected by server-side status/version checks so two users cannot accidentally resolve the same entry twice." Keep this check backward-compatible (NULL means "don't check," so existing callers of the other actions aren't broken).

Also update `app.entry_allowed_actions` if needed — it already returns `approve`/`request_more_info`/`decline` for both types (confirmed live, no change needed there) — but verify this is still true after your changes with a fresh `execute_sql` read, don't assume the earlier plan doc's quote is still accurate.

Write a short SQL test script (a few `SELECT`/`DO` blocks against `yukti-dev`, using a disposable test tenant/buyer you create and clean up, or an existing dev fixture if one exists — check `list_tables`/sample data first) exercising: approve on a `business_approval` entry, decline with and without a note (confirm the no-note case raises), request_more_info with and without `missing_fields` (confirm the empty case raises). Report the actual query output as your test evidence, not just "it should work."

Report: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, migration filename, and the test evidence.

---

## Task 5: Fix `app.submit_buyer_intake` — non-business `business_name`, document linking

Depends on Task 3. Read `specs/Yukti_Public-Signup_Backend-Plan_v1.md` §7 item 1 and §0b's correction.

First read the current live definition via `execute_sql` (already quoted in the backend plan §0, but re-verify — don't trust the quoted copy if other tasks touched it).

Change `app.submit_buyer_intake`:
- When `p_is_business = false`, set `business_name = COALESCE(NULLIF(trim(p_full_name), ''), business_name)` instead of leaving the existing (placeholder) `business_name` untouched. This is the "reuse contact_name for business_name" behavior change you were asked to make — do not touch the `WHEN p_is_business AND ...` branch, only the implicit ELSE for the non-business case (currently `ELSE business_name` — change to use the incoming full name).
- Add a new parameter `p_document_ids uuid[] DEFAULT NULL` — when provided, verify each id in `app.buyer_documents` belongs to `p_buyer_id` (already true if Task 7's confirm-upload route always creates rows with the correct `buyer_id`) and is not soft-deleted; this RPC does not need to do anything further with them (Task 7's confirm-upload already attaches `buyer_id` at creation), but validate the ids exist and belong to this buyer as a defense-in-depth check, raising an exception on mismatch (prevents a client from claiming someone else's uploaded document id).

Do not change the `sync_entry_from_buyer` call at the end, and do not change how `is_business` routes to `business_approval` vs `new_user_login` — that routing is already correct per the backend plan's confirmed live behavior.

Update the caller (`app/api/buyer/onboarding/intake/route.ts`) to pass `p_document_ids` from the request body (an array of document ids the client already uploaded and confirmed via Task 7's confirm-upload endpoint before final form submit) — extend `BuyerIntakeSchema` in `src/lib/zod.ts` accordingly (optional `document_ids: z.array(z.string().uuid()).optional()`).

Report: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, migration filename, files changed, and confirmation the existing intake flow (no documents) still works unchanged (test by calling the RPC with `p_document_ids = NULL`).

---

## Task 6: RPC — `app.get_buyer_onboarding_status` + `app.find_existing_profiles_for_phone`

Depends on Tasks 1 and 3. Read `specs/Yukti_Public-Signup_Backend-Plan_v1.md` §2.4, §2.5, §4 (cross-tenant reuse lookup + lazy-consent mechanic), and §0b's correction on the tenant-contact-phone path.

**`app.get_buyer_onboarding_status()`** — no input params, reads `buyer_id`/`tenant_id` from `auth.jwt()` claims (match the claim-reading pattern already used elsewhere, e.g. how `jwt_tenant_id()`/similar helper functions read claims — grep for an existing helper like `app.jwt_tenant_id()` or `app.jwt_buyer_id()` and reuse it rather than re-deriving claim parsing). Returns a row/jsonb with: `onboarding_status`, `declined_reason` (only when declined), tenant's `name` and the WhatsApp contact path (`settings->'buyer_app'->>'whatsapp_number'` / `whatsapp_display_name`) via a join to `app.tenant_settings`. Returns a "no relationship" shape (not an error) when the session has no `buyer_id` claim at all.

**`app.find_existing_profiles_for_phone(p_phone text, p_exclude_tenant_id uuid)`** — verify the caller's session belongs to an authenticated (OTP-verified) identity for that phone before returning anything (check `auth.jwt()` maps to a user whose phone matches, or reuse whatever existing helper already establishes this post-OTP-verify identity check — look at how `findExistingAuthUserIdForPhone` in `buyer-access.ts` is used, since that's the existing phone→auth-user resolution path). Returns `app.buyers` rows matching `phone` (excluding `p_exclude_tenant_id`), each tagged `is_business` (reuse the exact same detection `sync_entry_from_buyer` already uses: `custom_fields->>'is_business'` if present, else the GSTIN/contact_name/placeholder-regex fallback), joined to `app.tenants.business_name` for display.

Fold in the document-reuse-candidate check per §4's lazy-consent mechanic: add a third function `app.check_document_reuse_candidate(p_gstin text DEFAULT NULL, p_phone text DEFAULT NULL)` — when `p_gstin` given, look up `app.buyer_documents WHERE subject_scope='business' AND gstin=p_gstin AND deleted_at IS NULL`, else when `p_phone` given, resolve all `buyer_id`s for that phone (across tenants) and look up `subject_scope='personal'` documents for those ids. Return `{found, tenant_name, document_ids}` shape per §4. This is the personal-scope fallback path Task 3/backend-plan-§0b's "no-GSTIN business buyer" rule also relies on — a business buyer with no GSTIN reuses via the phone/personal path, same function.

All three are read-only, `SECURITY DEFINER`, callable by `buyer_pending` role (already scoped in the JWT hook to read its own data) and, for the first one, by `buyer_admin`/`buyer_assistant` too.

Report: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, migration filename, and `execute_sql` output showing each function callable against a sample buyer/phone/gstin.

---

## Task 7: R2 presign + confirm-upload for buyer documents

Depends on Task 3. Read `specs/Yukti_Public-Signup_Backend-Plan_v1.md` §4 in full (key structure, presign shape, cross-tenant reuse, copy-not-link decision per §0b).

Read `src/lib/server/r2-presign-entity.ts` and `src/lib/r2.ts` first to reuse their underlying signing primitives (`getPresignedUploadUrl`/equivalent) — do not reimplement R2 signing from scratch, only the key-building and route logic are new.

Create `src/lib/server/buyer-document-presign.ts`:
```ts
signBuyerDocumentUpload(params: {
  scope: 'personal' | 'business';
  buyerId: string;
  gstin?: string; // required when scope = 'business'
  docType: 'shop_image' | 'gst_certificate';
  contentType: string;
}): Promise<{ key: string; upload_url: string }>
```
- Personal key: `buyers/<buyerId>/personal/<docType>/<uuid>-<sanitized-filename-or-timestamp>`.
- Business key: `businesses/<sha256(gstin)>/docs/<docType>/<uuid>-...` — hash the GSTIN server-side with Node's `crypto` module, never trust a client-supplied hash, never put the raw GSTIN in the key.

New API routes:
- `POST /api/buyer/documents/presign` — body `{ scope, gstin?, doc_type, content_type }`, session must carry `buyer_pending`/`buyer_admin` claim (reuse `requireBuyerAccessProfile` from `buyer-access.ts`). Returns `{ key, upload_url }`. Does NOT insert a `buyer_documents` row yet.
- `POST /api/buyer/documents/confirm` — body `{ key, doc_type, subject_scope, gstin? }`, same auth, inserts the `app.buyer_documents` row (`buyer_id` from session, `tenant_id` from session) after confirming the object actually exists in R2 (a HEAD request against the key) — do not trust the client's claim that upload succeeded without checking.
- `POST /api/buyer/documents/reuse-check` — body `{ gstin? , phone_verified_session_required: true }`, calls `app.check_document_reuse_candidate` (Task 6), returns `{ found, tenant_name, document_ids }` for the lazy-consent prompt.
- `POST /api/buyer/documents/reuse-confirm` — body `{ document_ids, consent: true }`, when consent is true, for each source document COPIES the R2 object to a new key scoped to the current buyer/tenant (per §0b: copy, not link — new `app.buyer_documents` row with `reused_from_document_id` pointing at the source, independent `storage_key`).

All four routes: never trust client-supplied `buyer_id`/`tenant_id`, always derive from session via `requireBuyerAccessProfile`.

Report: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, files created, and a description of how you verified the presign/upload/confirm round-trip (e.g. a manual curl/test-script hitting the routes against a local/dev session, or a unit test if the project has a pattern for testing API routes — check for an existing `*.test.ts` alongside similar routes and follow that pattern if present).

---

## Task 8: WhatsApp templates + send wiring

Depends on Tasks 4 and 5. Read `specs/Yukti_Public-Signup_Backend-Plan_v1.md` §5 in full (as amended by §0b — header+multiline body structure, the corrected copy for 5.1/5.2/5.5, the `access_request_approved_buyer` vs. existing `buyer_app_enabled` template distinction).

Read `src/lib/server/whatsapp-template-validation.ts`, `whatsapp-enqueue.ts`, `transactional-whatsapp.ts`, and `src/lib/server/buyer-app-enable-notify.ts` (as a direct pattern to follow — it's the closest existing analog: builds a payload, validates it, enqueues, triggers dispatch).

Add 5 entries to `TRANSACTIONAL_TEMPLATE_VARIABLES` in `whatsapp-template-validation.ts`:
- `access_request_received_buyer`: `['buyer_name', 'seller_name']`
- `access_request_received_seller`: `['seller_name', 'buyer_name', 'business_qualifier']` — confirm with whoever finalizes Meta template registration whether an empty-string variable is acceptable for the non-business case, per backend plan §5.2's flagged Meta-submission detail; if not, split into two template names (`access_request_received_seller_business` / `_individual`) and note this in your report rather than guessing.
- `access_request_approved_buyer`: `['buyer_name', 'seller_name']`
- `access_more_info_needed_buyer`: `['buyer_name', 'seller_name', 'missing_fields']`
- `access_request_declined_buyer`: `['buyer_name', 'seller_name', 'seller_phone_number']`

Create `src/lib/server/buyer-approval-notify.ts` with functions mirroring `buyer-app-enable-notify.ts`'s shape: `queueAccessRequestReceivedMessages(db, tenantId, buyerId)` (sends both buyer + seller templates, called from the intake route), and `queueApprovalResolutionMessage(db, tenantId, buyerId, resolution: 'approved'|'declined'|'needs_more_info', extra: { missingFields?: string[] })` (called from wherever the seller-side approve/decline/request_more_info action route lives — find or create that route as part of this task if it doesn't exist yet; it calls `app.apply_entry_action` then this notify function).

Wire the sends:
- `app/api/buyer/onboarding/intake/route.ts`: after a successful `submit_buyer_intake` call, call `queueAccessRequestReceivedMessages`.
- The Inbox action route that calls `app.apply_entry_action` for `approve`/`decline`/`request_more_info` on these two entry types (locate it — likely under `app/api/inbox/entries/[id]/actions` or similar; grep for existing callers of `apply_entry_action` from a route handler) — after a successful RPC call, call `queueApprovalResolutionMessage` with the right resolution and, for `needs_more_info`, the `missing_fields` list read back from the entry's metadata (Task 4 stores it there).

For `missing_fields` in the WhatsApp body: build a short comma-joined display string server-side from the structured list (e.g. `['gst_certificate','address']` → `"GST certificate, address"`) — a small mapping table from field key to display label, not raw snake_case.

Report: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, files changed, and confirm (via `assertTemplatePayloadValid` being exercised in a quick script or existing test pattern) that each of the 5 payloads validates against its `TRANSACTIONAL_TEMPLATE_VARIABLES` entry.

---

## Task 9: `/onboarding` form — business toggle copy, document upload, multi-profile picker

Depends on Tasks 6 and 7. Read `specs/Yukti_Public-Signup_Frontend-Spec_v1.md` §1.1 rows 1, 2, 6 and their §0b corrections in full (toggle wording, toggle-off state persistence — already correct in current code, don't add a confirm dialog, multi-profile picker copy for both business and personal profile sets).

Read the current `app/onboarding/page.tsx` in full (already read once this session — re-read now since you're the implementer, don't rely on a stale summary) before editing.

Changes:
1. Toggle label copy: change `"I'm ordering for a business"` to something in the spirit of `"I want to buy as a registered business"` (exact final copy is yours to pick within that intent — this is not a pixel-perfect design task).
2. Add document upload fields inside the `isBusiness` block: shop image (required) and GST certificate (required only when `gstin.trim()` is non-empty — GST is optional per the "don't make GSTIN mandatory" rule, but if a GSTIN is entered, the certificate should back it up; if no GSTIN, shop image alone is enough). Use Task 7's presign/confirm routes: on file select, call presign → PUT to `upload_url` → call confirm → collect the returned document id into local state (`documentIds: string[]`). Show per-file upload progress/error/retry (a simple inline state machine is fine — no need for a library).
3. Before rendering the toggle/fields at all (on initial mount, once the OTP-verified session context is available), call a new lightweight profile-lookup step: hit an API route wrapping Task 6's `app.find_existing_profiles_for_phone` (create this route, e.g. `app/api/buyer/onboarding/existing-profiles/route.ts`, session-scoped like the other buyer routes) and, if it returns any profiles, render the `ProfilePicker` (a new component) above the form per the frontend spec's copy rules — "We found N profile(s) for this number — pick one to continue" for personal profiles, equivalent business-profile copy for business ones. Selecting a profile autofills the corresponding form fields; an explicit "None of these, start fresh" option clears to the blank form. Reuse the visual card pattern from `app/(auth)/login/select-context/page.tsx` (read it first) rather than inventing new list styling.
4. When the business toggle is on and a GSTIN is entered, call Task 7's `reuse-check` route on GSTIN blur/change (debounced) and show the lazy-consent prompt ("Reuse your GST documents submitted for `<tenant-1 name>`?") when it returns `found: true` — Yes calls `reuse-confirm` and skips the manual upload step for that document type; No proceeds to the normal upload UI.
5. On submit, pass the collected `documentIds` (manual uploads + any reuse-confirmed ones) as `document_ids` in the existing POST body to `/api/buyer/onboarding/intake` (Task 5 already extended the schema/RPC to accept this).

Do not change the redirect logic (`window.location.assign('/pending')`) — that stays as-is for this task; Task 10 changes what `/pending` does, not this form's exit point.

Verify in the browser: start the dev server, walk through the form as a fresh phone (no existing profiles, no reuse match) confirming upload UI works end to end and submit succeeds; screenshot the key states (toggle on, upload in progress, upload complete) per this project's UI-verification convention.

Report: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, files changed, and the verification screenshots/description.

---

## Task 10: `/pending` + guest-browsing gate rework

Depends on Task 6. Read `specs/Yukti_Public-Signup_Frontend-Spec_v1.md` §1.1 rows 4, 5, 8 and the §0b addendum's status-pill-placement resolution in full.

Read `app/pending/page.tsx`, `src/lib/server/buyer-access.ts`'s `resolvePendingBuyerRedirect`, and `app/api/buyer/me/route.ts` in full before editing — this task changes a real, currently-hard-gating flow, not a green-field screen.

Core behavior change: a `buyer_pending` session with `onboarding_status IN ('pending_approval','needs_more_info')` should be able to reach the public catalog (`/` on the tenant storefront) in guest/base-pricing mode instead of always being redirected to `/pending`. Concretely:
1. Change `resolvePendingBuyerRedirect` (or its caller in `phone-otp/verify/route.ts`) so a `buyer_pending` session with `intake_submitted = true` redirects to the storefront home (`/`) instead of unconditionally to `/pending` — `/pending` becomes a screen you navigate to (via the new status pill), not a forced landing page. Keep the `/onboarding` redirect for `intake_submitted = false` unchanged (must still complete the intake form first).
2. Add a new `OnboardingStatusPill` component, rendered in the storefront header per the §0b-resolved placement (desktop: header, left of Login button; mobile: header left of Login button, or a scrolling banner below the search bar — your call on mobile per the spec's explicit "either is acceptable"). Wire it to `/api/buyer/me`'s existing `pending` object — extend that route's response to also surface `onboarding_status` directly (it currently infers pending-ness from `mode==='pending'` but doesn't expose the specific status value) so the pill can render the right label: `pending_approval` → "Account verification in progress"; `needs_more_info` → "More info needed" (tappable, routes into Task 11's resubmission flow); `declined` → a different treatment (see below); `approved`/not pending → the pill isn't rendered at all, normal Login button shows.
3. Tapping the pill (pending/needs_more_info states) navigates to `/pending`, which keeps its existing content (already correct per §0b — 24h soft-SLA copy, WhatsApp seller-contact button) but is no longer a forced redirect target for a session that hasn't tried to reach a gated feature.
4. Gated actions (cart, checkout, order placement) for a `buyer_pending` session should redirect to `/pending` when attempted — reuse the existing `GatedStatusScreen` concept from the frontend spec, but implement it as this redirect-on-attempted-gated-action behavior rather than a full-page blanket gate.
5. `declined` state: create `DeclinedContactScreen` (or repurpose `/pending` with a `declined` variant) per frontend spec §1.1 row 8 — factual, no appeal CTA, "contact `<tenant name>` at `<tenant phone>`" using the same WhatsApp-button pattern already in `/pending`.
6. Repeated OTP-login attempts while pending/needs_more_info/declined: the phone-otp verify flow already mints a `buyer_pending` session and redirects appropriately per point 1 above — confirm this naturally produces the "show status + fallback contact" behavior on every login attempt without needing separate special-casing in the OTP routes themselves.

This task touches session-critical auth-adjacent code (`buyer-access.ts`, `phone-otp/verify`) — be conservative, read the full surrounding function bodies before changing them, and do not alter the `buyer_app_enabled=true` path's behavior at all.

Verify in the browser: as a pending buyer, confirm you land on the storefront home with the pill visible, confirm tapping the pill opens `/pending`, confirm attempting to add to cart or checkout redirects to `/pending`, confirm a `needs_more_info` buyer's pill reads correctly and taps into Task 11's flow (stub is fine if Task 11 isn't done yet — coordinate order, or use a temporary placeholder route and note it in your report).

Report: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, files changed, and verification screenshots for each of the states above.

---

## Task 11: Documentation resubmission flow — forced re-OTP, structured checklist

Depends on Tasks 6, 7, 8, 10. Read `specs/Yukti_Public-Signup_Frontend-Spec_v1.md` §1.1 row 7 and the §0b addendum's forced-re-OTP correction and structured-field-checklist requirement, in full.

This is the flow reached from the `access_more_info_needed_buyer` WhatsApp deep link and from tapping the `needs_more_info` status pill (Task 10).

1. The entry point (new route, e.g. `app/resubmit-documents/page.tsx` or under the existing `(auth)` group) always requires a fresh OTP verification before showing the form — even if the browser already holds a valid session for this buyer. Reuse the existing phone-otp send/verify routes and UI, but the post-verify redirect for this specific entry point goes to the resubmission form, not the normal storefront home.
2. After re-OTP, fetch the buyer's current full profile plus the `missing_fields` list Task 4 stored on the entry's metadata (surface this via a small addition to `app.get_buyer_onboarding_status`, Task 6, if it doesn't already return it — extend that RPC/route to include `missing_fields: string[]` when `onboarding_status = 'needs_more_info'`).
3. Render the buyer's full previously-submitted form (same field set as `/onboarding`, Task 9), pre-filled from their existing `app.buyers` row, but only the fields present in `missing_fields` are editable/required for resubmission — the rest display as read-only context (per the spec's "full form, force only flagged fields" instruction). Reuse Task 9's upload sub-components for any flagged document field (`shop_image`/`gst_certificate`).
4. On submit, call `submit_buyer_intake` again (Task 5's RPC already supports being called more than once — it's an UPDATE, not an INSERT) with the corrected fields, which flips `onboarding_status` back through `sync_entry_from_buyer`'s existing re-entry logic into the Inbox (confirm this re-fires a fresh review cycle correctly — check `sync_entry_from_buyer`'s behavior when called on an entry already in `waiting` status, and if it doesn't naturally reopen the entry, add the missing `app.apply_entry_action`-style transition as part of this task, flagging it clearly in your report since it may require a small RPC addition beyond what Task 4 scoped).
5. Redirect to `/pending` after successful resubmission (status reads `pending_approval` again from the seller's perspective, or stays `needs_more_info` until the seller re-reviews — confirm which per point 4's investigation and report your finding).

Report: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, files changed, the finding from point 4, and verification screenshots for the forced-re-OTP gate and the pre-filled/flagged-fields form.

---

## Task 12: Seller Inbox card updates for `business_approval`/`new_user_login`

Depends on Tasks 4, 7, 8. Read `specs/Yukti_Public-Signup_Frontend-Spec_v1.md` §1.2 in full and its §0b corrections (no `individual_approval` — read `new_user_login` instead; remove the reuse-consent tenant-name-leak note entirely, replace with nothing or, at most, a plain "Verified" badge with no source tenant named — you may skip the badge entirely for this round per the spec's own "omit if not load-bearing yet" allowance).

Locate the existing Inbox card/detail-pane components (per Inbox spec §5.3 — grep for the existing card-stack/expanded-card implementation, likely under `src/components/seller/inbox/` or similar — read the existing pattern for at least one other entry type, e.g. `invoice_overdue` or `new_order_confirmation`, to match its structure before adding a new branch).

For `business_approval` / `new_user_login` expanded cards, add:
1. Submitted documents section — thumbnail per document (shop image, GST cert if present), each opening a `Dialog` (not a new tab) showing a larger preview with a "Download" action that requests a fresh signed URL on click (not embedded at page-load — signed URLs expire). Add a small API route if one doesn't exist for "get signed read URL for buyer_documents.id `<id>`" (session must be a seller of the owning tenant).
2. "Request more info" action: instead of a bare text note field, render a checklist of the submittable fields (contact_name, address, gstin, business_name, shop_image, gst_certificate — filtered to only the fields relevant to whether this is a business or individual entry) that the seller checks to flag as missing/incorrect, plus an optional free-text note. Submitting calls `apply_entry_action` with `p_action='request_more_info'` and `p_metadata={"missing_fields": [...]}` per Task 4's contract.
3. "Decline" action: add a confirmation step before submitting (per Inbox spec §17 item 8 — decline is irreversible-feeling and currently has no confirm step anywhere in the codebase) requiring a note (Task 4 makes this server-side mandatory; the UI should make it clear before the user hits submit, not just surface a server error if they skip it).
4. "Approve" action: no confirmation step needed (per the existing Inbox pattern for non-destructive actions), but show a brief pending/success state while the RPC call + potential Zoho sync (business only) completes — do not silently succeed with no feedback, and do not block the UI on the Zoho push specifically (it's best-effort per the backend plan; show approval as complete once the RPC returns, independent of sync status).

Report: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, files changed, and verification screenshots of the expanded card for both a business and a non-business entry, including the document preview dialog and the request-more-info checklist.
