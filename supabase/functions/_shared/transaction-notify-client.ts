/**
 * Fire-and-forget notify-ready call after Zoho push assigns a document number.
 * Mirrors the Supabase DB webhook payload consumed by /api/internal/transactions/notify-ready.
 */

export interface NotifyTransactionReadyInput {
  entityTable: 'orders' | 'estimates';
  entityId: string;
  documentNumber: string;
}

function resolveAppBaseUrl(): string | null {
  const base =
    Deno.env.get('YUKTI_APP_URL')?.trim()
    ?? Deno.env.get('NEXT_PUBLIC_APP_URL')?.trim()
    ?? '';
  return base ? base.replace(/\/$/, '') : null;
}

function resolvePushSecret(): string | null {
  return Deno.env.get('INTEGRATIONS_PUSH_SECRET')?.trim()
    ?? Deno.env.get('INTEGRATIONS_DISPATCH_SECRET')?.trim()
    ?? null;
}

export async function notifyTransactionReady(
  input: NotifyTransactionReadyInput,
): Promise<void> {
  const documentNumber = input.documentNumber?.trim();
  if (!documentNumber) return;

  const baseUrl = resolveAppBaseUrl();
  if (!baseUrl) {
    console.warn('[transaction-notify-client] YUKTI_APP_URL not set — skipping WhatsApp notify');
    return;
  }

  const secret = resolvePushSecret();
  if (!secret) {
    console.warn('[transaction-notify-client] INTEGRATIONS_PUSH_SECRET not set — skipping WhatsApp notify');
    return;
  }

  const numberField = input.entityTable === 'orders' ? 'order_number' : 'estimate_number';
  const body = {
    type: 'UPDATE',
    schema: 'app',
    table: input.entityTable,
    record: {
      id: input.entityId,
      [numberField]: documentNumber,
    },
    old_record: {
      [numberField]: null,
    },
  };

  try {
    const response = await fetch(`${baseUrl}/api/internal/transactions/notify-ready`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-push-secret': secret,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(
        `[transaction-notify-client] notify-ready failed (${response.status}) for ${input.entityTable}/${input.entityId}:`,
        text.slice(0, 500),
      );
      return;
    }

    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    console.log(
      `[transaction-notify-client] notify-ready ok for ${input.entityTable}/${input.entityId}:`,
      JSON.stringify(result),
    );
  } catch (err) {
    console.error(
      `[transaction-notify-client] notify-ready error for ${input.entityTable}/${input.entityId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
