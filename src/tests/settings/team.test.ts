import { InviteUserSchema, UpdateMemberRoleSchema } from '../../lib/zod';

describe('InviteUserSchema', () => {
  it('accepts valid email and role', () => {
    const result = InviteUserSchema.safeParse({
      email: 'colleague@company.com',
      role: 'seller_assistant',
    });
    expect(result.success).toBe(true);
  });

  it('accepts seller_admin role', () => {
    const result = InviteUserSchema.safeParse({
      email: 'admin@company.com',
      role: 'seller_admin',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = InviteUserSchema.safeParse({
      email: 'not-an-email',
      role: 'seller_assistant',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email).toBeDefined();
    }
  });

  it('rejects invalid role', () => {
    const result = InviteUserSchema.safeParse({
      email: 'user@example.com',
      role: 'buyer_admin',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.role).toBeDefined();
    }
  });

  it('rejects missing email', () => {
    const result = InviteUserSchema.safeParse({ role: 'seller_assistant' });
    expect(result.success).toBe(false);
  });
});

describe('UpdateMemberRoleSchema', () => {
  it('accepts valid seller roles', () => {
    expect(UpdateMemberRoleSchema.safeParse({ role: 'seller_admin' }).success).toBe(true);
    expect(UpdateMemberRoleSchema.safeParse({ role: 'seller_assistant' }).success).toBe(true);
  });

  it('rejects buyer roles', () => {
    expect(UpdateMemberRoleSchema.safeParse({ role: 'buyer_admin' }).success).toBe(false);
  });

  it('rejects empty role', () => {
    expect(UpdateMemberRoleSchema.safeParse({ role: '' }).success).toBe(false);
  });
});

describe('getFlag fail-closed behaviour', () => {
  it('returns false when PostHog throws', async () => {
    jest.resetModules();
    jest.mock('posthog-node', () => ({
      PostHog: jest.fn().mockImplementation(() => ({
        isFeatureEnabled: () => { throw new Error('network error'); },
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
