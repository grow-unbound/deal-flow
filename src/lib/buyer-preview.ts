import { ROLES } from '@/constants';

export const BUYER_PREVIEW_HEADER = 'x-buyer-preview';
export const BUYER_PREVIEW_TOKEN_VERSION = 'buyer_preview_v1';
/** Close preview after this much idle time (no pointer/keyboard/scroll activity). */
export const BUYER_PREVIEW_INACTIVITY_SECONDS = 60 * 60;
/** Signed preview token lifetime — slightly longer than inactivity so active sessions can refresh. */
export const BUYER_PREVIEW_TTL_SECONDS = BUYER_PREVIEW_INACTIVITY_SECONDS + 5 * 60;
/** Refresh the server token when activity resumes and less than this remains. */
export const BUYER_PREVIEW_ACTIVITY_REFRESH_BUFFER_SECONDS = 5 * 60;
export const BUYER_PREVIEW_MAX_WIDTH = 840;

export interface BuyerPreviewTokenPayload {
  typ: typeof BUYER_PREVIEW_TOKEN_VERSION;
  tenant_id: string;
  role: typeof ROLES.BUYER_ADMIN;
  share_token: string | null;
  buyer_id?: string | null;
  iat: number;
  exp: number;
}

function getBuyerPreviewSecret(): string {
  return (
    process.env.BUYER_PREVIEW_TOKEN_SECRET
    ?? process.env.SUPABASE_SERVICE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ?? 'yukti-buyer-preview-dev-secret'
  );
}

function encodeUtf8(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function decodeUtf8(input: Uint8Array): string {
  return new TextDecoder().decode(input);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64UrlEncode(input: string): string {
  return bytesToBase64Url(encodeUtf8(input));
}

function base64UrlDecode(input: string): string {
  return decodeUtf8(base64UrlToBytes(input));
}

async function getSigningKey() {
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(encodeUtf8(getBuyerPreviewSecret())),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function signPayload(payloadB64: string): Promise<string> {
  const key = await getSigningKey();
  const signature = await crypto.subtle.sign('HMAC', key, toArrayBuffer(encodeUtf8(payloadB64)));
  return bytesToBase64Url(new Uint8Array(signature));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index] ^ b[index];
  }
  return diff === 0;
}

export async function createBuyerPreviewToken(input: {
  tenantId: string;
  shareToken?: string | null;
  buyerId?: string | null;
  now?: number;
}): Promise<string> {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const payload: BuyerPreviewTokenPayload = {
    typ: BUYER_PREVIEW_TOKEN_VERSION,
    tenant_id: input.tenantId,
    role: ROLES.BUYER_ADMIN,
    share_token: input.shareToken ?? null,
    buyer_id: input.buyerId ?? null,
    iat: now,
    exp: now + BUYER_PREVIEW_TTL_SECONDS,
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = await signPayload(payloadB64);
  return `${payloadB64}.${signature}`;
}

export async function verifyBuyerPreviewToken(
  token: string,
  now = Math.floor(Date.now() / 1000),
): Promise<BuyerPreviewTokenPayload | null> {
  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) return null;

  const expectedSignature = await signPayload(payloadB64);
  if (!constantTimeEqual(base64UrlToBytes(signature), base64UrlToBytes(expectedSignature))) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as BuyerPreviewTokenPayload;
    if (payload.typ !== BUYER_PREVIEW_TOKEN_VERSION) return null;
    if (payload.role !== ROLES.BUYER_ADMIN) return null;
    if (!payload.tenant_id) return null;
    if (!payload.exp || payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

