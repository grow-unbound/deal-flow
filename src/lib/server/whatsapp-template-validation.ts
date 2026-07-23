import type { WhatsAppSendPayload } from '@/lib/server/whatsapp-enqueue';

export interface WhatsAppTemplateVariable {
  key: string;
  description?: string;
}

export interface WhatsAppTemplateButtonConfig {
  type?: 'url' | 'quick_reply';
  index?: string;
  variable_source?: string;
  url_template?: string;
}

export interface WhatsAppTemplateValidationShape {
  meta_template_name: string;
  use_case?: string | null;
  variables: WhatsAppTemplateVariable[];
  button_config?: WhatsAppTemplateButtonConfig | null;
  buttons_config?: WhatsAppTemplateButtonConfig[] | null;
  is_broadcast_template?: boolean | null;
}

export interface BroadcastTemplateEligibility {
  supported: boolean;
  reason: string | null;
}

const TRANSACTIONAL_TEMPLATE_VARIABLES: Record<string, string[]> = {
  order_received_seller: [
    'seller_location',
    'buyer_name',
    'buyer_phone_number',
    'order_number',
    'total_amount',
    'item_count',
    'eta',
  ],
  order_received_buyer: [
    'buyer_name',
    'item_count',
    'order_number',
    'total_amount',
    'seller_name',
    'eta',
  ],
  request_received_seller: [
    'seller_location',
    'buyer_name',
    'buyer_phone_number',
    'request_number',
    'total_amount',
    'item_count',
    'eta',
  ],
  request_received_buyer: [
    'buyer_name',
    'item_count',
    'estimate_number',
    'total_amount',
    'seller_name',
    'eta',
  ],
  request_update_buyer: [
    'buyer_name',
    'request_number',
    'total_amount',
    'item_count',
    'seller_name',
    'seller_phone_number',
  ],
  invoice_update_buyer: [
    'buyer_name',
    'invoice_number',
    'total_amount',
    'item_count',
    'seller_name',
    'seller_phone_number',
  ],
  buyer_payment_reminder: [
    'buyer_name',
    'seller_name',
    'due_invoice_count',
    'outstanding_amount',
    'due_status',
    'seller_phone_number',
  ],
  campaign_published_buyer: [
    'buyer_name',
    'seller_name',
    'campaign_title',
    'buyer_note',
    'seller_phone_number',
  ],
  beat_route_buyer: [
    'buyer_name',
    'seller_name',
    'visit_date',
    'visit_window',
    'seller_phone_number',
  ],
  new_stock_buyer: [
    'buyer_name',
    'seller_name',
    'buyer_note',
  ],
  buyer_app_dormant: [
    'buyer_name',
    'seller_name',
  ],
  buyer_app_adoption: [
    'buyer_name',
    'seller_name',
  ],
  buyer_app_enabled: [
    'buyer_name',
    'seller_name',
  ],
};

function normalizeValue(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function configuredButtonDefinitions(
  template: Pick<WhatsAppTemplateValidationShape, 'button_config' | 'buttons_config'>,
) {
  if (Array.isArray(template.buttons_config) && template.buttons_config.length > 0) {
    return template.buttons_config;
  }
  return template.button_config ? [template.button_config] : [];
}

export function getBroadcastTemplateEligibility(
  template: Pick<WhatsAppTemplateValidationShape, 'meta_template_name' | 'use_case' | 'is_broadcast_template'>,
): BroadcastTemplateEligibility {
  if (template.is_broadcast_template === false) {
    return {
      supported: false,
      reason: 'Not approved for broadcast sending',
    };
  }
  if (template.meta_template_name === 'login_otp') {
    return {
      supported: false,
      reason: 'OTP templates can only be used for login verification',
    };
  }
  return { supported: true, reason: null };
}

export function validateTemplatePayload(
  template: WhatsAppTemplateValidationShape,
  payload: WhatsAppSendPayload,
): string[] {
  const errors: string[] = [];
  const expectedVariables = template.variables.length > 0
    ? template.variables.map((variable) => variable.key)
    : (TRANSACTIONAL_TEMPLATE_VARIABLES[payload.meta_template_name] ?? []);
  const bodyParams = payload.body_params ?? [];

  if (expectedVariables.length > 0 && bodyParams.length !== expectedVariables.length) {
    errors.push(`Expected ${expectedVariables.length} body params, received ${bodyParams.length}`);
  }

  expectedVariables.forEach((expectedKey, index) => {
    const param = bodyParams[index];
    if (!param) {
      errors.push(`Missing template parameter: ${expectedKey}`);
      return;
    }
    const actualKey = param.parameter_name;
    if (actualKey !== expectedKey) {
      errors.push(`Template parameter mismatch at index ${index}: expected ${expectedKey}, received ${actualKey ?? 'unnamed'}`);
    }
    if (!normalizeValue(param.text)) {
      errors.push(`Template parameter ${expectedKey} cannot be blank`);
    }
  });

  const requiredButtons = configuredButtonDefinitions(template)
    .filter((button) => button.type === 'url' && (button.variable_source || button.url_template?.includes('{{')));

  requiredButtons.forEach((button, index) => {
    const buttonIndex = button.index ?? String(index);
    const payloadButton = payload.button_params?.find((param) => param.index === buttonIndex);
    if (!payloadButton) {
      errors.push(`Missing required CTA button param at index ${buttonIndex}`);
      return;
    }
    if (!normalizeValue(payloadButton.text)) {
      errors.push(`CTA button param at index ${buttonIndex} cannot be blank`);
    }
  });

  payload.button_params?.forEach((button) => {
    if (!normalizeValue(button.text)) {
      errors.push(`CTA button param at index ${button.index} cannot be blank`);
    }
  });

  return errors;
}

export function assertTemplatePayloadValid(
  template: WhatsAppTemplateValidationShape,
  payload: WhatsAppSendPayload,
): void {
  const errors = validateTemplatePayload(template, payload);
  if (errors.length > 0) {
    throw new Error(`WhatsApp payload validation failed for ${payload.meta_template_name}: ${errors.join('; ')}`);
  }
}
