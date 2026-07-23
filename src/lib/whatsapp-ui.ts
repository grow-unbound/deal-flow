interface WhatsAppTemplateLabelSource {
  display_name?: string | null;
  meta_template_name: string;
}

/** Human-readable label for a platform WhatsApp template (unique per row). */
export function formatWhatsAppTemplateLabel(
  template: WhatsAppTemplateLabelSource | string,
): string {
  if (typeof template === 'string') {
    return template.replace(/_/g, ' ');
  }

  const displayName = template.display_name?.trim();
  if (displayName) return displayName;

  return template.meta_template_name.replace(/_/g, ' ');
}
