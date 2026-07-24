'use client';

import { useEffect, useState } from 'react';
import { StatusTag } from '@/components/seller/layout';

interface FieldMappingRow {
  id: string;
  entity_type: string;
  zoho_field_name: string;
  target_column: string;
  transform_type: string;
  is_active: boolean;
  is_system: boolean;
}

function labelizeEntity(value: string) {
  if (value === 'customers') return 'Customer';
  if (value === 'estimates') return 'Estimate';
  if (value === 'invoices') return 'Invoice';
  return value;
}

// Read-only view of app.tenant_field_mappings for this tenant integration.
// Add/edit UI is deferred (MVP scope) — see specs/... plan for the framework
// this renders config for. The 3 rows shown today are seeded automatically
// for every zoho_books tenant_integration.
export function FieldMappingsPanel({ tenantIntegrationId }: { tenantIntegrationId: string }) {
  const [rows, setRows] = useState<FieldMappingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/settings/integrations/field-mappings?tenant_integration_id=${tenantIntegrationId}`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        if (body.error) {
          setError(body.error.message ?? 'Failed to load field mappings');
          return;
        }
        setRows(body.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load field mappings');
      });
    return () => {
      cancelled = true;
    };
  }, [tenantIntegrationId]);

  return (
    <div className="rounded-2xl border border-cream-200 bg-white p-4">
      <div className="text-sm font-semibold text-cream-900">Custom field mappings</div>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-cream-700">
        Zoho custom fields (cf_*) that are promoted into DealFlow columns on sync. Configured per tenant integration.
      </p>

      <div className="mt-4">
        {error ? (
          <div className="rounded-lg border border-dashed border-cream-300 bg-cream-50 px-3 py-4 text-sm text-cream-700">
            {error}
          </div>
        ) : rows === null ? (
          <div className="rounded-lg border border-dashed border-cream-300 bg-cream-50 px-3 py-4 text-sm text-cream-700">
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-cream-300 bg-cream-50 px-3 py-4 text-sm text-cream-700">
            No field mappings configured yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-cream-200">
            <table className="w-full text-sm">
              <thead className="bg-cream-50 text-xs uppercase tracking-[0.08em] text-cream-600">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Entity</th>
                  <th className="px-3 py-2 text-left font-semibold">Zoho field</th>
                  <th className="px-3 py-2 text-left font-semibold">Maps to</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-cream-200">
                    <td className="px-3 py-2 text-cream-900">{labelizeEntity(row.entity_type)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-cream-800">{row.zoho_field_name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-cream-800">{row.target_column}</td>
                    <td className="px-3 py-2">
                      <StatusTag
                        label={row.is_active ? 'Active' : 'Inactive'}
                        tone={row.is_active ? 'success' : 'neutral'}
                        className="text-[11px]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
