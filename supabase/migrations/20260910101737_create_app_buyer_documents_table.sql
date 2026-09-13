-- Task 3 of the buyer-approval signup flow (Yukti_Public-Signup_Backend-Plan_v1.md
-- §1.2, corrected by §0b / §7 item 4): creates app.buyer_documents to store
-- uploaded shop-image / GST-certificate documents captured during buyer
-- approval intake.
--
-- Per §0b's correction: buyer_id is NOT NULL (every row is attributable to the
-- buyer that uploaded it, for audit) and reused_from_document_id points at the
-- original row when a document is copied for cross-tenant reuse (new R2
-- object, new row) instead of the nullable-shape-check design in the original
-- §1.2 draft.

CREATE TABLE app.buyer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES app.buyers(id) ON DELETE RESTRICT,
  gstin text,
  doc_type text NOT NULL,          -- 'shop_image' | 'gst_certificate'
  subject_scope text NOT NULL,     -- 'personal' | 'business'
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
  CONSTRAINT buyer_documents_doc_type_check
    CHECK (doc_type IN ('shop_image', 'gst_certificate')),
  CONSTRAINT buyer_documents_subject_scope_check
    CHECK (subject_scope IN ('personal', 'business')),
  CONSTRAINT buyer_documents_business_requires_gstin
    CHECK (subject_scope != 'business' OR gstin IS NOT NULL)
);

CREATE INDEX buyer_documents_tenant_buyer_idx
  ON app.buyer_documents (tenant_id, buyer_id) WHERE deleted_at IS NULL;
CREATE INDEX buyer_documents_gstin_idx
  ON app.buyer_documents (gstin) WHERE deleted_at IS NULL AND gstin IS NOT NULL;
CREATE UNIQUE INDEX buyer_documents_tenant_external_ref_uk
  ON app.buyer_documents (tenant_id, external_ref) WHERE external_ref IS NOT NULL;

DROP TRIGGER IF EXISTS buyer_documents_updated_at ON app.buyer_documents;
CREATE TRIGGER buyer_documents_updated_at
  BEFORE UPDATE ON app.buyer_documents
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.buyer_documents ENABLE ROW LEVEL SECURITY;

-- Seller-side read: tenant members can read their own tenant's rows.
-- Modeled directly on app.entries' "seller members can read entries" policy
-- (supabase/migrations/20260906070337_inbox_entries_phase1.sql) minus that
-- policy's location_id scoping, which the brief does not call for here.
DROP POLICY IF EXISTS "seller members can read buyer documents" ON app.buyer_documents;
CREATE POLICY "seller members can read buyer documents"
  ON app.buyer_documents FOR SELECT
  TO authenticated
  USING (
    tenant_id = (select app.jwt_tenant_id())
    AND (select app.is_seller())
    AND deleted_at IS NULL
  );

-- Buyer-side read: a buyer can read only their own rows. Modeled on
-- app.buyers' "buyers_select" policy (`app.is_buyer() AND id = jwt_buyer_id()`)
-- for the claim-reading expression, but written against app.jwt_role()
-- directly instead of app.is_buyer() because app.is_buyer() only recognizes
-- 'buyer_admin'/'buyer_assistant' (see app.is_buyer() body) and the brief
-- requires this policy to also cover 'buyer_pending' (the self-registered,
-- not-yet-approved buyer role added in
-- 20260907053018_buyer_pending_access_token_role.sql) so a pending buyer can
-- see the status of documents they uploaded during intake. This does not
-- widen buyer_pending's access to the catalog/orders/invoices/price-lists
-- surfaces that migration's comment warns against -- buyer_documents is none
-- of those.
DROP POLICY IF EXISTS "buyers can read own buyer documents" ON app.buyer_documents;
CREATE POLICY "buyers can read own buyer documents"
  ON app.buyer_documents FOR SELECT
  TO authenticated
  USING (
    (select app.jwt_role()) IN ('buyer_admin', 'buyer_assistant', 'buyer_pending')
    AND buyer_id = (select app.jwt_buyer_id())
    AND deleted_at IS NULL
  );

-- No INSERT/UPDATE/DELETE policy for any client role: all writes to this
-- table happen through the service-role client from server-side routes
-- (presign-confirm upload flow), matching how app.submit_buyer_intake's
-- caller is documented as "service-role client only".

REVOKE ALL ON TABLE app.buyer_documents FROM anon, authenticated;
GRANT SELECT ON TABLE app.buyer_documents TO authenticated;
GRANT ALL ON TABLE app.buyer_documents TO service_role;
