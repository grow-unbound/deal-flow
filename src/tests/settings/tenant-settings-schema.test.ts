import { describe, expect, it } from 'vitest';
import { buildGeneralSettingsView } from '@/lib/tenant-settings/build-general-view';
import { GstinSchema, TenantSettingsBusinessSchema, TenantSettingsPatchSchema } from '@/types/tenant-settings';

describe('GstinSchema', () => {
  it('accepts empty string', () => {
    expect(GstinSchema.safeParse('').success).toBe(true);
  });

  it('accepts valid 15-char GSTIN', () => {
    expect(GstinSchema.safeParse('27AABCU9603R1ZM').success).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(GstinSchema.safeParse('27AABCU9603R1Z').success).toBe(false);
  });

  it('accepts lowercase letters (pattern is case-insensitive)', () => {
    expect(GstinSchema.safeParse('27aabcu9603r1zm').success).toBe(true);
  });
});

describe('TenantSettingsBusinessSchema', () => {
  const valid = {
    company_name: 'Acme',
    tagline: 'Wholesale catalog',
    gstin: '',
    address: { line1: '1', line2: '', city: 'Mumbai', state: 'MH', pincode: '400001' },
    phone: '',
    email: 'a@b.co',
  };

  it('parses minimal business', () => {
    const r = TenantSettingsBusinessSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('rejects invalid email when non-empty', () => {
    const r = TenantSettingsBusinessSchema.safeParse({ ...valid, email: 'not-an-email' });
    expect(r.success).toBe(false);
  });
});

describe('TenantSettingsPatchSchema', () => {
  it('accepts whatsapp partial', () => {
    const r = TenantSettingsPatchSchema.safeParse({
      notifications: { whatsapp: { enquiry_received: false } },
    });
    expect(r.success).toBe(true);
  });

  it('accepts business partial', () => {
    const r = TenantSettingsPatchSchema.safeParse({
      business: { company_name: 'X' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts product_defaults partial (UOM)', () => {
    const r = TenantSettingsPatchSchema.safeParse({
      product_defaults: { uom: 'PCS' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts orders nested partial', () => {
    const r = TenantSettingsPatchSchema.safeParse({
      orders: {
        number_format: 'SO-{YYYY}-{SEQ}',
        features: { enquiries: true },
      },
    });
    expect(r.success).toBe(true);
  });

  it('accepts buyer_app and catalog partials', () => {
    const r = TenantSettingsPatchSchema.safeParse({
      buyer_app: { enabled: false },
      catalog: { cohort_pricing_enabled: true, price_visibility: 'show_both' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid inventory_lock_stage', () => {
    const r = TenantSettingsPatchSchema.safeParse({
      orders: { inventory_lock_stage: 'bogus' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid price_visibility', () => {
    const r = TenantSettingsPatchSchema.safeParse({
      catalog: { price_visibility: 'invalid' },
    });
    expect(r.success).toBe(false);
  });

  it('accepts business_policy gst_rate partial', () => {
    const r = TenantSettingsPatchSchema.safeParse({
      business_policy: { gst_rate: 12 },
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid gst_rate in business_policy', () => {
    const r = TenantSettingsPatchSchema.safeParse({
      business_policy: { gst_rate: 99 },
    });
    expect(r.success).toBe(false);
  });
});

describe('buildGeneralSettingsView', () => {
  it('defaults delivery routing threshold to 50km when missing', () => {
    const view = buildGeneralSettingsView({}, {
      business_name: 'Acme',
      tagline: null,
      gstin: null,
      primary_state: null,
      plan: 'starter',
    });

    expect(view.delivery_routing_threshold_km).toBe(50);
  });

  it('reads tagline from tenant row when not in settings JSON', () => {
    const view = buildGeneralSettingsView({}, {
      business_name: 'Acme',
      tagline: 'Wholesale catalog',
      gstin: null,
      primary_state: null,
      plan: 'starter',
    });

    expect(view.business.tagline).toBe('Wholesale catalog');
  });
});
