/**
 * Thin wrapper around Meta's WhatsApp Cloud API (Graph API).
 *
 * Single point of contact with Meta so the send pipeline, broadcast composer
 * (later phase), and billing ledger don't need to know Meta's request/response
 * shapes directly — see DealFlow_WhatsApp-Broadcast-Spec_v4.md §3.2.
 *
 * This is Phase A scope only: send + read-status helpers used to instrument
 * existing sends through app.whatsapp_messages. Broadcast-specific concerns
 * (pacing, quality-rating polling loop, webhook registration) are later
 * phases (D/F) and are not implemented here.
 *
 * Graceful no-op: if WHATSAPP_TOKEN / NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID are
 * unset (e.g. local dev without Meta credentials configured), send() throws a
 * typed error that callers can catch — it never crashes the process.
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

export interface WhatsAppSendTemplateRequest {
  to: string; // E.164-ish destination, already formatted (e.g. via formatWhatsappDestination)
  templateName: string;
  locale: string;
  bodyParams: WhatsAppTemplateBodyParam[];
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
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID,
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

  /** Sends a single WhatsApp template message via the Cloud API. */
  async sendTemplate(request: WhatsAppSendTemplateRequest): Promise<WhatsAppSendResult> {
    if (!this.token || !this.phoneNumberId) {
      throw new WhatsAppConfigError();
    }

    const components: Record<string, unknown>[] = [
      {
        type: 'body',
        parameters: request.bodyParams.map((param) => ({
          type: 'text',
          text: param.text,
          ...(param.parameterName ? { parameter_name: param.parameterName } : {}),
        })),
      },
    ];

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

  /**
   * Fetches a template's current Meta approval/quality status.
   * Not used until Phase D (templates registry) — stubbed for interface
   * completeness so later phases don't need to touch this wrapper's shape.
   */
  async getTemplateStatus(_templateName: string): Promise<{ status: string } | null> {
    if (!this.token) throw new WhatsAppConfigError();
    // Intentionally unimplemented in Phase A — no template registry exists yet
    // to look up Meta template IDs against. See §4.1 / Phase D.
    return null;
  }

  /**
   * Fetches the WABA's current quality rating.
   * Not used until Phase F (pacing worker + quality-rating guardrails).
   */
  async getQualityRating(): Promise<{ rating: 'GREEN' | 'YELLOW' | 'RED' } | null> {
    if (!this.token) throw new WhatsAppConfigError();
    // Intentionally unimplemented in Phase A — see §7.3 / Phase F.
    return null;
  }
}

export const whatsAppClient = new WhatsAppClient();
