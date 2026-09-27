/**
 * push-buyer-utils.ts
 * Pure helpers for push-buyer-to-zoho (Yukti buyer -> Zoho contact). No Deno/network imports so they
 * can be unit-tested with vitest.
 */

export const ZOHO_CATALOGUE_ACCESS_FIELD = 'cf_online_catalogue_access';

export interface BuyerForZoho {
  id: string;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  gst_treatment: string | null;
  billing_address: Record<string, unknown> | null;
  custom_fields: Record<string, unknown> | null;
}

export interface ZohoContactPayloadOptions {
  /** Zoho pricebook id, only when the chosen Yukti price list is itself linked to a Zoho pricebook. */
  pricebookId?: string | null;
}

/** Last 10 digits of an Indian mobile; '' when there are fewer than 10 digits. */
export function normalizePhone10(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

export function isBusinessBuyer(buyer: Pick<BuyerForZoho, 'custom_fields' | 'gstin'>): boolean {
  if (buyer.custom_fields && typeof buyer.custom_fields.is_business === 'boolean') {
    return buyer.custom_fields.is_business;
  }
  return Boolean(buyer.gstin?.trim());
}

// cf_online_catalogue_access ("Online Catalog Access") is a Zoho Books Dropdown
// custom field with two options, "YES"/"NO" (all caps, exact) — not a Checkbox.
// Zoho rejects a JSON boolean or wrong-case string here ("Illegal value specified
// for a Dropdown field: ..."); it wants the option's own string value verbatim.
const catalogueField = () => [{ api_name: ZOHO_CATALOGUE_ACCESS_FIELD, value: 'YES' }];

/** Body for POST /contacts (new contact). */
export function buildZohoContactCreatePayload(
  buyer: BuyerForZoho,
  options: ZohoContactPayloadOptions = {},
): Record<string, unknown> {
  const business = isBusinessBuyer(buyer);
  const phone = normalizePhone10(buyer.phone);
  const gstin = buyer.gstin?.trim() || null;
  const person: Record<string, unknown> = {
    first_name: (buyer.contact_name ?? buyer.business_name).trim(),
    is_primary_contact: true,
  };
  if (buyer.email?.trim()) person.email = buyer.email.trim();
  if (phone) person.mobile = phone;

  const body: Record<string, unknown> = {
    contact_name: buyer.business_name.trim(),
    contact_type: 'customer',
    customer_sub_type: business ? 'business' : 'individual',
    contact_persons: [person],
    custom_fields: catalogueField(),
  };
  if (business) body.company_name = buyer.business_name.trim();
  if (phone) body.phone = phone;
  if (gstin) {
    body.gst_no = gstin;
    body.gst_treatment = buyer.gst_treatment?.trim() || 'business_gst';
  } else {
    body.gst_treatment = buyer.gst_treatment?.trim() || 'consumer';
  }
  const billing = buyer.billing_address;
  if (billing && typeof billing === 'object') {
    const address = billing as Record<string, unknown>;
    body.billing_address = {
      address: address.address ?? address.street ?? undefined,
      city: address.city ?? undefined,
      state: address.state ?? undefined,
      zip: address.zip ?? address.pincode ?? undefined,
      country: address.country ?? 'India',
    };
  }
  if (options.pricebookId) body.pricebook_id = options.pricebookId;
  return body;
}

/**
 * Body for PUT /contacts/{id} on an EXISTING contact (retry after a partial success, or a contact
 * found by phone/GSTIN/email). Only the catalogue flag (and optionally the pricebook) is touched;
 * Zoho requires contact_name on update so the existing name is echoed back.
 */
export function buildZohoContactUpdatePayload(
  existingContactName: string,
  options: ZohoContactPayloadOptions = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    contact_name: existingContactName,
    custom_fields: catalogueField(),
  };
  if (options.pricebookId) body.pricebook_id = options.pricebookId;
  return body;
}

export interface ZohoContactSummary {
  contact_id?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  gst_no?: string;
  status?: string;
}

export type ExistingContactMatchKind = 'gstin' | 'email' | 'phone';

/**
 * Verifies a Zoho search hit really is the same party (Zoho list filters are fuzzy), in the order
 * GSTIN > email > phone. Returns the kind that matched, or null.
 */
export function matchExistingContact(
  buyer: Pick<BuyerForZoho, 'gstin' | 'email' | 'phone'>,
  contact: ZohoContactSummary,
): ExistingContactMatchKind | null {
  const gstin = buyer.gstin?.trim().toUpperCase();
  if (gstin && contact.gst_no?.trim().toUpperCase() === gstin) return 'gstin';
  const email = buyer.email?.trim().toLowerCase();
  if (email && contact.email?.trim().toLowerCase() === email) return 'email';
  const phone = normalizePhone10(buyer.phone);
  if (phone && (normalizePhone10(contact.phone) === phone || normalizePhone10(contact.mobile) === phone)) return 'phone';
  return null;
}

/** Zoho "contact already exists" style failures (e.g. code 3062 duplicate name). */
export function isDuplicateContactError(message: string): boolean {
  return /already exists|duplicate|3062/i.test(message);
}

/** A pricebook/price-list related rejection: retry the write once without pricebook_id. */
export function isPricebookError(message: string): boolean {
  return /pricebook|price\s*list|price_list/i.test(message);
}
