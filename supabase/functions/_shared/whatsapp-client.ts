/**
 * Deno-compatible WhatsApp Cloud API client for edge functions.
 * Mirrors src/lib/server/whatsapp-client.ts — keep in sync on API shape changes.
 */

const GRAPH_API_VERSION = 'v20.0';

export interface WhatsAppTemplateBodyParam {
  text: string;
  parameterName?: string;
}

export interface WhatsAppTemplateButtonParam {
  type: 'url';
  index: string;
  text: string;
}

export interface WhatsAppTemplateHeaderParam {
  type: 'image';
  mediaId?: string;
  link?: string;
}

export interface WhatsAppSendTemplateRequest {
  to: string;
  templateName: string;
  locale: string;
  bodyParams: WhatsAppTemplateBodyParam[];
  headerParams?: WhatsAppTemplateHeaderParam;
  buttonParams?: WhatsAppTemplateButtonParam[];
}

export interface WhatsAppSendResult {
  providerMessageId: string | null;
  raw: unknown;
}

export class WhatsAppConfigError extends Error {
  constructor(message = 'WhatsApp Cloud API credentials are not configured') {
    super(message);
    this.name = 'WhatsAppConfigError';
  }
}

function getConfig() {
  return {
    token: Deno.env.get('WHATSAPP_TOKEN'),
    phoneNumberId: Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
      ?? Deno.env.get('NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID'),
  };
}

export class WhatsAppClient {
  private readonly token?: string;
  private readonly phoneNumberId?: string;

  constructor(overrides?: { token?: string; phoneNumberId?: string }) {
    const config = getConfig();
    this.token = overrides?.token ?? config.token;
    this.phoneNumberId = overrides?.phoneNumberId ?? config.phoneNumberId;
  }

  isConfigured(): boolean {
    return Boolean(this.token && this.phoneNumberId);
  }

  async sendTemplate(request: WhatsAppSendTemplateRequest): Promise<WhatsAppSendResult> {
    if (!this.token || !this.phoneNumberId) {
      throw new WhatsAppConfigError();
    }

    const components: Record<string, unknown>[] = [];

    if (request.headerParams?.type === 'image') {
      const image = request.headerParams.mediaId
        ? { id: request.headerParams.mediaId }
        : request.headerParams.link
          ? { link: request.headerParams.link }
          : null;
      if (image) {
        components.push({
          type: 'header',
          parameters: [{ type: 'image', image }],
        });
      }
    }

    components.push({
      type: 'body',
      parameters: request.bodyParams.map((param) => ({
        type: 'text',
        text: param.text,
        ...(param.parameterName ? { parameter_name: param.parameterName } : {}),
      })),
    });

    if (request.buttonParams?.length) {
      for (const button of request.buttonParams) {
        components.push({
          type: 'button',
          sub_type: button.type,
          index: button.index,
          parameters: [{ type: 'text', text: button.text }],
        });
      }
    }

    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: request.to,
          type: 'template',
          template: {
            name: request.templateName,
            language: { code: request.locale },
            components,
          },
        }),
      },
    );

    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`WhatsApp send failed [${request.templateName}] (${response.status}): ${bodyText}`);
    }

    let parsed: unknown;
    try {
      parsed = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      parsed = null;
    }

    const providerMessageId =
      (parsed as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id ?? null;

    return { providerMessageId, raw: parsed };
  }
}

export const whatsAppClient = new WhatsAppClient();
