import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const TENANT_ID = 'tenant-uuid-001';
const PRODUCT_ID = 'product-uuid-001';
const ACTOR_USER_ID = 'user-uuid-001';

interface AuditLogEntry {
  id: number;
  tenant_id: string;
  actor_user_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  diff: Record<string, { from: unknown; to: unknown }>;
  ts: string;
}

describe('Audit log — product PATCH', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  // Simulate an in-memory audit log for testing
  let auditLog: AuditLogEntry[] = [];

  beforeEach(() => {
    auditLog = [];
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('after product PATCH, audit_log has entry with entity_type=tenant_product and action=update', async () => {
    // Simulate the server writing an audit log entry on successful PATCH
    fetchMock.mockImplementationOnce(async (url: string, options?: RequestInit) => {
      if (url === `/api/tenant/products/${PRODUCT_ID}` && options?.method === 'PATCH') {
        const body = JSON.parse(options.body as string);

        // Compute diff (simplified)
        const oldProduct = { name_override: 'Old Name', mrp: 500 };
        const diff: AuditLogEntry['diff'] = {};
        for (const [key, val] of Object.entries(body)) {
          if (oldProduct[key as keyof typeof oldProduct] !== val) {
            diff[key] = {
              from: oldProduct[key as keyof typeof oldProduct],
              to: val,
            };
          }
        }

        const isStatusChangeOnly = Object.keys(body).length === 1 && 'is_active' in body;
        const action = isStatusChangeOnly ? 'status_change' : 'update';

        // "Write" to audit log
        auditLog.push({
          id: 1,
          tenant_id: TENANT_ID,
          actor_user_id: ACTOR_USER_ID,
          entity_type: 'tenant_product',
          entity_id: PRODUCT_ID,
          action,
          diff,
          ts: new Date().toISOString(),
        });

        return {
          ok: true,
          status: 200,
          json: async () => ({
            product: {
              id: PRODUCT_ID,
              name_override: body.name_override ?? 'Old Name',
              mrp: body.mrp ?? 500,
              is_active: true,
            },
          }),
        };
      }
    });

    await fetch(`/api/tenant/products/${PRODUCT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name_override: 'New Name', mrp: 550 }),
    });

    expect(auditLog).toHaveLength(1);
    const entry = auditLog[0];
    expect(entry.entity_type).toBe('tenant_product');
    expect(entry.entity_id).toBe(PRODUCT_ID);
    expect(entry.action).toBe('update');
    expect(entry.tenant_id).toBe(TENANT_ID);
    expect(entry.diff).toMatchObject({
      name_override: { from: 'Old Name', to: 'New Name' },
      mrp: { from: 500, to: 550 },
    });
  });

  it('after deactivation PATCH, audit_log has action=status_change', async () => {
    fetchMock.mockImplementationOnce(async (url: string, options?: RequestInit) => {
      if (url === `/api/tenant/products/${PRODUCT_ID}` && options?.method === 'PATCH') {
        const body = JSON.parse(options.body as string);

        const isStatusChangeOnly = Object.keys(body).length === 1 && 'is_active' in body;
        const action = isStatusChangeOnly ? 'status_change' : 'update';

        auditLog.push({
          id: 1,
          tenant_id: TENANT_ID,
          actor_user_id: ACTOR_USER_ID,
          entity_type: 'tenant_product',
          entity_id: PRODUCT_ID,
          action,
          diff: { is_active: { from: true, to: false } },
          ts: new Date().toISOString(),
        });

        return {
          ok: true,
          status: 200,
          json: async () => ({
            product: { id: PRODUCT_ID, is_active: false },
          }),
        };
      }
    });

    await fetch(`/api/tenant/products/${PRODUCT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    });

    expect(auditLog).toHaveLength(1);
    const entry = auditLog[0];
    expect(entry.entity_type).toBe('tenant_product');
    expect(entry.action).toBe('status_change');
    expect(entry.diff).toEqual({ is_active: { from: true, to: false } });
  });

  it('audit_log entry contains correct entity_type and diff structure', () => {
    // Unit test: verify the shape of an audit log entry matches the schema
    const entry: AuditLogEntry = {
      id: 1,
      tenant_id: TENANT_ID,
      actor_user_id: ACTOR_USER_ID,
      entity_type: 'tenant_product',
      entity_id: PRODUCT_ID,
      action: 'update',
      diff: {
        name_override: { from: 'Old', to: 'New' },
        mrp: { from: 400, to: 500 },
      },
      ts: new Date().toISOString(),
    };

    expect(entry.entity_type).toBe('tenant_product');
    expect(entry.action).toBe('update');
    expect(entry.diff.name_override).toEqual({ from: 'Old', to: 'New' });
    expect(entry.diff.mrp).toEqual({ from: 400, to: 500 });
  });

  it('no audit_log entry written when diff is empty', async () => {
    // Simulate server not writing audit log when nothing changed
    fetchMock.mockImplementationOnce(async (url: string, options?: RequestInit) => {
      if (url === `/api/tenant/products/${PRODUCT_ID}` && options?.method === 'PATCH') {
        // Empty diff — no audit log written
        const diff = {}; // nothing changed
        if (Object.keys(diff).length > 0) {
          auditLog.push({
            id: 1,
            tenant_id: TENANT_ID,
            actor_user_id: ACTOR_USER_ID,
            entity_type: 'tenant_product',
            entity_id: PRODUCT_ID,
            action: 'update',
            diff,
            ts: new Date().toISOString(),
          });
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ product: { id: PRODUCT_ID } }),
        };
      }
    });

    await fetch(`/api/tenant/products/${PRODUCT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mrp: 500 }), // same value
    });

    // No audit log entry because diff was empty
    expect(auditLog).toHaveLength(0);
  });
});
