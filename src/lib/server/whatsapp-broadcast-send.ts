import { firstNameFromValue, formatWhatsappDestination, isValidIndianMobile, normalizeIndianPhone } from '@/lib/phone';
import type { EnqueueWhatsAppMessageInput, WhatsAppSendPayload } from '@/lib/server/whatsapp-enqueue';

type TemplateVariable = {
  key: string;
  description?: string;
};

type TemplateButtonConfig = {
  type?: 'url';
  variable_source?: string;
};

type TemplateRow = {
  id: string;
  meta_template_name: string;
  meta_category: 'marketing' | 'utility' | 'authentication';
  approval_status: 'pending' | 'approved' | 'rejected' | 'disabled';
  use_case: string;
  locale: string | null;
  variables: TemplateVariable[];
  button_config: TemplateButtonConfig | null;
};

type BuyerRow = {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  payment_terms_days: number | null;
};

type CampaignRow = {
  id: string;
  name: string;
  share_token: string | null;
};

type InvoiceRow = {
  buyer_id: string;
  invoice_date: string | null;
  outstanding_balance: number | null;
  status: string | null;
};

type TenantRow = {
  id: string;
  business_name: string;
  settings: Record<string, unknown> | null;
};

type BuyerInvoiceSummary = {
  outstandingAmount: string;
  overdueDays: string;
};

const REQUIRED_MANUAL_VARIABLES = new Set(['highlight_text', 'visit_window']);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function buildSellerContext(tenant: TenantRow) {
  const settings = asRecord(tenant.settings);
  const businessSettings = asRecord(settings.business);
  const buyerAppSettings = asRecord(settings.buyer_app);

  return {
    sellerName: readString(buyerAppSettings, 'whatsapp_display_name')
      ?? readString(businessSettings, 'company_name')
      ?? tenant.business_name,
    sellerPhone: normalizeIndianPhone(
      readString(buyerAppSettings, 'whatsapp_number')
      ?? readString(businessSettings, 'phone')
      ?? process.env.WHATSAPP_ADMIN_NUMBER
      ?? '',
    ),
  };
}

function buildInvoiceSummary(rows: InvoiceRow[], buyerMap: Map<string, BuyerRow>) {
  const summaries = new Map<string, BuyerInvoiceSummary>();

  for (const row of rows) {
    const buyer = buyerMap.get(row.buyer_id);
    if (!buyer) continue;

    const outstanding = Number(row.outstanding_balance ?? 0);
    if (outstanding <= 0 || !row.invoice_date) continue;

    const dueDate = new Date(row.invoice_date);
    if (Number.isNaN(dueDate.getTime())) continue;
    dueDate.setDate(dueDate.getDate() + Number(buyer.payment_terms_days ?? 0));

    const overdueDays = Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
    const current = summaries.get(row.buyer_id);
    const outstandingAmount = (current ? Number(current.outstandingAmount) : 0) + outstanding;
    const maxOverdueDays = current ? Math.max(Number(current.overdueDays), overdueDays) : overdueDays;
    summaries.set(row.buyer_id, {
      outstandingAmount: Math.round(outstandingAmount).toString(),
      overdueDays: maxOverdueDays.toString(),
    });
  }

  return summaries;
}

function resolveButtonValue(
  variableSource: string | undefined,
  buyer: BuyerRow,
  campaign: CampaignRow | null,
) {
  switch (variableSource) {
    case 'campaign_id':
    case 'catalog_or_campaign_reference':
      return campaign?.share_token ?? campaign?.id ?? null;
    case 'buyer_id_or_invoice_list_reference':
      return buyer.id;
    default:
      return campaign?.share_token ?? campaign?.id ?? null;
  }
}

function resolveVariableValue({
  key,
  buyer,
  sellerName,
  sellerPhone,
  invoiceSummary,
  campaign,
  variableBindings,
}: {
  key: string;
  buyer: BuyerRow;
  sellerName: string;
  sellerPhone: string;
  invoiceSummary: BuyerInvoiceSummary | null;
  campaign: CampaignRow | null;
  variableBindings: Record<string, string>;
}) {
  if (key === 'buyer_name') {
    return firstNameFromValue(buyer.contact_name) ?? firstNameFromValue(buyer.business_name) ?? buyer.business_name;
  }
  if (key === 'seller_name') return sellerName;
  if (key === 'seller_phone_number') return sellerPhone;
  if (key === 'campaign_title') return campaign?.name ?? '';
  if (key === 'outstanding_amount') return invoiceSummary?.outstandingAmount ?? '0';
  if (key === 'overdue_days') return invoiceSummary?.overdueDays ?? '0';
  return variableBindings[key] ?? '';
}

function buildSendPayload(args: {
  template: TemplateRow;
  buyer: BuyerRow;
  sellerName: string;
  sellerPhone: string;
  invoiceSummary: BuyerInvoiceSummary | null;
  campaign: CampaignRow | null;
  variableBindings: Record<string, string>;
}): WhatsAppSendPayload {
  const bodyParams = args.template.variables.map((variable) => {
    const text = resolveVariableValue({
      key: variable.key,
      buyer: args.buyer,
      sellerName: args.sellerName,
      sellerPhone: args.sellerPhone,
      invoiceSummary: args.invoiceSummary,
      campaign: args.campaign,
      variableBindings: args.variableBindings,
    });
    if (REQUIRED_MANUAL_VARIABLES.has(variable.key) && !text.trim()) {
      throw new Error(`Missing required broadcast input: ${variable.key}`);
    }
    return {
      text,
      parameter_name: variable.key,
    };
  });

  const buttonValue = args.template.button_config?.type === 'url'
    ? resolveButtonValue(args.template.button_config.variable_source, args.buyer, args.campaign)
    : null;

  if (args.template.button_config?.type === 'url' && !buttonValue) {
    throw new Error('Missing required broadcast CTA target');
  }

  return {
    meta_template_name: args.template.meta_template_name,
    locale: args.template.locale ?? 'en',
    body_params: bodyParams,
    ...(buttonValue ? { button_params: [{ type: 'url' as const, index: '0', text: buttonValue }] } : {}),
  };
}

export async function buildBroadcastMessageQueue(
  db: any,
  input: {
    tenantId: string;
    whatsappBroadcastId: string;
    buyerIds: string[];
    template: TemplateRow;
    variableBindings: Record<string, string>;
    linkedCampaignId?: string | null;
    scheduledSendAt?: string | null;
  },
): Promise<EnqueueWhatsAppMessageInput[]> {
  const { data: tenant, error: tenantError } = await db
    .schema('app')
    .from('tenants')
    .select('id, business_name, settings')
    .eq('id', input.tenantId)
    .maybeSingle();

  if (tenantError || !tenant) {
    throw new Error('Failed to load tenant WhatsApp context');
  }

  const { data: buyers, error: buyersError } = await db
    .schema('app')
    .from('buyers')
    .select('id, business_name, contact_name, phone, payment_terms_days')
    .eq('tenant_id', input.tenantId)
    .in('id', input.buyerIds)
    .is('deleted_at', null);

  if (buyersError) {
    throw new Error('Failed to load buyer WhatsApp context');
  }

  const buyerRows = ((buyers ?? []) as BuyerRow[]).filter((buyer) => buyer.phone && isValidIndianMobile(buyer.phone));
  if (buyerRows.length === 0) {
    throw new Error('No eligible buyers have a valid WhatsApp phone number');
  }

  const buyerMap = new Map(buyerRows.map((buyer) => [buyer.id, buyer]));
  const [campaignResult, invoicesResult] = await Promise.all([
    input.linkedCampaignId
      ? db
          .schema('app')
          .from('campaigns')
          .select('id, name, share_token')
          .eq('tenant_id', input.tenantId)
          .eq('id', input.linkedCampaignId)
          .is('deleted_at', null)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db
      .schema('app')
      .from('invoices')
      .select('buyer_id, invoice_date, outstanding_balance, status')
      .eq('tenant_id', input.tenantId)
      .in('buyer_id', buyerRows.map((buyer) => buyer.id))
      .is('deleted_at', null)
      .in('status', ['sent', 'unpaid', 'partially_paid', 'overdue', 'viewed']),
  ]);

  if (campaignResult.error) {
    throw new Error('Failed to load linked campaign');
  }
  if (input.linkedCampaignId && !campaignResult.data) {
    throw new Error('Linked campaign not found');
  }
  if (invoicesResult.error) {
    throw new Error('Failed to load buyer invoice context');
  }

  const campaign = campaignResult.data as CampaignRow | null;
  const invoiceSummaryByBuyer = buildInvoiceSummary((invoicesResult.data ?? []) as InvoiceRow[], buyerMap);
  const { sellerName, sellerPhone } = buildSellerContext(tenant as TenantRow);

  if (!sellerName.trim()) {
    throw new Error('Missing seller WhatsApp display name');
  }

  const queueInputs: EnqueueWhatsAppMessageInput[] = [];
  for (const buyer of buyerRows) {
    const sendPayload = buildSendPayload({
      template: input.template,
      buyer,
      sellerName,
      sellerPhone,
      invoiceSummary: invoiceSummaryByBuyer.get(buyer.id) ?? null,
      campaign,
      variableBindings: input.variableBindings,
    });

    queueInputs.push({
      tenantId: input.tenantId,
      buyerId: buyer.id,
      recipientPhone: formatWhatsappDestination(buyer.phone ?? ''),
      metaCategory: input.template.meta_category,
      triggerSource: 'broadcast',
      whatsappBroadcastId: input.whatsappBroadcastId,
      priority: 5,
      scheduledSendAt: input.scheduledSendAt ?? null,
      sendPayload,
    });
  }

  return queueInputs;
}
