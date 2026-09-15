export const WHATSAPP_EMBEDDED_SIGNUP_SCOPES = [
  'whatsapp_business_management',
  'whatsapp_business_messaging',
  'business_management',
].join(',');

/** Client-exposed Meta App ID for FB.init — distinct from the server-only META_APP_ID/WHATSAPP_APP_SECRET. */
export function getMetaAppIdPublic(): string | undefined {
  return process.env.NEXT_PUBLIC_META_APP_ID;
}

/** Client-exposed Facebook Login for Business config id — not secret, but needs a NEXT_PUBLIC_ alias to reach FB.login() in the browser. */
export function getWhatsAppEmbeddedSignupConfigIdPublic(): string | undefined {
  return process.env.NEXT_PUBLIC_WHATSAPP_EMBEDDED_SIGNUP_CONFIGURATION_ID;
}
