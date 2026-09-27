import { describe, expect, it } from 'vitest';

import {
  ZOHO_CATALOGUE_ACCESS_FIELD,
  buildZohoContactCreatePayload,
  buildZohoContactUpdatePayload,
  isDuplicateContactError,
  isPricebookError,
  matchExistingContact,
  normalizePhone10,
  type BuyerForZoho,
} from '../../../supabase/functions/_shared/push-buyer-utils';

const buyer: BuyerForZoho = {
  id: 'b1',
  business_name: 'Sri Krishna Enterprises',
  contact_name: 'Krishna Rao',
  email: 'Krishna@Example.com',
  phone: '+91 98765 43210',
  gstin: '36ABCDE1234F1Z5',
  gst_treatment: null,
  billing_address: { address: '1 Main Rd', city: 'Hyderabad', state: 'Telangana', zip: '500001' },
  custom_fields: { is_business: true },
};

describe('push-buyer-utils', () => {
  it('always sets cf_online_catalogue_access = "YES" on create (Zoho Dropdown field, not Checkbox)', () => {
    const body = buildZohoContactCreatePayload(buyer);
    expect(body.custom_fields).toEqual([{ api_name: ZOHO_CATALOGUE_ACCESS_FIELD, value: 'YES' }]);
    expect(ZOHO_CATALOGUE_ACCESS_FIELD).toBe('cf_online_catalogue_access');
  });

  it('builds a business customer with GST details and a 10-digit phone', () => {
    const body = buildZohoContactCreatePayload(buyer);
    expect(body).toMatchObject({
      contact_name: 'Sri Krishna Enterprises',
      company_name: 'Sri Krishna Enterprises',
      contact_type: 'customer',
      customer_sub_type: 'business',
      gst_no: '36ABCDE1234F1Z5',
      gst_treatment: 'business_gst',
      phone: '9876543210',
    });
    expect((body.contact_persons as Array<Record<string, unknown>>)[0]).toMatchObject({ first_name: 'Krishna Rao', mobile: '9876543210', is_primary_contact: true });
    expect(body.billing_address).toMatchObject({ city: 'Hyderabad', zip: '500001' });
  });

  it('builds an individual consumer without GST fields', () => {
    const body = buildZohoContactCreatePayload({ ...buyer, gstin: null, custom_fields: { is_business: false } });
    expect(body.customer_sub_type).toBe('individual');
    expect(body.gst_treatment).toBe('consumer');
    expect(body).not.toHaveProperty('gst_no');
    expect(body).not.toHaveProperty('company_name');
  });

  it('includes pricebook_id only when provided', () => {
    expect(buildZohoContactCreatePayload(buyer)).not.toHaveProperty('pricebook_id');
    expect(buildZohoContactCreatePayload(buyer, { pricebookId: 'pb-1' })).toHaveProperty('pricebook_id', 'pb-1');
    expect(buildZohoContactUpdatePayload('Name', { pricebookId: 'pb-1' })).toHaveProperty('pricebook_id', 'pb-1');
  });

  it('update payload only echoes the name and sets the catalogue flag', () => {
    expect(buildZohoContactUpdatePayload('Existing Name')).toEqual({
      contact_name: 'Existing Name',
      custom_fields: [{ api_name: 'cf_online_catalogue_access', value: 'YES' }],
    });
  });

  it('matches an existing Zoho contact by verified GSTIN, then email, then phone (never fuzzy hits)', () => {
    expect(matchExistingContact(buyer, { contact_id: '1', gst_no: '36abcde1234f1z5' })).toBe('gstin');
    expect(matchExistingContact(buyer, { contact_id: '1', email: 'krishna@example.com' })).toBe('email');
    expect(matchExistingContact(buyer, { contact_id: '1', mobile: '098765 43210' })).toBe('phone');
    expect(matchExistingContact(buyer, { contact_id: '1', email: 'other@example.com', phone: '9999999999', gst_no: 'X' })).toBeNull();
  });

  it('does not match on an empty phone / email', () => {
    expect(matchExistingContact({ gstin: null, email: null, phone: null }, { contact_id: '1', phone: '', email: '' })).toBeNull();
  });

  it('normalizes phones and classifies Zoho errors', () => {
    expect(normalizePhone10('91-98765-43210')).toBe('9876543210');
    expect(normalizePhone10('12345')).toBe('');
    expect(isDuplicateContactError('The contact "X" already exists. (3062)')).toBe(true);
    expect(isDuplicateContactError('Invalid token')).toBe(false);
    expect(isPricebookError('Invalid value passed for pricebook_id')).toBe(true);
    expect(isPricebookError('Invalid gst_no')).toBe(false);
  });
});
