import { formatSellerPhoneDisplay, buildSellerContextFromTenant } from '@/lib/server/whatsapp-seller-context';
import {
  sendBuyerPaymentReminder,
  sendInvoiceUpdateBuyer,
  sendRequestUpdateBuyer,
  type WhatsappNotificationContext,
} from '@/lib/server/whatsapp';
import { isValidIndianMobile, normalizeIndianPhone } from '@/lib/phone';
import type { WhatsAppDocumentSendState, WhatsAppInvoiceReminderState } from '@/types/whatsapp-document-send';
import { buildBuyerInvoiceSummaries, type InvoiceSummaryRow } from '@/lib/server/whatsapp-invoice-summary';

type DbClient = any;

export type BuyerDocumentSendKind = 'estimate' | 'invoice';

interface DocumentSendBaseInput {
  kind: BuyerDocumentSendKind;
  tenantId: string;
  buyerId: string | null;
  documentId: string;
  documentNumber: string;
  totalAmount: number;
  itemCount: number;
}

interface DocumentSendPrepared {
  state: WhatsAppDocumentSendState;
  ctx: WhatsappNotificationContext | null;
}

interface TenantSendRow {
  business_name: string;
  settings: Record<string, unknown> | null;
  whatsapp_plan_allowance_balance: number | string | null;
  whatsapp_purchased_credits_balance: number | string | null;
}

interface BuyerSendRow {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
}

const DOCUMENT_SEND_CONFIG: Record<
  BuyerDocumentSendKind,
  { templateName: string; noun: string }
> = {
  estimate: {
    templateName: 'request_update_buyer',
    noun: 'estimate',
  },
  invoice: {
    templateName: 'invoice_update_buyer',
    noun: 'invoice',
  },
};

async function lookupApprovedTemplate(
  db: DbClient,
  metaTemplateName: string,
): Promise<boolean> {
  const { data, error } = await db
    .schema('app')
    .from('whatsapp_templates')
    .select('id')
    .eq('meta_template_name', metaTemplateName)
    .eq('approval_status', 'approved')
    .is('tenant_id', null)
    .is('deleted_at', null)
    .maybeSingle();

  return !error && Boolean(data?.id);
}

async function loadUtilityCreditsRequired(db: DbClient): Promise<number> {
  const { data } = await db
    .schema('app')
    .from('whatsapp_rate_card')
    .select('credits_per_message')
    .eq('meta_category', 'utility')
    .maybeSingle();

  const value = Number(data?.credits_per_message ?? 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function unavailableState(templateName: string): WhatsAppDocumentSendState {
  return {
    can_send: false,
    block_reason: 'unavailable',
    block_message: 'WhatsApp send is unavailable right now. Please try again.',
    credits_balance: 0,
    required_credits: 1,
    recipient_phone: null,
    template_name: templateName,
    seller_name: null,
    seller_phone_display: null,
  };
}

function buildReminderPreviewMessage(
  buyerName: string,
  sellerName: string,
  sellerPhoneDisplay: string,
  dueInvoiceCount: string,
  outstandingAmount: string,
  dueStatus: string,
): string {
  return [
    `Hi ${buyerName},`,
    '',
    `This is a payment reminder from ${sellerName} on ${dueInvoiceCount} invoices.`,
    '',
    `Amount Due: ₹${outstandingAmount} (${dueStatus})`,
    `Contact: ${sellerPhoneDisplay}`,
    '',
    'Check your dues and pay at the earliest.',
  ].join('\n');
}

async function prepareDocumentSend(
  db: DbClient,
  input: DocumentSendBaseInput,
): Promise<DocumentSendPrepared> {
  const config = DOCUMENT_SEND_CONFIG[input.kind];

  if (!input.buyerId) {
    return {
      state: {
        ...unavailableState(config.templateName),
        block_message: `This ${config.noun} does not have a buyer linked yet.`,
      },
      ctx: null,
    };
  }

  const [tenantResult, buyerResult, hasTemplate, requiredCredits] = await Promise.all([
    db
      .schema('app')
      .from('tenants')
      .select('business_name, settings, whatsapp_plan_allowance_balance, whatsapp_purchased_credits_balance')
      .eq('id', input.tenantId)
      .maybeSingle() as Promise<{ data: TenantSendRow | null; error: unknown }>,
    db
      .schema('app')
      .from('buyers')
      .select('id, business_name, contact_name, phone')
      .eq('tenant_id', input.tenantId)
      .eq('id', input.buyerId)
      .is('deleted_at', null)
      .maybeSingle() as Promise<{ data: BuyerSendRow | null; error: unknown }>,
    lookupApprovedTemplate(db, config.templateName),
    loadUtilityCreditsRequired(db),
  ]);

  if (!tenantResult.data || !buyerResult.data) {
    return { state: unavailableState(config.templateName), ctx: null };
  }

  const tenant = tenantResult.data;
  const buyer = buyerResult.data;
  const seller = buildSellerContextFromTenant(tenant);
  const creditsBalance =
    Number(tenant.whatsapp_plan_allowance_balance ?? 0) + Number(tenant.whatsapp_purchased_credits_balance ?? 0);
  const recipientPhone = buyer.phone ? normalizeIndianPhone(buyer.phone) : null;
  const buyerName = buyer.contact_name?.trim() || buyer.business_name;
  const sellerPhoneDisplay = seller.sellerPhone ? formatSellerPhoneDisplay(seller.sellerPhone) : null;

  const baseState: WhatsAppDocumentSendState = {
    can_send: true,
    block_reason: null,
    block_message: null,
    credits_balance: Number.isFinite(creditsBalance) ? creditsBalance : 0,
    required_credits: requiredCredits,
    recipient_phone: recipientPhone,
    template_name: config.templateName,
    seller_name: seller.sellerName,
    seller_phone_display: sellerPhoneDisplay,
  };

  if (!recipientPhone) {
    return {
      state: {
        ...baseState,
        can_send: false,
        block_reason: 'missing_buyer_phone',
        block_message: 'Add the buyer phone number before sending this WhatsApp message.',
      },
      ctx: null,
    };
  }

  if (!isValidIndianMobile(recipientPhone)) {
    return {
      state: {
        ...baseState,
        can_send: false,
        block_reason: 'invalid_buyer_phone',
        block_message: 'The buyer phone number is not a valid WhatsApp mobile number.',
      },
      ctx: null,
    };
  }

  if (!seller.sellerPhone || !isValidIndianMobile(seller.sellerPhone)) {
    return {
      state: {
        ...baseState,
        can_send: false,
        block_reason: 'missing_seller_phone',
        block_message: 'Set a valid seller WhatsApp number in tenant settings before sending.',
      },
      ctx: null,
    };
  }

  if (!hasTemplate) {
    return {
      state: {
        ...baseState,
        can_send: false,
        block_reason: 'missing_template',
        block_message: 'The WhatsApp template for this send is not available yet.',
      },
      ctx: null,
    };
  }

  if ((Number.isFinite(creditsBalance) ? creditsBalance : 0) < requiredCredits) {
    return {
      state: {
        ...baseState,
        can_send: false,
        block_reason: 'insufficient_credits',
        block_message: 'This tenant does not have enough WhatsApp credits to send this message.',
      },
      ctx: null,
    };
  }

  return {
    state: baseState,
    ctx: {
      sellerPhone: seller.sellerPhone,
      sellerName: seller.sellerName,
      sellerLocation: seller.sellerName,
      buyerFacingSellerName: seller.sellerName,
      buyerPhone: recipientPhone,
      buyerName,
      etaHours: 0,
      tenantId: input.tenantId,
      buyerId: buyer.id,
    },
  };
}

export async function getBuyerDocumentSendState(
  db: DbClient,
  input: Omit<DocumentSendBaseInput, 'documentId' | 'documentNumber' | 'totalAmount' | 'itemCount'>,
): Promise<WhatsAppDocumentSendState> {
  try {
    const prepared = await prepareDocumentSend(db, {
      ...input,
      documentId: '',
      documentNumber: '',
      totalAmount: 0,
      itemCount: 0,
    });
    return prepared.state;
  } catch (error) {
    return unavailableState(DOCUMENT_SEND_CONFIG[input.kind].templateName);
  }
}

export async function sendBuyerDocumentWhatsApp(
  db: DbClient,
  input: DocumentSendBaseInput,
): Promise<{ ok: true; state: WhatsAppDocumentSendState; recipientPhone: string } | { ok: false; state: WhatsAppDocumentSendState }> {
  try {
    const prepared = await prepareDocumentSend(db, input);
    if (!prepared.state.can_send || !prepared.ctx || !prepared.state.recipient_phone) {
      return { ok: false, state: prepared.state };
    }

    const sent = input.kind === 'estimate'
      ? await sendRequestUpdateBuyer(
          prepared.ctx,
          input.documentId,
          input.documentNumber,
          input.totalAmount,
          input.itemCount,
        )
      : await sendInvoiceUpdateBuyer(
          prepared.ctx,
          input.documentId,
          input.documentNumber,
          input.totalAmount,
          input.itemCount,
        );

    if (!sent) {
      return {
        ok: false,
        state: {
          ...prepared.state,
          can_send: false,
          block_reason: 'unavailable',
          block_message: 'Failed to send the WhatsApp message. Please try again.',
        },
      };
    }

    return {
      ok: true,
      state: prepared.state,
      recipientPhone: prepared.state.recipient_phone,
    };
  } catch (error) {
    return {
      ok: false,
      state: unavailableState(DOCUMENT_SEND_CONFIG[input.kind].templateName),
    };
  }
}

async function buildBuyerReminderSummary(
  db: DbClient,
  tenantId: string,
  buyerId: string,
): Promise<{ dueInvoiceCount: string; outstandingAmount: string; dueStatus: string } | null> {
  const { data, error } = await db
    .schema('app')
    .from('invoices')
    .select('buyer_id, due_date, outstanding_balance, status')
    .eq('tenant_id', tenantId)
    .eq('buyer_id', buyerId)
    .is('deleted_at', null)
    .in('status', ['sent', 'unpaid', 'partially_paid', 'overdue', 'viewed']);

  if (error) return null;
  const summaries = buildBuyerInvoiceSummaries((data ?? []) as InvoiceSummaryRow[]);
  const summary = summaries.get(buyerId);
  return summary
    ? {
        dueInvoiceCount: summary.dueInvoiceCount,
        outstandingAmount: summary.outstandingAmount,
        dueStatus: summary.dueStatus,
      }
    : null;
}

function unavailableReminderState(): WhatsAppInvoiceReminderState {
  return {
    ...unavailableState('buyer_payment_reminder'),
    due_invoice_count: '0',
    outstanding_amount: '0',
    due_status: '',
    preview_message: '',
  };
}

export async function getInvoiceReminderSendState(
  db: DbClient,
  input: { tenantId: string; buyerId: string | null },
): Promise<WhatsAppInvoiceReminderState> {
  try {
    const prepared = await prepareDocumentSend(db, {
      kind: 'invoice',
      tenantId: input.tenantId,
      buyerId: input.buyerId,
      documentId: '',
      documentNumber: '',
      totalAmount: 0,
      itemCount: 0,
    });
    if (!input.buyerId) {
      return unavailableReminderState();
    }
    const summary = await buildBuyerReminderSummary(db, input.tenantId, input.buyerId);
    const dueInvoiceCount = summary?.dueInvoiceCount ?? '0';
    const outstandingAmount = summary?.outstandingAmount ?? '0';
    const dueStatus = summary?.dueStatus ?? '';
    const buyerName = prepared.ctx?.buyerName ?? 'Buyer';
    const sellerName = prepared.state.seller_name ?? 'Your business';
    const sellerPhoneDisplay = prepared.state.seller_phone_display ?? 'Your business number';
    return {
      ...prepared.state,
      can_send: prepared.state.can_send && Boolean(summary),
      block_reason: prepared.state.can_send && !summary ? 'unavailable' : prepared.state.block_reason,
      block_message: prepared.state.can_send && !summary
        ? 'This buyer has no outstanding invoices to remind right now.'
        : prepared.state.block_message,
      due_invoice_count: dueInvoiceCount,
      outstanding_amount: outstandingAmount,
      due_status: dueStatus,
      preview_message: buildReminderPreviewMessage(
        buyerName,
        sellerName,
        sellerPhoneDisplay,
        dueInvoiceCount,
        outstandingAmount,
        dueStatus,
      ),
    };
  } catch {
    return unavailableReminderState();
  }
}

export async function sendInvoiceReminderWhatsApp(
  db: DbClient,
  input: { tenantId: string; buyerId: string | null; invoiceId: string },
): Promise<{ ok: true; state: WhatsAppInvoiceReminderState; recipientPhone: string } | { ok: false; state: WhatsAppInvoiceReminderState }> {
  const state = await getInvoiceReminderSendState(db, {
    tenantId: input.tenantId,
    buyerId: input.buyerId,
  });
  if (!state.can_send || !input.buyerId || !state.recipient_phone) {
    return { ok: false, state };
  }

  const prepared = await prepareDocumentSend(db, {
    kind: 'invoice',
    tenantId: input.tenantId,
    buyerId: input.buyerId,
    documentId: input.invoiceId,
    documentNumber: '',
    totalAmount: 0,
    itemCount: 0,
  });
  if (!prepared.ctx) {
    return { ok: false, state };
  }

  const sent = await sendBuyerPaymentReminder(
    prepared.ctx,
    input.invoiceId,
    state.due_invoice_count,
    state.outstanding_amount,
    state.due_status,
  );
  if (!sent) {
    return {
      ok: false,
      state: {
        ...state,
        can_send: false,
        block_reason: 'unavailable',
        block_message: 'Failed to send the WhatsApp reminder. Please try again.',
      },
    };
  }

  return { ok: true, state, recipientPhone: state.recipient_phone };
}
