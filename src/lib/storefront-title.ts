export interface StorefrontBrandingContext {
  isTenantHost: boolean;
  businessName: string | null;
  tagline: string | null;
  logoUrl: string | null;
}

export function storefrontDefaultTitle(ctx: StorefrontBrandingContext): string {
  if (!ctx.businessName) return 'Yukti';
  if (ctx.tagline?.trim()) return `${ctx.businessName} | ${ctx.tagline.trim()}`;
  return ctx.businessName;
}
