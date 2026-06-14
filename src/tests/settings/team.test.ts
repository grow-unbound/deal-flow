import {
  InviteUserSchema,
  UpdateMemberRoleSchema,
  UpdateMemberSchema,
} from '../../lib/zod';

describe('InviteUserSchema', () => {
  it('accepts valid member details', () => {
    const result = InviteUserSchema.safeParse({
      full_name: 'Phani K',
      email: 'colleague@company.com',
      phone: '9876543210',
      role: 'seller_assistant',
      location_ids: ['loc-1'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts seller_admin role', () => {
    const result = InviteUserSchema.safeParse({
      full_name: 'Admin User',
      email: 'admin@company.com',
      phone: '9876543210',
      role: 'seller_admin',
      location_ids: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects seller_assistant without locations', () => {
    const result = InviteUserSchema.safeParse({
      full_name: 'Phani K',
      email: 'colleague@company.com',
      phone: '9876543210',
      role: 'seller_assistant',
      location_ids: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.location_ids).toBeDefined();
    }
  });

  it('rejects invalid email', () => {
    const result = InviteUserSchema.safeParse({
      full_name: 'Phani K',
      email: 'not-an-email',
      phone: '9876543210',
      role: 'seller_assistant',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email).toBeDefined();
    }
  });

  it('rejects invalid phone number', () => {
    const result = InviteUserSchema.safeParse({
      full_name: 'Phani K',
      email: 'user@example.com',
      phone: '12345',
      role: 'seller_assistant',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.phone).toBeDefined();
    }
  });

  it('rejects invalid role', () => {
    const result = InviteUserSchema.safeParse({
      full_name: 'Phani K',
      email: 'user@example.com',
      phone: '9876543210',
      role: 'buyer_admin',
    } as never);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.role).toBeDefined();
    }
  });

  it('rejects missing full name', () => {
    const result = InviteUserSchema.safeParse({
      email: 'user@example.com',
      phone: '9876543210',
      role: 'seller_assistant',
    } as never);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.full_name).toBeDefined();
    }
  });
});

describe('UpdateMemberSchema', () => {
  it('accepts valid seller member details', () => {
    expect(
      UpdateMemberSchema.safeParse({
        full_name: 'Phani K',
        email: 'phani@example.com',
        phone: '9876543210',
        role: 'seller_admin',
        location_ids: null,
      }).success,
    ).toBe(true);
  });

  it('rejects assistant updates without locations', () => {
    expect(
      UpdateMemberSchema.safeParse({
        full_name: 'Phani K',
        email: 'phani@example.com',
        phone: '9876543210',
        role: 'seller_assistant',
        location_ids: [],
      }).success,
    ).toBe(false);
  });

  it('rejects buyer roles', () => {
    expect(
      UpdateMemberSchema.safeParse({
        full_name: 'Phani K',
        email: 'phani@example.com',
        phone: '9876543210',
        role: 'buyer_admin',
      } as never).success,
    ).toBe(false);
  });

  it('rejects empty phone number', () => {
    expect(
      UpdateMemberSchema.safeParse({
        full_name: 'Phani K',
        email: 'phani@example.com',
        phone: '',
        role: 'seller_admin',
      } as never).success,
    ).toBe(false);
  });
});

describe('UpdateMemberRoleSchema', () => {
  it('accepts valid seller roles', () => {
    expect(UpdateMemberRoleSchema.safeParse({ role: 'seller_admin' }).success).toBe(true);
    expect(UpdateMemberRoleSchema.safeParse({ role: 'seller_assistant' }).success).toBe(true);
  });

  it('rejects buyer roles', () => {
    expect(UpdateMemberRoleSchema.safeParse({ role: 'buyer_admin' as never }).success).toBe(false);
  });

  it('rejects empty role', () => {
    expect(UpdateMemberRoleSchema.safeParse({ role: '' as never }).success).toBe(false);
  });
});

describe('getFlag fail-closed behaviour', () => {
  it('returns false when PostHog throws', async () => {
    jest.resetModules();
    jest.mock('posthog-node', () => ({
      PostHog: jest.fn().mockImplementation(() => ({
        evaluateFlags: () => { throw new Error('network error'); },
      })),
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getFlag } = require('../../lib/flags') as { getFlag: (f: string, t: string) => Promise<boolean> };
    const result = await getFlag('df_tenant_onboarding', 'some-tenant-id');
    expect(result).toBe(false);
    jest.resetModules();
  });

  it('returns false when NEXT_PUBLIC_POSTHOG_KEY is missing', async () => {
    jest.resetModules();
    const saved = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getFlag } = require('../../lib/flags') as { getFlag: (f: string, t: string) => Promise<boolean> };
    const result = await getFlag('df_tenant_onboarding', 'some-tenant-id');
    expect(result).toBe(false);
    process.env.NEXT_PUBLIC_POSTHOG_KEY = saved;
    jest.resetModules();
  });
});
