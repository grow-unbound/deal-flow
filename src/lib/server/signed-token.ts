// Generic HMAC-SHA256 signed-token primitives (Web Crypto — edge-runtime
// compatible, safe to use from middleware.ts). Extracted from buyer-preview.ts
// so other signed cookies (e.g. tenant-flags-token.ts) can reuse the same
// tamper-evident encoding instead of re-implementing it.

function encodeUtf8(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function decodeUtf8(input: Uint8Array): string {
  return new TextDecoder().decode(input);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function base64UrlEncode(input: string): string {
  return bytesToBase64Url(encodeUtf8(input));
}

export function base64UrlDecode(input: string): string {
  return decodeUtf8(base64UrlToBytes(input));
}

async function getSigningKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(encodeUtf8(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export async function signPayload(secret: string, payloadB64: string): Promise<string> {
  const key = await getSigningKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, toArrayBuffer(encodeUtf8(payloadB64)));
  return bytesToBase64Url(new Uint8Array(signature));
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index] ^ b[index];
  }
  return diff === 0;
}

/** Signs `payload` as `base64url(json).base64url(hmac)`. */
export async function createSignedToken(secret: string, payload: unknown): Promise<string> {
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = await signPayload(secret, payloadB64);
  return `${payloadB64}.${signature}`;
}

/** Verifies signature only — caller is responsible for validating payload shape/expiry. */
export async function verifySignedToken(secret: string, token: string): Promise<unknown | null> {
  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) return null;

  const expectedSignature = await signPayload(secret, payloadB64);
  if (!constantTimeEqual(base64UrlToBytes(signature), base64UrlToBytes(expectedSignature))) {
    return null;
  }

  try {
    return JSON.parse(base64UrlDecode(payloadB64));
  } catch {
    return null;
  }
}
