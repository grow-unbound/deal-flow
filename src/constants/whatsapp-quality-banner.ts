/**
 * Tenant-facing quality-rating banner copy (§7.3).
 *
 * Kept as a config value, not hardcoded inline in a component, per the
 * spec's explicit instruction: "Build the tenant-facing banner copy as a
 * config value... since you'll likely want to tune the tone after seeing
 * how the first real Yellow/Red event lands with an actual tenant."
 *
 * Copy below is verbatim from DealFlow_WhatsApp-Broadcast-Spec_v4.md §7.3's
 * state table — do not paraphrase when editing; if the tone needs tuning
 * after a real event, edit here (not in BroadcastComposerSheet.tsx) so the
 * component and copy stay decoupled.
 */

export type WhatsAppQualityRatingState = 'green' | 'yellow' | 'red';

export interface WhatsAppQualityBannerCopy {
  /** Whether the composer should render a banner at all for this state. */
  showBanner: boolean;
  /** Non-technical, non-alarming tenant-facing message (verbatim from §7.3). */
  message: string | null;
}

export const WHATSAPP_QUALITY_BANNER_COPY: Record<WhatsAppQualityRatingState, WhatsAppQualityBannerCopy> = {
  green: {
    showBanner: false,
    message: null,
  },
  yellow: {
    showBanner: true,
    message:
      'Messages are going through an extra delivery check right now and may take a few hours longer to send. Your scheduled broadcasts are queued and will go out as soon as they clear.',
  },
  red: {
    showBanner: true,
    message:
      'Broadcast sending is temporarily paused for a system-wide health check. Your draft is saved and will send automatically once this clears — usually within a day.',
  },
};
