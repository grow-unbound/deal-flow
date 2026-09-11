/**
 * Shared shape for a row returned by app.find_existing_profiles_for_phone,
 * used by both app/api/buyer/onboarding/existing-profiles/route.ts (server)
 * and the ProfilePicker component (client) — kept in src/ so the `@/` alias
 * resolves it from either side without a client component importing a
 * route.ts module.
 */
export interface ExistingProfileRow {
  buyer_id: string;
  tenant_id: string;
  tenant_name: string;
  business_name: string | null;
  contact_name: string | null;
  phone: string | null;
  gstin: string | null;
  is_business: boolean;
}
