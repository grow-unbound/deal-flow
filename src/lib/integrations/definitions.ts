import type { IntegrationTypeId } from './contracts';
import { ZOHO_DAILY_SYNC_CRON } from './schedule.ts';

export type IntegrationFlowDirection = 'inbound' | 'outbound' | 'bidirectional';
export type IntegrationFlowTrigger = 'webhook' | 'scheduled' | 'event';

export interface IntegrationMappingDefinition {
  source_system: string;
  source_entity: string;
  source_label: string;
  target_entity: string;
  target_label: string;
  target_table: string;
  direction: IntegrationFlowDirection;
  trigger_type: IntegrationFlowTrigger;
  webhook_events: string[];
  note?: string;
}

export interface IntegrationTopologyDefinition {
  integration_type_id: IntegrationTypeId;
  integration_label: string;
  webhook_event_types: string[];
  mappings: IntegrationMappingDefinition[];
  notes: string[];
}

export interface IntegrationWebhookDefinition {
  entity_type: string;
  /** Provider-specific singular entity value required by Zoho's webhook API. */
  provider_entity: string;
  /** Zoho event names registered for this one remote webhook. */
  event_types: string[];
  /** Internal sync phase to run after the callback is authenticated. */
  sync_phase: 'customers' | 'products' | 'estimates' | 'orders' | 'invoices';
  /** Zoho Books workflow rules that invoke the one entity webhook. */
  workflow_rule_types?: Array<'add_edit' | 'delete'>;
}

export interface IntegrationDataFlowSeed {
  tenant_id: string;
  tenant_integration_id: string;
  integration_type_id: IntegrationTypeId;
  /** Kept for non-Zoho callers while existing rows are migrated. */
  webhook_id?: string | null;
  webhook_ids_by_entity?: Record<string, string | null | undefined>;
  created_by?: string | null;
  updated_by?: string | null;
}

export type IntegrationMappingMode = 'webhook_backed' | 'scheduled' | 'derived_local';

const SUPPORTED_FLOW_ENTITY_TYPES = new Set([
  'locations',
  'categories',
  'brands',
  'products',
  'pricelists',
  'customers',
  'estimates',
  'orders',
  'invoices',
]);

const DERIVED_LOCAL_NOTE_RE = /(derived|normalized|backfill|scheduled\/import refresh|remain local|not implemented)/i;

const ZOHO_BOOKS_WEBHOOK_EVENTS = [
  'invoice.created',
  'invoice.updated',
  'invoice.deleted',
  'salesorder.created',
  'salesorder.updated',
  'salesorder.deleted',
  'estimate.created',
  'estimate.updated',
  'estimate.deleted',
  'contact.created',
  'contact.updated',
  'contact.deleted',
  'item.created',
  'item.updated',
  'item.deleted',
] as const;

const ZOHO_INVENTORY_WEBHOOK_EVENTS = [
  'item.created',
  'item.updated',
] as const;

const ZOHO_WEBHOOK_DEFINITIONS: Partial<Record<IntegrationTypeId, IntegrationWebhookDefinition[]>> = {
  zoho_books: [
    { entity_type: 'contacts', provider_entity: 'customer', event_types: ['contact.created', 'contact.updated', 'contact.deleted'], sync_phase: 'customers', workflow_rule_types: ['add_edit', 'delete'] },
    { entity_type: 'items', provider_entity: 'item', event_types: ['item.created', 'item.updated', 'item.deleted'], sync_phase: 'products', workflow_rule_types: ['add_edit', 'delete'] },
    { entity_type: 'estimates', provider_entity: 'estimate', event_types: ['estimate.created', 'estimate.updated', 'estimate.deleted'], sync_phase: 'estimates', workflow_rule_types: ['add_edit', 'delete'] },
    { entity_type: 'invoices', provider_entity: 'invoice', event_types: ['invoice.created', 'invoice.updated', 'invoice.deleted'], sync_phase: 'invoices', workflow_rule_types: ['add_edit', 'delete'] },
    { entity_type: 'salesorders', provider_entity: 'salesorder', event_types: ['salesorder.created', 'salesorder.updated', 'salesorder.deleted'], sync_phase: 'orders', workflow_rule_types: ['add_edit', 'delete'] },
  ],
  zoho_inventory: [
    { entity_type: 'items', provider_entity: 'item', event_types: [...ZOHO_INVENTORY_WEBHOOK_EVENTS], sync_phase: 'products' },
  ],
};

const COMMON_LOCAL_BRIDGE_NOTES = [
  'Local bridge sync is not implemented yet.',
  'These mappings are persisted so the UI can show the intended write-back and capture model.',
];

const INTEGRATION_TOPOLOGIES: Record<IntegrationTypeId, IntegrationTopologyDefinition> = {
  zoho_books: {
    integration_type_id: 'zoho_books',
    integration_label: 'Zoho Books',
    webhook_event_types: [...ZOHO_BOOKS_WEBHOOK_EVENTS],
    notes: [
      'Zoho Books can capture live changes for reference and transactional entities through webhooks.',
      'Contact persons are derived from contact syncs; they do not have a separate Zoho webhook stream.',
    ],
    mappings: [
      {
        source_system: 'Zoho Books',
        source_entity: 'locations',
        source_label: 'Zoho locations',
        target_entity: 'locations',
        target_label: 'Yukti locations',
        target_table: 'app.locations',
        direction: 'inbound',
        trigger_type: 'event',
        webhook_events: [],
        note: 'Imported as reference data and refreshed with the import worker.',
      },
      {
        source_system: 'Zoho Books',
        source_entity: 'contacts',
        source_label: 'Zoho.contacts',
        target_entity: 'customers',
        target_label: 'Yukti.buyers',
        target_table: 'app.buyers',
        direction: 'inbound',
        trigger_type: 'webhook',
        webhook_events: ['contact.created', 'contact.updated'],
      },
      {
        source_system: 'Zoho Books',
        source_entity: 'contact_persons',
        source_label: 'Zoho.contact_persons',
        target_entity: 'buyer_users',
        target_label: 'Yukti.buyer_users',
        target_table: 'app.buyer_users',
        direction: 'inbound',
        trigger_type: 'event',
        webhook_events: ['contact.created', 'contact.updated'],
        note: 'Synced when the parent contact webhook or import refresh runs.',
      },
      {
        source_system: 'Zoho Books',
        source_entity: 'items',
        source_label: 'Zoho.items',
        target_entity: 'products',
        target_label: 'Yukti.products',
        target_table: 'app.tenant_products',
        direction: 'inbound',
        trigger_type: 'webhook',
        webhook_events: ['item.created', 'item.updated'],
      },
      {
        source_system: 'Zoho Books',
        source_entity: 'items',
        source_label: 'Zoho.items',
        target_entity: 'brands',
        target_label: 'Yukti.tenant_brands',
        target_table: 'app.tenant_brands',
        direction: 'inbound',
        trigger_type: 'event',
        webhook_events: ['item.created', 'item.updated'],
        note: 'Brand metadata is normalized from item master fields when present.',
      },
      {
        source_system: 'Zoho Books',
        source_entity: 'items',
        source_label: 'Zoho.items',
        target_entity: 'tenant_inventory',
        target_label: 'Yukti.tenant_inventory',
        target_table: 'app.tenant_inventory',
        direction: 'inbound',
        trigger_type: 'event',
        webhook_events: ['item.created', 'item.updated'],
        note: 'Inventory rows are derived from item and warehouse quantity snapshots.',
      },
      {
        source_system: 'Zoho Books',
        source_entity: 'items',
        source_label: 'Zoho.items',
        target_entity: 'categories',
        target_label: 'Yukti.tenant_categories',
        target_table: 'app.tenant_categories',
        direction: 'inbound',
        trigger_type: 'event',
        webhook_events: ['item.created', 'item.updated'],
        note: 'Category metadata is normalized from item master fields when present.',
      },
      {
        source_system: 'Zoho Books',
        source_entity: 'items',
        source_label: 'Zoho.items',
        target_entity: 'pricelists',
        target_label: 'Yukti.price_lists',
        target_table: 'app.price_lists',
        direction: 'inbound',
        trigger_type: 'event',
        webhook_events: ['item.created', 'item.updated'],
        note: 'Synced from Zoho sales pricebooks and refreshed alongside product imports.',
      },
      {
        source_system: 'Zoho Books',
        source_entity: 'items',
        source_label: 'Zoho.items',
        target_entity: 'pricelist_items',
        target_label: 'Yukti.pricelist_items',
        target_table: 'app.price_list_items',
        direction: 'inbound',
        trigger_type: 'event',
        webhook_events: ['item.created', 'item.updated'],
        note: 'Per-item price rows are imported from Zoho pricebook line items.',
      },
      {
        source_system: 'Zoho Books',
        source_entity: 'estimates',
        source_label: 'Zoho.estimates',
        target_entity: 'estimates',
        target_label: 'Yukti.estimates',
        target_table: 'app.estimates',
        direction: 'inbound',
        trigger_type: 'webhook',
        webhook_events: ['estimate.created', 'estimate.updated'],
      },
      {
        source_system: 'Zoho Books',
        source_entity: 'estimates',
        source_label: 'Zoho.estimates',
        target_entity: 'estimate_items',
        target_label: 'Yukti.estimate_items',
        target_table: 'app.estimate_items',
        direction: 'inbound',
        trigger_type: 'webhook',
        webhook_events: ['estimate.created', 'estimate.updated'],
        note: 'Estimate line items are stored alongside the parent estimate.',
      },
      {
        source_system: 'Zoho Books',
        source_entity: 'salesorders',
        source_label: 'Zoho.salesorders',
        target_entity: 'orders',
        target_label: 'Yukti.orders',
        target_table: 'app.orders',
        direction: 'inbound',
        trigger_type: 'webhook',
        webhook_events: ['salesorder.created', 'salesorder.updated'],
      },
      {
        source_system: 'Zoho Books',
        source_entity: 'salesorders',
        source_label: 'Zoho.salesorders',
        target_entity: 'order_items',
        target_label: 'Yukti.order_items',
        target_table: 'app.order_items',
        direction: 'inbound',
        trigger_type: 'webhook',
        webhook_events: ['salesorder.created', 'salesorder.updated'],
        note: 'Sales order line items are stored alongside the parent order.',
      },
      {
        source_system: 'Zoho Books',
        source_entity: 'invoices',
        source_label: 'Zoho.invoices',
        target_entity: 'invoices',
        target_label: 'Yukti.invoices',
        target_table: 'app.invoices',
        direction: 'inbound',
        trigger_type: 'webhook',
        webhook_events: ['invoice.created', 'invoice.updated'],
      },
      {
        source_system: 'Zoho Books',
        source_entity: 'invoices',
        source_label: 'Zoho.invoices',
        target_entity: 'invoice_items',
        target_label: 'Yukti.invoice_items',
        target_table: 'app.invoice_items',
        direction: 'inbound',
        trigger_type: 'webhook',
        webhook_events: ['invoice.created', 'invoice.updated'],
        note: 'Invoice line items are stored alongside the parent invoice.',
      },
    ],
  },
  zoho_inventory: {
    integration_type_id: 'zoho_inventory',
    integration_label: 'Zoho Inventory',
    webhook_event_types: [...ZOHO_INVENTORY_WEBHOOK_EVENTS],
    notes: [
      'Zoho Inventory live webhooks are currently limited to item events.',
      'Customers, orders, and warehouses are refreshed by the sync worker and not by a direct inventory webhook stream.',
    ],
    mappings: [
      {
        source_system: 'Zoho Inventory',
        source_entity: 'warehouses',
        source_label: 'Zoho.warehouses',
        target_entity: 'locations',
        target_label: 'Yukti.locations',
        target_table: 'app.locations',
        direction: 'inbound',
        trigger_type: 'event',
        webhook_events: [],
        note: 'Warehouse refresh happens through the import worker.',
      },
      {
        source_system: 'Zoho Inventory',
        source_entity: 'contacts',
        source_label: 'Zoho.contacts',
        target_entity: 'customers',
        target_label: 'Yukti.buyers',
        target_table: 'app.buyers',
        direction: 'inbound',
        trigger_type: 'event',
        webhook_events: [],
        note: 'Captured by scheduled/import refresh only.',
      },
      {
        source_system: 'Zoho Inventory',
        source_entity: 'items',
        source_label: 'Zoho.items',
        target_entity: 'brands',
        target_label: 'Yukti.tenant_brands',
        target_table: 'app.tenant_brands',
        direction: 'inbound',
        trigger_type: 'event',
        webhook_events: ['item.created', 'item.updated', 'item.deleted'],
        note: 'Brand metadata is normalized from item master fields when present.',
      },
      {
        source_system: 'Zoho Inventory',
        source_entity: 'items',
        source_label: 'Zoho.items',
        target_entity: 'tenant_inventory',
        target_label: 'Yukti.tenant_inventory',
        target_table: 'app.tenant_inventory',
        direction: 'inbound',
        trigger_type: 'webhook',
        webhook_events: ['item.created', 'item.updated', 'item.deleted'],
        note: 'Inventory rows are refreshed from item stock and warehouse snapshots.',
      },
      {
        source_system: 'Zoho Inventory',
        source_entity: 'items',
        source_label: 'Zoho.items',
        target_entity: 'categories',
        target_label: 'Yukti.tenant_categories',
        target_table: 'app.tenant_categories',
        direction: 'inbound',
        trigger_type: 'event',
        webhook_events: ['item.created', 'item.updated', 'item.deleted'],
        note: 'Category metadata is normalized from item master fields when present.',
      },
      {
        source_system: 'Zoho Inventory',
        source_entity: 'items',
        source_label: 'Zoho.items',
        target_entity: 'pricelists',
        target_label: 'Yukti.price_lists',
        target_table: 'app.price_lists',
        direction: 'inbound',
        trigger_type: 'event',
        webhook_events: ['item.created', 'item.updated', 'item.deleted'],
        note: 'Price lists are derived from item-level rate structures when available.',
      },
      {
        source_system: 'Zoho Inventory',
        source_entity: 'items',
        source_label: 'Zoho.items',
        target_entity: 'pricelist_items',
        target_label: 'Yukti.pricelist_items',
        target_table: 'app.price_list_items',
        direction: 'inbound',
        trigger_type: 'event',
        webhook_events: ['item.created', 'item.updated', 'item.deleted'],
        note: 'Per-item price rows are imported from Zoho pricebook line items.',
      },
      {
        source_system: 'Zoho Inventory',
        source_entity: 'items',
        source_label: 'Zoho.items',
        target_entity: 'products',
        target_label: 'Yukti.products',
        target_table: 'app.tenant_products',
        direction: 'inbound',
        trigger_type: 'webhook',
        webhook_events: ['item.created', 'item.updated', 'item.deleted'],
      },
      {
        source_system: 'Zoho Inventory',
        source_entity: 'salesorders',
        source_label: 'Zoho.salesorders',
        target_entity: 'orders',
        target_label: 'Yukti.orders',
        target_table: 'app.orders',
        direction: 'inbound',
        trigger_type: 'event',
        webhook_events: [],
        note: 'Captured by scheduled/import refresh only.',
      },
      {
        source_system: 'Zoho Inventory',
        source_entity: 'salesorders',
        source_label: 'Zoho.salesorders',
        target_entity: 'order_items',
        target_label: 'Yukti.order_items',
        target_table: 'app.order_items',
        direction: 'inbound',
        trigger_type: 'event',
        webhook_events: [],
        note: 'Sales order line items are stored with the parent order during import.',
      },
      {
        source_system: 'Zoho Inventory',
        source_entity: 'items',
        source_label: 'Zoho.items',
        target_entity: 'estimate_items',
        target_label: 'Yukti.estimate_items',
        target_table: 'app.estimate_items',
        direction: 'inbound',
        trigger_type: 'event',
        webhook_events: [],
        note: 'Estimate line items are not live-webhook driven here; they are captured during backfill/import.',
      },
      {
        source_system: 'Zoho Inventory',
        source_entity: 'invoices',
        source_label: 'Zoho.invoices',
        target_entity: 'invoice_items',
        target_label: 'Yukti.invoice_items',
        target_table: 'app.invoice_items',
        direction: 'inbound',
        trigger_type: 'event',
        webhook_events: [],
        note: 'Invoice line items are captured during import/backfill rather than a direct webhook stream.',
      },
    ],
  },
  tally_prime: {
    integration_type_id: 'tally_prime',
    integration_label: 'Tally Prime',
    webhook_event_types: [],
    notes: COMMON_LOCAL_BRIDGE_NOTES,
    mappings: [
      {
        source_system: 'Tally Prime',
        source_entity: 'stock_items',
        source_label: 'Tally.stock_items',
        target_entity: 'products',
        target_label: 'Yukti.products',
        target_table: 'app.tenant_products',
        direction: 'bidirectional',
        trigger_type: 'event',
        webhook_events: [],
        note: 'Bridge sync will eventually push item changes in both directions.',
      },
      {
        source_system: 'Tally Prime',
        source_entity: 'ledger_accounts',
        source_label: 'Tally.ledger_accounts',
        target_entity: 'customers',
        target_label: 'Yukti.buyers',
        target_table: 'app.buyers',
        direction: 'bidirectional',
        trigger_type: 'event',
        webhook_events: [],
      },
      {
        source_system: 'Tally Prime',
        source_entity: 'sales_vouchers',
        source_label: 'Tally.sales_vouchers',
        target_entity: 'orders',
        target_label: 'Yukti.orders',
        target_table: 'app.orders',
        direction: 'bidirectional',
        trigger_type: 'event',
        webhook_events: [],
      },
      {
        source_system: 'Tally Prime',
        source_entity: 'sales_vouchers',
        source_label: 'Tally.sales_vouchers',
        target_entity: 'invoices',
        target_label: 'Yukti.invoices',
        target_table: 'app.invoices',
        direction: 'bidirectional',
        trigger_type: 'event',
        webhook_events: [],
      },
    ],
  },
  busy: {
    integration_type_id: 'busy',
    integration_label: 'Busy Accounting',
    webhook_event_types: [],
    notes: COMMON_LOCAL_BRIDGE_NOTES,
    mappings: [
      {
        source_system: 'Busy Accounting',
        source_entity: 'stock_items',
        source_label: 'Busy.stock_items',
        target_entity: 'products',
        target_label: 'Yukti.products',
        target_table: 'app.tenant_products',
        direction: 'bidirectional',
        trigger_type: 'event',
        webhook_events: [],
        note: 'Bridge sync will eventually push item changes in both directions.',
      },
      {
        source_system: 'Busy Accounting',
        source_entity: 'ledger_accounts',
        source_label: 'Busy.ledger_accounts',
        target_entity: 'customers',
        target_label: 'Yukti.buyers',
        target_table: 'app.buyers',
        direction: 'bidirectional',
        trigger_type: 'event',
        webhook_events: [],
      },
      {
        source_system: 'Busy Accounting',
        source_entity: 'sales_vouchers',
        source_label: 'Busy.sales_vouchers',
        target_entity: 'orders',
        target_label: 'Yukti.orders',
        target_table: 'app.orders',
        direction: 'bidirectional',
        trigger_type: 'event',
        webhook_events: [],
      },
      {
        source_system: 'Busy Accounting',
        source_entity: 'sales_vouchers',
        source_label: 'Busy.sales_vouchers',
        target_entity: 'invoices',
        target_label: 'Yukti.invoices',
        target_table: 'app.invoices',
        direction: 'bidirectional',
        trigger_type: 'event',
        webhook_events: [],
      },
    ],
  },
};

export function getIntegrationTopologyDefinition(integrationTypeId: IntegrationTypeId): IntegrationTopologyDefinition {
  return INTEGRATION_TOPOLOGIES[integrationTypeId];
}

export function getIntegrationWebhookDefinitions(
  integrationTypeId: IntegrationTypeId,
): IntegrationWebhookDefinition[] {
  return ZOHO_WEBHOOK_DEFINITIONS[integrationTypeId] ?? [];
}

export function buildIntegrationTopologyConfig(integrationTypeId: IntegrationTypeId) {
  const topology = getIntegrationTopologyDefinition(integrationTypeId);
  return {
    integration_topology: {
      integration_type_id: topology.integration_type_id,
      integration_label: topology.integration_label,
      webhook_event_types: topology.webhook_event_types,
      webhook_definitions: getIntegrationWebhookDefinitions(integrationTypeId),
      notes: topology.notes,
      mappings: topology.mappings,
    },
  };
}

export function buildIntegrationDataFlowRows(input: IntegrationDataFlowSeed) {
  const topology = getIntegrationTopologyDefinition(input.integration_type_id);

  return topology.mappings
    .filter((mapping) => SUPPORTED_FLOW_ENTITY_TYPES.has(mapping.target_entity))
    .map((mapping) => ({
      tenant_id: input.tenant_id,
      tenant_integration_id: input.tenant_integration_id,
      entity_type: mapping.target_entity,
      direction: mapping.direction,
      trigger_type: mapping.trigger_type,
      schedule: input.integration_type_id.startsWith('zoho_') ? ZOHO_DAILY_SYNC_CRON : null,
      webhook_id: mapping.trigger_type === 'webhook'
        ? (input.webhook_ids_by_entity?.[mapping.source_entity] ?? input.webhook_id ?? null)
        : null,
      field_mappings: {
        operational_mode: classifyIntegrationMappingMode(mapping),
        source_system: mapping.source_system,
        source_entity: mapping.source_entity,
        source_label: mapping.source_label,
        target_entity: mapping.target_entity,
        target_label: mapping.target_label,
        target_table: mapping.target_table,
        webhook_events: mapping.webhook_events,
        note: mapping.note ?? null,
      },
      filters: {},
      is_active: true,
      created_by: input.created_by ?? null,
      updated_by: input.updated_by ?? null,
      external_ref: `${input.integration_type_id}:${mapping.source_entity}->${mapping.target_entity}`,
    }));
}

export function classifyIntegrationMappingMode(mapping: IntegrationMappingDefinition): IntegrationMappingMode {
  if (mapping.trigger_type === 'scheduled') return 'scheduled';
  if (DERIVED_LOCAL_NOTE_RE.test(mapping.note ?? '')) return 'derived_local';
  if (mapping.trigger_type === 'event' && mapping.webhook_events.length === 0) return 'derived_local';
  return 'webhook_backed';
}
