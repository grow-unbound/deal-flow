/**
 * Shared vocabulary for the "missing/incorrect field" checklist used by
 * `app.apply_entry_action`'s `request_more_info` action
 * (`p_metadata.missing_fields`) on `business_approval` / `new_user_login`
 * entries. Single source of truth for both:
 *   - the server-side WhatsApp copy in src/lib/server/buyer-approval-notify.ts
 *     (imports MISSING_FIELD_LABELS from here instead of duplicating it)
 *   - the seller-facing request-more-info checklist UI (Task 12), which is a
 *     client component and cannot import buyer-approval-notify.ts directly
 *     (that module pulls in server-only WhatsApp/enqueue code).
 *
 * The exact 6-key vocabulary and label wording are locked by
 * app.apply_entry_action's contract — passing any other key raises
 * `missing_fields_required`/an unrecognized-key error server-side.
 */
export const MISSING_FIELD_LABELS: Record<string, string> = {
  gst_certificate: 'GST certificate',
  address: 'address',
  business_name: 'business name',
  gstin: 'GSTIN',
  shop_image: 'shop image',
  contact_name: 'contact name',
};

export const ALL_MISSING_FIELD_KEYS = [
  'contact_name',
  'business_name',
  'gstin',
  'address',
  'shop_image',
  'gst_certificate',
] as const;

export type MissingFieldKey = (typeof ALL_MISSING_FIELD_KEYS)[number];

/**
 * Which of the 6 fields are even submittable for a given entry type —
 * `new_user_login` (individual signup) never collects business fields or
 * documents at all (Yukti_Public-Signup_Frontend-Spec_v1.md §4's
 * `personalFieldsSchema` has no gstin/business_name/shop_image/
 * gst_certificate), so those checkboxes would be meaningless there.
 */
export function missingFieldKeysForEntryType(entryType: string): MissingFieldKey[] {
  if (entryType === 'business_approval') {
    return [...ALL_MISSING_FIELD_KEYS];
  }
  // new_user_login and anything else defaults to the personal-only subset.
  return ['contact_name', 'address'];
}
