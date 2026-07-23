/** Human-readable label for a platform WhatsApp template (unique per row). */
export function formatWhatsAppTemplateLabel(metaTemplateName: string): string {
  return metaTemplateName.replace(/_/g, ' ');
}
