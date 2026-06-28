export type ZohoWebhookRuleType = 'add_edit' | 'delete';

export interface ZohoWebhookRegistrationTarget {
  webhook_id?: string;
  webhook_name?: string;
  url?: string;
  entity?: string;
  related_rules?: Array<{
    workflow_id?: string;
  }>;
}

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
  // Append ?event_type= to the URL so the webhook handler can distinguish
  // upsert from delete without parsing the body — Zoho's Default Payload does
  // not include an event_type field in the body.
  const eventTypeParam = input.ruleType === 'delete' ? 'delete' : 'upsert';
  const urlWithEventType = `${input.webhookUrl}?event_type=${eventTypeParam}`;

  return {
    webhook_name: `${input.entityType} ${input.ruleType} - Yukti`,
    description: `Yukti inbound ${input.entityType} ${input.ruleType}`,
    entity: input.providerEntity,
    method: 'POST',
    url: urlWithEventType,
    secret: input.secret,
    headers: [{
      param_name: 'x-zoho-webhook-token',
      param_value: input.secret,  // always sent — never empty
    }],
    // Omitting body_type/raw_data selects Zoho's Default Payload: JSON with the
    // complete entity object, e.g. { "contact": { ...all fields... } }.
    // For delete events Zoho sends only the entity ID (entity is already gone).
  };
}

export function buildZohoWebhookRegistrationName(input: {
  entityType: string;
  ruleType: ZohoWebhookRuleType;
}) {
  return `${input.entityType} ${input.ruleType} - Yukti`;
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

function getZohoModulePath(integrationTypeId: string) {
  return integrationTypeId === 'zoho_inventory' ? 'inventory/v1' : 'books/v3';
}

async function listZohoWebhooks(input: {
  accessToken: string;
  orgId: string;
  dc: string;
  integrationTypeId: string;
}): Promise<ZohoWebhookRegistrationTarget[]> {
  const url = new URL(`/${getZohoModulePath(input.integrationTypeId)}/settings/webhooks`, `https://www.zohoapis.${input.dc}`);
  url.searchParams.set('organization_id', input.orgId);

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Zoho-oauthtoken ${input.accessToken}` },
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok || json.code !== 0) {
    throw new Error(`Zoho webhook list failed (${response.status}): ${String(json.message ?? 'Unknown Zoho error')}`);
  }

  return Array.isArray(json.webhooks)
    ? (json.webhooks as ZohoWebhookRegistrationTarget[]).filter((value) => typeof value === 'object' && value !== null)
    : [];
}

export async function deleteZohoWebhookRegistrations(input: {
  accessToken: string;
  orgId: string;
  dc: string;
  integrationTypeId: string;
  remoteWebhookIds?: string[];
  workflowIds?: string[];
}): Promise<void> {
  const modulePath = getZohoModulePath(input.integrationTypeId);
  const webhookIds = [...new Set((input.remoteWebhookIds ?? []).filter((id): id is string => Boolean(id)))];
  const workflowIds = [...new Set((input.workflowIds ?? []).filter((id): id is string => Boolean(id)))];

  await Promise.all(workflowIds.map((workflowId) => {
    const workflowUrl = new URL(`/${modulePath}/settings/workflows/${workflowId}`, `https://www.zohoapis.${input.dc}`);
    workflowUrl.searchParams.set('organization_id', input.orgId);
    return fetch(workflowUrl.toString(), {
      method: 'DELETE',
      headers: { Authorization: `Zoho-oauthtoken ${input.accessToken}` },
    }).catch(() => undefined);
  }));

  await Promise.all(webhookIds.map((webhookId) => {
    const webhookUrl = new URL(`/${modulePath}/settings/webhooks/${webhookId}`, `https://www.zohoapis.${input.dc}`);
    webhookUrl.searchParams.set('organization_id', input.orgId);
    return fetch(webhookUrl.toString(), {
      method: 'DELETE',
      headers: { Authorization: `Zoho-oauthtoken ${input.accessToken}` },
    }).catch(() => undefined);
  }));
}

export async function deleteZohoWebhookRegistrationsByName(input: {
  accessToken: string;
  orgId: string;
  dc: string;
  integrationTypeId: string;
  webhookNames: string[];
  callbackUrls?: string[];
}): Promise<void> {
  const webhooks = await listZohoWebhooks(input);
  const matching = webhooks.filter((webhook) => {
    if (typeof webhook.webhook_name === 'string' && input.webhookNames.includes(webhook.webhook_name)) {
      return true;
    }

    if (typeof webhook.url === 'string' && (input.callbackUrls ?? []).some((callbackUrl) => webhook.url === callbackUrl)) {
      return true;
    }

    return false;
  });

  const workflowIds = matching.flatMap((webhook) => (
    Array.isArray(webhook.related_rules)
      ? webhook.related_rules.flatMap((rule) => (typeof rule?.workflow_id === 'string' ? [rule.workflow_id] : []))
      : []
  ));

  await deleteZohoWebhookRegistrations({
    accessToken: input.accessToken,
    orgId: input.orgId,
    dc: input.dc,
    integrationTypeId: input.integrationTypeId,
    remoteWebhookIds: matching.flatMap((webhook) => (typeof webhook.webhook_id === 'string' ? [webhook.webhook_id] : [])),
    workflowIds,
  });
}
