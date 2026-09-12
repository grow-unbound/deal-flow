import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Turnstile CSP', () => {
  it('allows Cloudflare Turnstile to load, frame, and verify from auth pages', () => {
    const nextConfigSource = readFileSync(join(process.cwd(), 'next.config.js'), 'utf8');

    expect(nextConfigSource).toContain(
      '"script-src \'self\' \'unsafe-inline\' \'unsafe-eval\' https://maps.googleapis.com https://challenges.cloudflare.com"',
    );
    expect(nextConfigSource).toContain(
      '"frame-src \'self\' https://www.google.com https://challenges.cloudflare.com"',
    );
    expect(nextConfigSource).toContain(
      '"connect-src \'self\' https://*.supabase.co wss://*.supabase.co https://us.i.posthog.com https://us-assets.i.posthog.com https://maps.googleapis.com https://places.googleapis.com https://*.r2.cloudflarestorage.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://challenges.cloudflare.com"',
    );
  });
});
