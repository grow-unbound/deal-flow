export type IntegrationJobErrorLogEntry = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeIntegrationJobErrorLog(value: unknown): IntegrationJobErrorLogEntry[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  if (isRecord(value) && Array.isArray(value.entries)) {
    return value.entries.filter(isRecord);
  }

  return [];
}

export function formatIntegrationJobError(entry: unknown): string {
  const record = isRecord(entry) ? entry : {};
  const message =
    typeof record.error === 'string'
      ? record.error
      : typeof record.message === 'string'
        ? record.message
        : 'Unknown error';

  const parts = [
    typeof record.entity_type === 'string' ? `[${record.entity_type}]` : null,
    typeof record.external_id === 'string' ? `${record.external_id}:` : null,
    message,
  ].filter(Boolean);

  return parts.join(' ');
}
