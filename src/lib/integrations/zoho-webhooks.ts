export type ZohoWebhookRuleType = 'add_edit' | 'delete';

const ZOHO_PROVIDER_ID_FIELD_BY_ENTITY: Record<string, string> = {
  contacts: 'contact_id',
  items: 'item_id',
  estimates: 'estimate_id',
  invoices: 'invoice_id',
  salesorders: 'salesorder_id',
};

const ZOHO_EVENT_PREFIX_BY_ENTITY: Record<string, string> = {
  contacts: 'contact',
  items: 'item',
  estimates: 'estimate',
  invoices: 'invoice',
  salesorders: 'salesorder',
};

const ZOHO_TIMESTAMP_FIELDS_BY_ENTITY: Record<string, string[]> = {
  contacts: ['last_modified_time', 'updated_time', 'created_time'],
  items: ['last_modified_time', 'updated_time', 'created_time'],
  estimates: ['last_modified_time', 'updated_time', 'created_time', 'date'],
  invoices: ['last_modified_time', 'updated_time', 'created_time', 'date'],
  salesorders: ['last_modified_time', 'updated_time', 'created_time', 'date'],
};

export function getZohoWebhookProviderIdField(entityType: string): string | null {
  return ZOHO_PROVIDER_ID_FIELD_BY_ENTITY[entityType] ?? null;
}

export function getZohoWebhookEventPrefix(entityType: string): string | null {
  return ZOHO_EVENT_PREFIX_BY_ENTITY[entityType] ?? null;
}

export function getZohoWebhookTimestampFields(entityType: string): string[] {
  return ZOHO_TIMESTAMP_FIELDS_BY_ENTITY[entityType] ?? ['last_modified_time', 'updated_time', 'created_time'];
}

export function buildZohoWorkflowEventType(entityType: string, ruleType: ZohoWebhookRuleType): string {
  const prefix = getZohoWebhookEventPrefix(entityType) ?? entityType.replace(/s$/, '');
  return ruleType === 'delete' ? `${prefix}.deleted` : `${prefix}.add_edit`;
}

export function resolveZohoWebhookEventType(
  entityType: string,
  rawEventType: string | null,
  operation: 'create' | 'update' | 'soft_delete' | 'skip' | 'conflict',
): string | null {
  if (operation === 'soft_delete') {
    return rawEventType ?? buildZohoWorkflowEventType(entityType, 'delete');
  }

  const prefix = getZohoWebhookEventPrefix(entityType) ?? entityType.replace(/s$/, '');
  if (!rawEventType) {
    return operation === 'create' ? `${prefix}.created` : operation === 'update' ? `${prefix}.updated` : null;
  }

  if (rawEventType.endsWith('.add_edit') || rawEventType.endsWith('.changed') || rawEventType.endsWith('.upsert')) {
    return operation === 'create' ? `${prefix}.created` : operation === 'update' ? `${prefix}.updated` : rawEventType;
  }

  return rawEventType;
}

export function buildZohoWebhookRegistrationPayload(input: {
  webhookUrl: string;
  entityType: string;
  providerEntity: string;
  secret: string;
  ruleType: ZohoWebhookRuleType;
}) {
  return {
    webhook_name: `${input.entityType} ${input.ruleType} - Yukti`,
    description: `Yukti inbound ${input.entityType} ${input.ruleType}`,
    entity: input.providerEntity,
    method: 'POST',
    url: input.webhookUrl,
    secret: input.secret,
    headers: [{
      param_name: 'x-zoho-webhook-token',
      param_value: input.secret,
    }],
    // Omitting body_type/raw_data selects Zoho's Default Payload. That is the
    // working WineYard contract: JSON with the complete entity object, e.g.
    // { "invoice": { ...all invoice fields... } }.
  };
}

export function buildZohoWorkflowRegistrationPayload(input: {
  entityType: string;
  providerEntity: string;
  webhookId: string;
  ruleType: ZohoWebhookRuleType;
}) {
  return {
    workflow_name: `${input.entityType} ${input.ruleType} - Yukti`,
    description: `Yukti inbound ${input.entityType} ${input.ruleType} sync`,
    rule_type: input.ruleType,
    entity: input.providerEntity,
    rule: {},
    apply_rule_always: true,
    instant_actions: [
      {
        action_id: input.webhookId,
        action_type: 'webhook',
      },
    ],
  };
}
