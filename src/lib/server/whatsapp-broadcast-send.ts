import { firstNameFromValue, formatWhatsappDestination, isValidIndianMobile, normalizeIndianPhone } from '@/lib/phone';
import type { EnqueueWhatsAppMessageInput, WhatsAppSendPayload } from '@/lib/server/whatsapp-enqueue';
import {
  buildBuyerInvoiceSummaries,
  type BuyerInvoiceSummary,
  type InvoiceSummaryRow,
} from '@/lib/server/whatsapp-invoice-summary';

type TemplateVariable = {
  key: string;
  description?: string;
};

type TemplateButtonConfig = {
  type?: 'url' | 'quick_reply';
  index?: string;
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
  buttons_config?: TemplateButtonConfig[] | null;
  header_config?: { format?: string } | null;
};

type BuyerRow = {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
};

type CampaignRow = {
  id: string;
  name: string;
  share_token: string | null;
};

type TenantRow = {
  id: string;
  business_name: string;
  settings: Record<string, unknown> | null;
};

const REQUIRED_MANUAL_VARIABLES = new Set(['highlight_text', 'visit_window']);
const PAYMENT_REMINDER_TEMPLATE = 'buyer_payment_reminder';

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

function resolveButtonValue(
  variableSource: string | undefined,
  buyer: BuyerRow,
  campaign: CampaignRow | null,
  sellerPhone: string,
) {
  switch (variableSource) {
    case 'share_token':
    case 'campaign_id':
    case 'catalog_or_campaign_reference':
      return campaign?.share_token ?? campaign?.id ?? null;
    case 'tenant_whatsapp_phone':
      return sellerPhone ? formatWhatsappDestination(sellerPhone) : null;
    case 'buyer_id_or_invoice_list_reference':
      return buyer.id;
    default:
      return campaign?.share_token ?? campaign?.id ?? null;
  }
}

function buildButtonParams(
  template: TemplateRow,
  buyer: BuyerRow,
  campaign: CampaignRow | null,
  sellerPhone: string,
) {
  const configs = Array.isArray(template.buttons_config) && template.buttons_config.length > 0
    ? template.buttons_config
    : template.button_config?.type === 'url'
      ? [template.button_config]
      : [];

  const buttonParams: Array<{ type: 'url'; index: string; text: string }> = [];

  for (const button of configs) {
    if (button.type !== 'url') continue;
    const text = resolveButtonValue(button.variable_source, buyer, campaign, sellerPhone);
    if (!text) {
      throw new Error('Missing required broadcast CTA target');
    }
    buttonParams.push({
      type: 'url',
      index: button.index ?? String(buttonParams.length),
      text,
    });
  }

  return buttonParams;
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
  if (key === 'due_invoice_count') return invoiceSummary?.dueInvoiceCount ?? '0';
  if (key === 'due_status') return invoiceSummary?.dueStatus ?? '';
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
  headerMediaId?: string | null;
  headerImageLink?: string | null;
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

  const buttonParams = buildButtonParams(
    args.template,
    args.buyer,
    args.campaign,
    args.sellerPhone,
  );

  const hasImageHeader = args.template.header_config?.format === 'image';

  return {
    meta_template_name: args.template.meta_template_name,
    locale: args.template.locale ?? 'en',
    body_params: bodyParams,
    ...(hasImageHeader && (args.headerMediaId || args.headerImageLink)
      ? {
          header_params: {
            type: 'image' as const,
            ...(args.headerMediaId ? { media_id: args.headerMediaId } : { link: args.headerImageLink ?? undefined }),
          },
        }
      : {}),
    ...(buttonParams.length > 0 ? { button_params: buttonParams } : {}),
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
    headerMediaId?: string | null;
    headerImageLink?: string | null;
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
    .select('id, business_name, contact_name, phone')
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
  const isPaymentReminder = input.template.meta_template_name === PAYMENT_REMINDER_TEMPLATE;

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
      .select('buyer_id, due_date, outstanding_balance, status')
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
  const invoiceSummaryByBuyer = buildBuyerInvoiceSummaries(
    (invoicesResult.data ?? []) as InvoiceSummaryRow[],
  );
  const { sellerName, sellerPhone } = buildSellerContext(tenant as TenantRow);

  if (!sellerName.trim()) {
    throw new Error('Missing seller WhatsApp display name');
  }
  if (input.template.buttons_config?.some((b) => b.variable_source === 'tenant_whatsapp_phone') && !sellerPhone) {
    throw new Error('Missing tenant WhatsApp contact number for Enquire button');
  }

  const queueInputs: EnqueueWhatsAppMessageInput[] = [];
  for (const buyer of buyerRows) {
    const invoiceSummary = invoiceSummaryByBuyer.get(buyer.id) ?? null;
    if (isPaymentReminder && !invoiceSummary) {
      continue;
    }

    const sendPayload = buildSendPayload({
      template: input.template,
      buyer,
      sellerName,
      sellerPhone,
      invoiceSummary,
      campaign,
      variableBindings: input.variableBindings,
      headerMediaId: input.headerMediaId,
      headerImageLink: input.headerImageLink,
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

  if (queueInputs.length === 0) {
    throw new Error('No eligible buyers have outstanding invoices for this reminder');
  }

  return queueInputs;
}
